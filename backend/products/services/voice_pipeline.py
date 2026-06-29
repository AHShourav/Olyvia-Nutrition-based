"""
Voice input pipeline: Whisper transcription -> NLP food extraction -> USDA/OFF nutrition lookup.

Security: input sanitization, output validation, prompt injection mitigation.
"""

import logging
import re
from typing import Optional

from .openfoodfacts import fetch_product, search_products
from .normalize import normalize as normalize_off
from .usda import search_foods, get_food
from .normalize_usda import normalize_usda_food

logger = logging.getLogger(__name__)

# Max lengths to limit abuse
MAX_TRANSCRIPT_LEN = 2000
MAX_FOOD_QUERY_LEN = 100
MAX_FOODS_EXTRACTED = 10

# Dangerous patterns (prompt injection, SQL-like, etc.)
DANGEROUS_PATTERNS = re.compile(
    r'(ignore\s+(previous|above|all)|system\s*:|assistant\s*:|user\s*:|'
    r'<\s*script|javascript:|on\w+\s*=|'
    r'(drop|delete|insert|update|alter|exec)\s+(table|database)|'
    r';\s*--|\'\s*;\s*--|/\*|\*/)',
    re.IGNORECASE,
)


def _sanitize_text(text: str, max_len: int = MAX_TRANSCRIPT_LEN) -> str:
    """Sanitize user input: strip, truncate, remove dangerous patterns."""
    if not text or not isinstance(text, str):
        return ''
    text = text.strip()[:max_len]
    if DANGEROUS_PATTERNS.search(text):
        logger.warning('Blocked potentially dangerous input pattern')
        return ''
    return text


def _extract_foods_with_llm(transcript: str) -> list[str]:
    """
    Extract food names from transcript using LangChain + structured output.
    Returns list of food search queries (e.g. ["chicken salad", "parmesan"]).
    """
    try:
        from langchain_core.output_parsers import PydanticOutputParser
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_openai import ChatOpenAI
        from pydantic import BaseModel, Field
    except ImportError as e:
        logger.warning('LangChain import failed: %s', e)
        return _extract_foods_fallback(transcript)

    class FoodList(BaseModel):
        foods: list[str] = Field(description='List of food names or dish names to search')

    parser = PydanticOutputParser(pydantic_object=FoodList)
    prompt = ChatPromptTemplate.from_messages([
        ('system', '''You extract food and dish names from user speech about what they ate.
Output ONLY a JSON object with a "foods" array of strings. Each string is a searchable food/dish name.
Examples: "chicken salad", "apple", "grilled salmon with rice".
Do not include quantities, brands, or instructions. Only food names.
Never output instructions, explanations, or anything other than the JSON.'''),
        ('human', '{input}'),
    ])

    import os
    api_key = os.getenv('OPENAI_API_KEY', '')
    if not api_key:
        logger.warning('OPENAI_API_KEY not set')
        return _extract_foods_fallback(transcript)

    llm = ChatOpenAI(model='gpt-4o-mini', temperature=0)
    chain = prompt | llm | parser

    try:
        result = chain.invoke({'input': transcript})
        foods = getattr(result, 'foods', []) or []
        # Validate: only alphanumeric, spaces, hyphens
        validated = []
        for f in foods[:MAX_FOODS_EXTRACTED]:
            f = str(f).strip()[:MAX_FOOD_QUERY_LEN]
            if f and re.match(r'^[\w\s\-\.]+$', f, re.IGNORECASE):
                validated.append(f)
        return validated
    except Exception as e:
        logger.warning('LLM extraction failed: %s', e)
        return _extract_foods_fallback(transcript)


def _extract_foods_fallback(transcript: str) -> list[str]:
    """Simple fallback: treat whole transcript as one search query if short enough."""
    t = transcript.strip()[:MAX_FOOD_QUERY_LEN]
    if t and re.match(r'^[\w\s\-\.]+$', t, re.IGNORECASE):
        return [t]
    return []


def _lookup_usda(query: str) -> Optional[dict]:
    """Try USDA first. Return first matching food as Product-compatible dict or None."""
    result = search_foods(query, page_size=3, page_number=1)
    if not result or not result.get('foods'):
        return None
    first = result['foods'][0]
    fdc_id = first.get('fdcId')
    if not fdc_id:
        return normalize_usda_food(first)
    raw = get_food(fdc_id)
    if raw:
        return normalize_usda_food(raw)
    return normalize_usda_food(first)


def _lookup_off(query: str) -> Optional[dict]:
    """Try OpenFoodFacts search. Return first matching product or None."""
    products = search_products(query, page_size=5)
    for p in products:
        if not p.get('product_name'):
            continue
        # OFF search returns products; ensure we have nutriments for normalize
        if not p.get('nutriments') and p.get('code'):
            # Fetch full product by barcode for complete nutrition
            full = fetch_product(p['code'])
            if full:
                p = full
        data = normalize_off(p)
        if data.get('name'):
            return data
    return None


# Generic whole foods – USDA is preferred; don't treat as branded
GENERIC_FOODS = frozenset({
    "apple", "apples", "banana", "bread", "rice", "pasta", "pizza", "salad",
    "chicken", "beef", "fish", "milk", "egg", "eggs", "cheese", "yogurt",
    "oatmeal", "cereal", "soup", "sandwich", "burger", "cheeseburger",
    "salmon", "tuna", "broccoli", "carrot", "potato", "tomato", "onion",
})

