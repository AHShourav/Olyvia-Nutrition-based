"""
Normalise USDA FoodData Central API responses into Product model fields.

USDA nutrient IDs (see https://fdc.nal.usda.gov/):
  203: Protein (g)
  204: Total fat (g)
  205: Carbohydrate (g)
  208: Energy (kcal)
  269: Sugars (g)
  291: Fiber (g)
  307: Sodium (mg) -> convert to salt (g): NaCl ≈ 2.5 * Na, so salt_g ≈ sodium_mg / 400
  606: Saturated fat (g)

USDA data can be per serving or per 100g; we use values as returned.
"""

# Nutrient ID -> Product model field (see https://fdc.nal.usda.gov/)
USDA_NUTRIENT_MAP = {
    203: 'proteins',       # Protein (g)
    204: 'fat',            # Total fat (g)
    205: 'carbs',          # Carbohydrate (g)
    208: 'energy_kcal',    # Energy (kcal)
    269: 'sugars',        # Sugars (g)
    291: 'fiber',         # Fiber (g)
    301: 'calcium_mg',    # Calcium (mg)
    303: 'iron_mg',       # Iron (mg)
    306: 'potassium_mg',  # Potassium (mg)
    307: 'salt',          # Sodium (mg) -> convert to salt (g)
    601: 'cholesterol',   # Cholesterol (mg)
    605: 'trans_fat',     # Trans fatty acids (g)
    606: 'saturated_fat', # Saturated fat (g)
}


def _extract_nutrients(food_nutrients: list) -> dict:
    """Extract nutrient values from foodNutrients array."""
    result = {}
    for fn in food_nutrients or []:
        # AbridgedFoodNutrient: number (nutrient type id), amount
        # FoodNutrient: nutrient.number or nutrient.id
        nut = fn.get('nutrient', {})
        num = fn.get('number') or nut.get('number') or nut.get('id')
        if num is None:
            continue
        try:
            num = int(num) if not isinstance(num, int) else num
        except (TypeError, ValueError):
            continue
        field = USDA_NUTRIENT_MAP.get(num)
        if field is None:
            continue
        amount = fn.get('amount')
        if amount is None:
            continue
        if field == 'salt' and num == 307:
            result['sodium_mg'] = float(amount)
            amount = amount / 400.0  # Sodium mg -> salt g
        result[field] = float(amount)
    return result


def normalize_usda_food(raw: dict) -> dict:
    """
    Accept a raw USDA food item (from search or get_food) and return a dict
    compatible with Product model (barcode for USDA = usda-{fdc_id}).
    """
    fdc_id = raw.get('fdcId')
    if fdc_id is None:
        return {}
    barcode = f'usda-{fdc_id}'

    name = raw.get('description', '')
    brand = raw.get('brandOwner', '') or raw.get('brandName', '') or ''

    nutrients = _extract_nutrients(raw.get('foodNutrients', []))

    # labelNutrients (Branded Foods) can override per-serving values
    label = raw.get('labelNutrients', {})
    if label:
        for key, obj in label.items():
            if isinstance(obj, dict) and 'value' in obj:
                val = obj.get('value')
                if val is not None:
                    mapping = {
                        'fat': 'fat',
                        'saturatedFat': 'saturated_fat',
                        'sugars': 'sugars',
                        'sodium': 'salt',
                        'protein': 'proteins',
                        'fiber': 'fiber',
                        'calories': 'energy_kcal',
                    }
                    field = mapping.get(key)
                    if field and field not in nutrients:
                        if field == 'salt':
                            val = val / 400.0  # mg -> g
                        nutrients[field] = float(val)

    return {
        'barcode': barcode,
        'name': name,
        'brand': brand,
        'image_url': '',
        'nutriscore_grade': '',
        'nova_group': None,
        'energy_kcal': nutrients.get('energy_kcal'),
        'fat': nutrients.get('fat'),
        'saturated_fat': nutrients.get('saturated_fat'),
        'trans_fat': nutrients.get('trans_fat'),
        'sugars': nutrients.get('sugars'),
        'salt': nutrients.get('salt'),
        'proteins': nutrients.get('proteins'),
        'fiber': nutrients.get('fiber'),
        'carbs': nutrients.get('carbs'),
        'cholesterol': nutrients.get('cholesterol'),
        'sodium_mg': nutrients.get('sodium_mg'),
        'calcium_mg': nutrients.get('calcium_mg'),
        'iron_mg': nutrients.get('iron_mg'),
        'potassium_mg': nutrients.get('potassium_mg'),
        'ingredients_text': raw.get('ingredients', ''),
        'categories': raw.get('foodCategory', '') or raw.get('brandedFoodCategory', '') or '',
        'source': 'usda',
        'raw_json': raw,
    }
