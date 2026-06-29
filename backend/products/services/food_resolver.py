"""
Resolve Vision API labels to food items and nutrition via USDA / OpenFoodFacts.

Flow:
  1. Vision API detects labels (e.g. "chicken salad", "Oreo")
  2. For each food-like label, lookup_nutrition_for_food() is called
  3. Lookup: branded products -> OFF first, then USDA fallback
             generic foods -> USDA first, then OFF fallback
  4. If both fail, simplified query (e.g. "cheeseburger" from "McDonalds cheeseburger")
     is tried with USDA then OFF
"""

import logging
import re
from typing import Optional

from .voice_pipeline import lookup_nutrition_for_food

logger = logging.getLogger(__name__)

# Food-related label keywords (Vision often returns these)
FOOD_INDICATORS = {
    "food", "dish", "cuisine", "meal", "recipe", "ingredient",
    "fruit", "vegetable", "meat", "dairy", "grain", "bread",
    "salad", "pizza", "pasta", "rice", "soup", "sandwich",
    "breakfast", "lunch", "dinner", "snack", "dessert",
}

# Non-food labels to skip
SKIP_LABELS = {
    "person", "people", "hand", "face", "finger", "table",
    "furniture", "indoor", "outdoor", "room", "kitchen",
    "plate", "bowl", "cutlery", "spoon", "fork", "knife",
    "tableware", "ceramic", "glass", "container",
}

# Min score to consider a label
MIN_LABEL_SCORE = 0.5


def _is_food_like(description: str) -> bool:
    """Heuristic: does this label look like a food/dish?"""
    d = description.lower().strip()
    if not d or len(d) < 2:
        return False
    if d in SKIP_LABELS:
        return False
    if d in FOOD_INDICATORS:
        return True
    # Single-word food names (apple, pizza, etc.)
    if re.match(r"^[a-z]+$", d) and len(d) >= 3:
        return True
    # Multi-word: "chicken salad", "grilled salmon"
    words = set(d.split())
    if words & FOOD_INDICATORS:
        return True
    return False


def _normalize_label(desc: str) -> str:
    """Clean label for search: strip, truncate, allow only safe chars."""
    s = (desc or "").strip()[:80]
    if not s:
        return ""
    # Allow alphanumeric, spaces, hyphens, apostrophes
    s = re.sub(r"[^\w\s\-']", "", s, flags=re.IGNORECASE)
    return s.strip()


def resolve_labels_to_nutrition(labels: list[dict]) -> list[dict]:
    """
    Resolve Vision labels to nutrition data.
    Tries labels in score order; returns first successful match per unique food.
    Returns list of Product-compatible dicts with nutrition.
    """
    seen_queries = set()
    nutrition = []

    # Sort by score desc, filter food-like
    sorted_labels = sorted(
        [l for l in labels if l.get("score", 0) >= MIN_LABEL_SCORE and _is_food_like(l.get("description", ""))],
        key=lambda x: x.get("score", 0),
        reverse=True,
    )

    for label in sorted_labels[:5]:  # Top 5 candidates
        desc = _normalize_label(label.get("description", ""))
        if not desc or desc in seen_queries:
            continue
        seen_queries.add(desc)

        data = lookup_nutrition_for_food(desc)
        if data:
            data["query"] = desc
            data["confidence"] = label.get("score", 0)
            nutrition.append(data)
            logger.info("Resolved label %r -> %s (score %.2f)", desc, data.get("name"), label.get("score"))

    return nutrition