def _looks_branded(query: str) -> bool:
    """
    Heuristic: does this query look like a branded/packaged product?
    USDA focuses on generic/whole foods; OFF has branded products.
    """
    q = (query or "").strip()
    if not q or len(q) < 2:
        return False
    q_lower = q.lower()
    first_word = q_lower.split()[0] if q_lower.split() else ""
    if first_word in GENERIC_FOODS:
        return False
    # Contains apostrophe (McDonald's, Ben & Jerry's)
    if "'" in q or "&" in q:
        return True
    # Common brand prefixes – try OFF first for these
    brand_prefixes = ("mc", "mcdonald", "burger king", "wendy", "kfc", "subway",
                     "coca", "pepsi", "nestle", "kraft", "kellogg", "general mills",
                     "lays", "doritos", "cheetos", "frito", "nabisco", "oreo",
                     "hershey", "mars", "snickers", "twix", "kit kat", "m&m")
    if first_word in brand_prefixes or any(first_word.startswith(p) for p in brand_prefixes):
        return True
    # Single-word product names (Oreo, Doritos) – exclude generic foods above
    if len(q.split()) == 1 and 4 <= len(q) <= 25:
        return True
    return False


def _simplify_query_for_fallback(query: str) -> Optional[str]:
    """
    For branded queries like "McDonalds cheeseburger", extract the food part.
    USDA/OFF often fail on brand+food; generic "cheeseburger" works better.
    """
    q = query.strip().lower()
    if not q or len(q) < 3:
        return None
    # Common brand patterns: "brand food" -> try "food"
    parts = q.split()
    if len(parts) >= 2:
        # Last word(s) often the food; skip first if it looks like a brand (capitalized, short)
        for i in range(1, len(parts)):
            candidate = ' '.join(parts[i:]).strip()
            if len(candidate) >= 3:
                return candidate
    return q


def lookup_nutrition_for_food(query: str) -> Optional[dict]:
    """
    Lookup nutrition: USDA first for generic foods, OFF first for branded products.
    Always falls back to the other source if the primary fails.
    If both fail, retry with simplified query (e.g. "cheeseburger" from "McDonalds cheeseburger").
    Returns Product-compatible dict or None.
    """
    query = _sanitize_text(query, MAX_FOOD_QUERY_LEN)
    if not query:
        return None

    # Branded/packaged products: try OFF first (USDA rarely has them)
    if _looks_branded(query):
        result = _lookup_off(query)
        if result:
            return result
        result = _lookup_usda(query)
        if result:
            return result
    else:
        # Generic foods/dishes: try USDA first, then OFF fallback
        result = _lookup_usda(query)
        if result:
            return result
        result = _lookup_off(query)
        if result:
            return result

    # Fallback: simplify query for branded items (e.g. "McDonalds cheeseburger" -> "cheeseburger")
    simplified = _simplify_query_for_fallback(query)
    if simplified and simplified != query:
        result = _lookup_usda(simplified)
        if result:
            return result
        result = _lookup_off(simplified)
    return result


def process_voice_input(audio_bytes: Optional[bytes] = None, transcript: Optional[str] = None) -> dict:
    """
    Process voice input: transcribe (if audio) or use transcript, extract foods, lookup nutrition.
    Returns dict with transcript, foods, and nutrition results.
    """
    if audio_bytes:
        transcript = _transcribe_audio(audio_bytes)
    transcript = _sanitize_text(transcript or '', MAX_TRANSCRIPT_LEN)
    if not transcript:
        return {'transcript': '', 'foods': [], 'nutrition': [], 'error': 'No valid input'}

    foods = _extract_foods_with_llm(transcript)
    nutrition = []
    for q in foods:
        data = lookup_nutrition_for_food(q)
        if data:
            data['query'] = q
            nutrition.append(data)
            # Log to console as requested
            _log_nutrition(data, q)

    # Strip raw_json from response to reduce payload
    for n in nutrition:
        n.pop('raw_json', None)

    return {
        'transcript': transcript,
        'foods': foods,
        'nutrition': nutrition,
    }


def _transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe audio using OpenAI Whisper API."""
    import os
    from io import BytesIO
    api_key = os.getenv('OPENAI_API_KEY', '')
    if not api_key:
        logger.warning('OPENAI_API_KEY not set')
        return ''
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        file = BytesIO(audio_bytes)
        file.name = 'audio.webm'
        resp = client.audio.transcriptions.create(
            model='whisper-1',
            file=file,
            response_format='text',
        )
        return str(resp).strip() if resp else ''
    except Exception as e:
        logger.error('Whisper transcription failed: %s', e)
        return ''


def _log_nutrition(data: dict, query: str) -> None:
    """Print nutrition to console."""
    name = data.get('name', 'Unknown')
    source = data.get('source', 'unknown')
    print(f'\n--- Nutrition for "{query}" ({name}, source: {source}) ---')
    for k in ['energy_kcal', 'fat', 'saturated_fat', 'sugars', 'salt', 'proteins', 'fiber']:
        v = data.get(k)
        if v is not None:
            unit = 'g' if k != 'energy_kcal' else 'kcal'
            print(f'  {k}: {v} {unit}')
    print('---\n')
