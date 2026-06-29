"""
Normalise raw OpenFoodFacts JSON into a flat dict that maps directly
onto the Product model fields.
"""


def _get(data: dict, *keys, default=None):
    """Safely traverse nested dicts."""
    for key in keys:
        if isinstance(data, dict):
            data = data.get(key, default)
        else:
            return default
    return data


def normalize(raw: dict) -> dict:
    """
    Accept a raw OpenFoodFacts product dict and return a dict
    ready to be unpacked into Product.objects.create(**result).
    """
    nutriments = raw.get('nutriments', {})
    sodium_mg = nutriments.get('sodium_100g')
    if sodium_mg is not None:
        sodium_mg = float(sodium_mg) * 1000  # OFF stores sodium in g per 100g -> mg

    return {
        'barcode': raw.get('code', ''),
        'name': raw.get('product_name', ''),
        'brand': raw.get('brands', ''),
        'image_url': raw.get('image_url', ''),
        'nutriscore_grade': raw.get('nutriscore_grade', ''),
        'nova_group': raw.get('nova_group'),
        'energy_kcal': nutriments.get('energy-kcal_100g'),
        'fat': nutriments.get('fat_100g'),
        'saturated_fat': nutriments.get('saturated-fat_100g'),
        'trans_fat': nutriments.get('trans-fat_100g'),
        'sugars': nutriments.get('sugars_100g'),
        'salt': nutriments.get('salt_100g'),
        'proteins': nutriments.get('proteins_100g'),
        'fiber': nutriments.get('fiber_100g'),
        'carbs': nutriments.get('carbohydrates_100g'),
        'cholesterol': nutriments.get('cholesterol_100g'),
        'sodium_mg': sodium_mg,
        'calcium_mg': nutriments.get('calcium_100g'),
        'iron_mg': nutriments.get('iron_100g'),
        'potassium_mg': nutriments.get('potassium_100g'),
        'ingredients_text': raw.get('ingredients_text', ''),
        'categories': raw.get('categories', ''),
        'source': 'openfoodfacts',
        'raw_json': raw,
    }
