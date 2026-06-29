"""
Image analysis pipeline: Vision labels -> food resolver -> nutrition.

Flow:
  1. Google Cloud Vision API detects labels (e.g. "chicken salad", "pizza", "Oreo")
  2. Labels are filtered to food-like items (score >= 0.5, not tableware/person)
  3. Top 5 candidates are resolved via lookup_nutrition_for_food():
     - Branded products (Oreo, Coca Cola): OpenFoodFacts first, USDA fallback
     - Generic foods (apple, chicken salad): USDA first, OpenFoodFacts fallback
  4. Results cached by image hash (7 days) to reduce API cost.
"""

import hashlib
import logging
from typing import Optional

from django.core.cache import cache

from .vision import detect_food_labels
from .food_resolver import resolve_labels_to_nutrition

logger = logging.getLogger(__name__)

# Cache TTL: 7 days (same image = same result)
IMAGE_CACHE_TTL = 60 * 60 * 24 * 7


def _image_cache_key(image_bytes: bytes) -> str:
    """Cache key from image content hash."""
    h = hashlib.sha256(image_bytes).hexdigest()
    return f"olyvia:image:{h}"


def process_image(image_bytes: bytes) -> dict:
    """
    Analyze image: detect labels, resolve to food, return nutrition.
    Returns dict compatible with voice pipeline: labels, nutrition, resolved_food.
    Caches by image hash.
    """
    if not image_bytes or len(image_bytes) < 100:
        return {"labels": [], "nutrition": [], "error": "Image too small or empty"}

    cache_key = _image_cache_key(image_bytes)
    cached = cache.get(cache_key)
    if cached is not None:
        logger.info("Image analysis cache hit")
        return cached

    try:
        labels = detect_food_labels(image_bytes, max_results=10)
    except Exception as e:
        logger.error("Vision API failed: %s", e)
        return {"labels": [], "nutrition": [], "error": str(e)}

    if not labels:
        return {"labels": [], "nutrition": [], "error": "No labels detected"}

    nutrition = resolve_labels_to_nutrition(labels)

    # Build response (same structure as voice for frontend compatibility)
    result = {
        "labels": [{"description": l["description"], "score": l["score"]} for l in labels[:10]],
        "nutrition": nutrition,
    }

    # Add resolved_food for first match (optional, for UI)
    if nutrition:
        first = nutrition[0]
        result["resolved_food"] = {
            "source": first.get("source", "unknown"),
            "name": first.get("name", ""),
            "confidence": first.get("confidence", 0),
        }
        # Strip raw_json from response
        for n in result["nutrition"]:
            n.pop("raw_json", None)

    cache.set(cache_key, result, IMAGE_CACHE_TTL)
    return result
