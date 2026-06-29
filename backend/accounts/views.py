from django.contrib.auth import get_user_model
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile
from .serializers import RegisterSerializer, UserSerializer, ProfileSerializer
from .services.nutrition_summary import get_nutrition_summary
from .services.stats_dashboard import get_stats_dashboard

User = get_user_model()


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """POST /api/auth/register/"""
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    refresh = RefreshToken.for_user(user)
    profile = user.profile
    return Response(
        {
            'user': UserSerializer(user).data,
            'profile': ProfileSerializer(profile).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """POST /api/auth/login/"""
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '')

    if not email or not password:
        return Response(
            {'detail': 'Email and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response(
            {'detail': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.check_password(password):
        return Response(
            {'detail': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {'detail': 'Account is disabled.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    refresh = RefreshToken.for_user(user)
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        profile = UserProfile.objects.create(user=user)

    return Response({
        'user': UserSerializer(user).data,
        'profile': ProfileSerializer(profile).data,
        'tokens': {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        },
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """POST /api/auth/logout/ — blacklist the refresh token."""
    refresh_token = request.data.get('refresh')
    if refresh_token:
        try:
            RefreshToken(refresh_token).blacklist()
        except Exception:
            pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me(request):
    """
    GET  /api/auth/me/ — return current user + profile.
    PATCH /api/auth/me/ — update profile (diet, allergies, goal, onboarding_completed).
    """
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)

    if request.method == 'GET':
        return Response({
            'user': UserSerializer(user).data,
            'profile': ProfileSerializer(profile).data,
        })

    # PATCH
    user_data = {}
    if 'full_name' in request.data:
        user_data['full_name'] = request.data['full_name']
    if user_data:
        user_ser = UserSerializer(user, data=user_data, partial=True)
        user_ser.is_valid(raise_exception=True)
        user_ser.save()

    profile_ser = ProfileSerializer(profile, data=request.data, partial=True)
    profile_ser.is_valid(raise_exception=True)
    profile_ser.save()

    return Response({
        'user': UserSerializer(user).data,
        'profile': ProfileSerializer(profile).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def avatar_serve(request):
    """GET /api/auth/me/avatar/ — return profile picture as image/jpeg."""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    if not profile.profile_avatar:
        return Response(status=status.HTTP_404_NOT_FOUND)
    from django.http import HttpResponse
    return HttpResponse(profile.profile_avatar, content_type='image/jpeg')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def avatar_upload(request):
    """POST /api/auth/me/avatar/ — upload profile picture (multipart, field: avatar)."""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    avatar_file = request.FILES.get('avatar') or request.FILES.get('image')
    if not avatar_file:
        return Response(
            {'detail': 'No file. Send multipart with field "avatar".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    max_size = 512 * 1024  # 512KB
    if avatar_file.size > max_size:
        return Response(
            {'detail': 'Image too large. Max 512KB.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        from PIL import Image
        import io
        img = Image.open(avatar_file).convert('RGB')
        thumb_method = getattr(Image, 'Resampling', Image).LANCZOS if hasattr(Image, 'Resampling') else Image.LANCZOS
        img.thumbnail((400, 400), thumb_method)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85)
        profile.profile_avatar = buf.getvalue()
        profile.save(update_fields=['profile_avatar'])
    except Exception as e:
        return Response(
            {'detail': f'Invalid image: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({'profile_has_avatar': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def nutrition_summary(request):
    """
    GET /api/auth/nutrition-summary/ — aggregated nutrients from FoodLog for today.
    Query: ?date=YYYY-MM-DD (optional, defaults to today).
    """
    from datetime import datetime
    date_str = request.query_params.get('date')
    if date_str:
        try:
            for_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            for_date = None
    else:
        for_date = None

    summary = get_nutrition_summary(request.user, for_date)
    return Response(summary)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def food_log_list(request):
    """
    GET /api/auth/food-log/ — list FoodLog entries for the user.
    Query: ?limit=50 (default 50), ?date=YYYY-MM-DD (optional, filter by date).
    """
    from datetime import datetime
    from accounts.models import FoodLog
    from accounts.services.stats_dashboard import _get_profile_dict
    from products.services.rules_engine import evaluate

    limit = min(int(request.query_params.get('limit', 50)), 100)
    date_str = request.query_params.get('date')

    if date_str:
        try:
            for_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            qs = FoodLog.objects.filter(user=request.user, logged_at__date=for_date).select_related('product').order_by('-logged_at')[:limit]
        except ValueError:
            qs = FoodLog.objects.filter(user=request.user).select_related('product').order_by('-logged_at')[:limit]
    else:
        qs = FoodLog.objects.filter(user=request.user).select_related('product').order_by('-logged_at')[:limit]

    profile = _get_profile_dict(request.user)
    items = []
    for log in qs:
        n = log.nutrients or {}
        sodium = n.get('sodium_mg')
        if sodium is None and n.get('salt') is not None:
            sodium = float(n.get('salt', 0)) * 400
        nutrients_dict = {k: v for k, v in n.items() if v is not None}
        eval_result = evaluate(nutrients_dict, profile)
        items.append({
            'id': log.id,
            'food_name': log.food_name,
            'source': log.source,
            'logged_at': log.logged_at.isoformat(),
            'image_url': log.product.image_url if log.product else '',
            'verdict': eval_result['verdict'],
            'verdict_label': eval_result['verdict_label'],
            'verdict_reason': eval_result['reason'],
            'nutrients': {
                'energy_kcal': n.get('energy_kcal'),
                'proteins': n.get('proteins'),
                'sugars': n.get('sugars'),
                'sodium_mg': sodium,
                'fat': n.get('fat'),
                'carbs': n.get('carbs'),
                'saturated_fat': n.get('saturated_fat'),
                'fiber': n.get('fiber'),
            },
        })
    return Response({'items': items})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stats_dashboard(request):
    """
    GET /api/auth/stats-dashboard/ — full stats: today summary, health risk, trends, insights.
    Query: ?date=YYYY-MM-DD (optional).
    """
    from datetime import datetime
    date_str = request.query_params.get('date')
    if date_str:
        try:
            for_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            for_date = None
    else:
        for_date = None

    data = get_stats_dashboard(request.user, for_date)
    return Response(data)


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fix_food_results(request):
    """
    POST /api/auth/fix-food-results
    Requires auth. Accepts: title, nutrients, user_fix, optional food_log_id.
    Uses Groq/OpenAI to fix; when food_log_id provided, updates FoodLog.
    """
    import logging
    logger = logging.getLogger(__name__)
    try:
        from accounts.services.food_log import update_food_log
        from accounts.services.stats_dashboard import _get_profile_dict
        from products.services.fix_food_results import fix_food_results as fix_service
        from products.services.rules_engine import evaluate

        if not request.data or not isinstance(request.data, dict):
            return Response(
                {'detail': 'Expected JSON body.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        title = (request.data.get('title') or request.data.get('name') or '').strip()
        nutrients = request.data.get('nutrients') or {}
        user_fix = (request.data.get('user_fix') or request.data.get('fix') or '').strip()
        food_log_id = request.data.get('food_log_id')
        if not title or not user_fix:
            return Response(
                {'detail': 'Provide "title" and "user_fix".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(nutrients, dict):
            nutrients = {}
        result, err = fix_service(title, nutrients, user_fix)
        if not result:
            return Response(
                {'detail': err or 'Could not process fix. Try again.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        profile = _get_profile_dict(request.user)
        nutrients_for_eval = {
            'energy_kcal': result.get('energy_kcal'),
            'proteins': result.get('proteins'),
            'carbs': result.get('carbs'),
            'fat': result.get('fat'),
            'sugars': result.get('sugars'),
            'sodium_mg': result.get('sodium_mg'),
        }
        eval_result = evaluate(nutrients_for_eval, profile)
        result['verdict'] = eval_result['verdict']
        result['verdict_label'] = eval_result['verdict_label']
        result['verdict_reason'] = eval_result['reason']

        if food_log_id:
            try:
                log_id = int(food_log_id)
                nutrients_to_save = {k: v for k, v in nutrients_for_eval.items() if v is not None}
                if update_food_log(request.user, log_id, result['name'], nutrients_to_save):
                    result['food_log_id'] = log_id
            except (TypeError, ValueError):
                pass

        return Response(result, status=status.HTTP_200_OK)
    except Exception as e:
        logger.exception('fix_food_results error: %s', e)
        return Response(
            {'detail': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
