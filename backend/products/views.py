from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Product
from .serializers import ProductSerializer
from .services.openfoodfacts import fetch_product
from .services.normalize import normalize
from .services.usda import search_foods, get_food
from .services.normalize_usda import normalize_usda_food
from .services.voice_pipeline import process_voice_input
from .services.image_pipeline import process_image
from .services.rules_engine import evaluate, nutrients_from_product, nutrients_from_dict


@csrf_exempt
@require_http_methods(['POST'])
@api_view(['POST'])
def scan_barcode(request):
    barcode = None
    if request.data and isinstance(request.data, dict):
        barcode = (request.data.get('barcode') or '').strip()
    if not barcode:
        return Response(
            {'detail': 'Missing or empty barcode.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 1. Try local cache (DB) first
    try:
        product = Product.objects.get(barcode=barcode)
        data = dict(ProductSerializer(product).data)
        if request.user.is_authenticated:
            try:
                from accounts.services.food_log import log_product_for_user
                log_entry = log_product_for_user(request.user, product, 'barcode')
                data['food_log_id'] = log_entry.id
            except Exception:
                pass
        _add_verdict_to_product_response(data, product, request)
        return Response(data, status=status.HTTP_200_OK)
    except Product.DoesNotExist:
        pass

    # 2. Fetch from Open Food Facts
    raw = fetch_product(barcode)
    if raw is None:
        return Response(
            {
                'detail': 'Product not found. The barcode may be incorrect or not in the Open Food Facts database.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    # 3. Normalise and cache in DB (update_or_create avoids IntegrityError when product already exists)
    data = normalize(raw)
    barcode_val = data.pop('barcode', '')
    product, created = Product.objects.update_or_create(
        barcode=barcode_val,
        defaults=data,
    )

    # 4. Log for authenticated user
    data = dict(ProductSerializer(product).data)
    if request.user.is_authenticated:
        try:
            from accounts.services.food_log import log_product_for_user
            log_entry = log_product_for_user(request.user, product, 'barcode')
            data['food_log_id'] = log_entry.id
        except Exception:
            pass

    _add_verdict_to_product_response(data, product, request)
    return Response(
        data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(['GET'])
def product_by_barcode(request, barcode):
    # 1. Try local cache first
    try:
        product = Product.objects.get(barcode=barcode)
        return Response(ProductSerializer(product).data)
    except Product.DoesNotExist:
        pass

    # 2. Fetch from external API
    raw = fetch_product(barcode)
    if raw is None:
        return Response(
            {'detail': 'Product not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # 3. Normalise and persist (update_or_create avoids IntegrityError)
    data = normalize(raw)
    barcode_val = data.pop('barcode', '')
    product, _ = Product.objects.update_or_create(
        barcode=barcode_val,
        defaults=data,
    )
    return Response(
        ProductSerializer(product).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
def search_foods_by_name(request):
    """
    GET /api/foods/search?q=chicken%20salad&page_size=25&page=1
    Search USDA FoodData Central by food name. Returns list of Product-like items.
    """
    query = (request.GET.get('q') or request.GET.get('query') or '').strip()
    if not query:
        return Response(
            {'detail': 'Missing query parameter "q".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    page_size = min(max(int(request.GET.get('page_size', 25)), 1), 200)
    page = max(int(request.GET.get('page', 1)), 1)

    result = search_foods(query, page_size=page_size, page_number=page)
    if result is None:
        return Response(
            {'detail': 'USDA API unavailable. Check USDA_API_KEY and try again.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    foods = result.get('foods', [])
    total_hits = result.get('totalHits', 0)
    total_pages = result.get('totalPages', 1)
    current_page = result.get('currentPage', 1)

    # Normalise each search result to Product-compatible dict (no DB cache for search)
    items = []
    for raw in foods:
        data = normalize_usda_food(raw)
        if data:
            items.append(data)

    return Response({
        'totalHits': total_hits,
        'totalPages': total_pages,
        'currentPage': current_page,
        'foods': items,
    })


@api_view(['GET'])
def food_by_fdc_id(request, fdc_id):
    """
    GET /api/foods/<fdc_id>/
    Fetch a single food by USDA FDC ID. Caches in Product (barcode=usda-{fdc_id}).
    """
    try:
        fdc_id = int(fdc_id)
    except (TypeError, ValueError):
        return Response(
            {'detail': 'Invalid FDC ID.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    barcode = f'usda-{fdc_id}'

    # 1. Try local cache first
    try:
        product = Product.objects.get(barcode=barcode)
        return Response(ProductSerializer(product).data)
    except Product.DoesNotExist:
        pass

    # 2. Fetch from USDA API
    raw = get_food(fdc_id)
    if raw is None:
        return Response(
            {'detail': 'Food not found in USDA database.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # 3. Normalise and cache
    data = normalize_usda_food(raw)
    barcode_val = data.pop('barcode', '')
    product, created = Product.objects.update_or_create(
        barcode=barcode_val,
        defaults=data,
    )
    return Response(
        ProductSerializer(product).data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


def _get_profile_dict(user):
    """Get profile as dict for rules engine."""
    try:
        from accounts.models import UserProfile
        p = UserProfile.objects.get(user=user)
        return {
            'goal_primary': p.goal_primary or '',
            'goal_commitment': p.goal_commitment or '',
            'nutrition_rules': p.nutrition_rules or [],
            'condition_rules': p.condition_rules or [],
            'diet_preferences': p.diet_preferences or [],
        }
    except Exception:
        return None


def _add_verdict_to_product_response(data: dict, product, request):
    """Add verdict fields to product response."""
    profile = _get_profile_dict(request.user) if request.user.is_authenticated else None
    nutrients = nutrients_from_product(product)
    result = evaluate(nutrients, profile)
    data['verdict'] = result['verdict']
    data['verdict_label'] = result['verdict_label']
    data['verdict_reason'] = result['reason']


# Max audio file size: 25 MB (Whisper limit)
MAX_AUDIO_SIZE = 25 * 1024 * 1024

# Max image size: 20 MB (Vision API limit)
MAX_IMAGE_SIZE = 20 * 1024 * 1024


@csrf_exempt
@api_view(['POST'])
def voice_analyze(request):
    """
    POST /api/voice-analyze
    Accepts either:
    - multipart/form-data: 'audio' file (webm, mp3, wav, etc.)
    - application/json: {"text": "chicken salad with parmesan"}
    Transcribes (if audio), extracts food names via LLM, looks up USDA then OFF.
    Returns transcript, foods, nutrition. Logs nutrition to console.
    """
    transcript = None
    audio_bytes = None

    if request.content_type and 'multipart/form-data' in request.content_type:
        audio_file = request.FILES.get('audio')
        if audio_file:
            if audio_file.size > MAX_AUDIO_SIZE:
                return Response(
                    {'detail': 'Audio file too large (max 25 MB).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            content_type = getattr(audio_file, 'content_type', '') or ''
            if content_type and not content_type.startswith('audio/'):
                return Response(
                    {'detail': 'Invalid file type. Expected audio.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            audio_bytes = audio_file.read()
    elif request.data and isinstance(request.data, dict):
        transcript = (request.data.get('text') or request.data.get('transcript') or '').strip()

    if not audio_bytes and not transcript:
        return Response(
            {'detail': 'Provide either "audio" file or "text" in JSON body.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    result = process_voice_input(audio_bytes=audio_bytes, transcript=transcript)

    profile = _get_profile_dict(request.user) if request.user.is_authenticated else None
    if result.get('nutrition'):
        for item in result['nutrition']:
            nutrients = nutrients_from_dict(item)
            eval_result = evaluate(nutrients, profile)
            item['verdict'] = eval_result['verdict']
            item['verdict_label'] = eval_result['verdict_label']
            item['verdict_reason'] = eval_result['reason']
        if request.user.is_authenticated:
            try:
                from accounts.services.food_log import log_nutrition_for_user
                for item in result['nutrition']:
                    log_entry = log_nutrition_for_user(request.user, item, 'voice')
                    item['food_log_id'] = log_entry.id
            except Exception:
                pass

    return Response(result)


@csrf_exempt
@api_view(['POST'])
def analyze_image(request):
    """
    POST /api/analyze-image
    Accepts multipart/form-data with 'image' file (jpeg, png, webp, gif).
    Uses Google Vision for labels, resolves to food via USDA/OFF.
    Returns labels, nutrition (same format as voice-analyze).
    """
    if not request.content_type or 'multipart/form-data' not in request.content_type:
        return Response(
            {'detail': 'Expected multipart/form-data with image file.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    image_file = request.FILES.get('image')
    if not image_file:
        return Response(
            {'detail': 'Missing "image" file in request.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if image_file.size > MAX_IMAGE_SIZE:
        return Response(
            {'detail': 'Image too large (max 20 MB).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    content_type = getattr(image_file, 'content_type', '') or ''
    if content_type and not content_type.startswith('image/'):
        return Response(
            {'detail': 'Invalid file type. Expected image (jpeg, png, webp, gif).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    image_bytes = image_file.read()
    result = process_image(image_bytes)

    profile = _get_profile_dict(request.user) if request.user.is_authenticated else None
    if result.get('nutrition'):
        for item in result['nutrition']:
            nutrients = nutrients_from_dict(item)
            eval_result = evaluate(nutrients, profile)
            item['verdict'] = eval_result['verdict']
            item['verdict_label'] = eval_result['verdict_label']
            item['verdict_reason'] = eval_result['reason']
        if request.user.is_authenticated:
            try:
                from accounts.services.food_log import log_nutrition_for_user
                for item in result['nutrition']:
                    log_entry = log_nutrition_for_user(request.user, item, 'image')
                    item['food_log_id'] = log_entry.id
            except Exception:
                pass

    return Response(result)


