"""
Log eaten nutrients for authenticated users.
"""

from typing import Optional

from accounts.models import FoodLog, CustomUser
from products.models import Product


def _nutrients_from_product(product: Product) -> dict:
    """Extract nutrient dict from Product for storage."""
    return {
        'energy_kcal': product.energy_kcal,
        'fat': product.fat,
        'saturated_fat': product.saturated_fat,
        'trans_fat': product.trans_fat,
        'sugars': product.sugars,
        'salt': product.salt,
        'proteins': product.proteins,
        'fiber': product.fiber,
        'carbs': product.carbs,
        'cholesterol': product.cholesterol,
        'sodium_mg': product.sodium_mg,
        'calcium_mg': product.calcium_mg,
        'iron_mg': product.iron_mg,
        'potassium_mg': product.potassium_mg,
    }


def _nutrients_from_dict(data: dict) -> dict:
    """Extract nutrient dict from API response (voice/image nutrition item)."""
    return {
        k: v for k, v in {
            'energy_kcal': data.get('energy_kcal'),
            'fat': data.get('fat'),
            'saturated_fat': data.get('saturated_fat'),
            'trans_fat': data.get('trans_fat'),
            'sugars': data.get('sugars'),
            'salt': data.get('salt'),
            'proteins': data.get('proteins'),
            'fiber': data.get('fiber'),
            'carbs': data.get('carbs'),
            'cholesterol': data.get('cholesterol'),
            'sodium_mg': data.get('sodium_mg'),
            'calcium_mg': data.get('calcium_mg'),
            'iron_mg': data.get('iron_mg'),
            'potassium_mg': data.get('potassium_mg'),
        }.items() if v is not None
    }


def log_food(
    user: CustomUser,
    food_name: str,
    source: str,
    nutrients: dict,
    product: Product = None,
    barcode: str = '',
) -> FoodLog:
    """Create a FoodLog entry for the user."""
    return FoodLog.objects.create(
        user=user,
        food_name=food_name,
        source=source,
        product=product,
        barcode=barcode or (product.barcode if product else ''),
        nutrients=nutrients,
    )


def log_product_for_user(user: CustomUser, product: Product, source: str) -> FoodLog:
    """Log a Product (barcode scan) for user."""
    nutrients = _nutrients_from_product(product)
    return log_food(
        user=user,
        food_name=product.name or f'Product {product.barcode}',
        source=source,
        nutrients=nutrients,
        product=product,
        barcode=product.barcode,
    )


def log_nutrition_for_user(user: CustomUser, nutrition_item: dict, source: str) -> FoodLog:
    """Log a nutrition item (from voice/image) for user."""
    nutrients = _nutrients_from_dict(nutrition_item)
    name = nutrition_item.get('name') or nutrition_item.get('query') or 'Unknown food'
    return log_food(
        user=user,
        food_name=name,
        source=source,
        nutrients=nutrients,
    )


def update_food_log(user: CustomUser, log_id: int, food_name: str, nutrients: dict) -> Optional[FoodLog]:
    """Update an existing FoodLog entry. Returns the log if found and owned by user, else None."""
    try:
        log = FoodLog.objects.get(id=log_id, user=user)
        log.food_name = food_name
        existing = dict(log.nutrients or {})
        existing.update({k: v for k, v in nutrients.items() if v is not None})
        log.nutrients = existing
        log.save(update_fields=['food_name', 'nutrients'])
        return log
    except FoodLog.DoesNotExist:
        return None
