"""
Aggregate FoodLog nutrients for a user by date.
"""

from datetime import date

from accounts.models import FoodLog, CustomUser

# All nutrients we store (from USDA/OFF). Keys match FoodLog.nutrients JSON.
NUTRIENT_KEYS = [
    'energy_kcal', 'fat', 'saturated_fat', 'trans_fat', 'sugars', 'salt',
    'proteins', 'fiber', 'carbs', 'cholesterol', 'sodium_mg',
    'calcium_mg', 'iron_mg', 'potassium_mg',
]


def get_nutrition_summary(user: CustomUser, for_date: date = None) -> dict:
    """
    Aggregate nutrients from FoodLog for the user on the given date.
    Returns all stored nutrients (fats, sodium, sugars, carbs, proteins, etc.).
    """
    if for_date is None:
        for_date = date.today()

    logs = FoodLog.objects.filter(user=user, logged_at__date=for_date)

    totals = {k: 0.0 for k in NUTRIENT_KEYS}
    totals['sodium'] = 0.0  # computed from salt or sodium_mg

    for log in logs:
        n = log.nutrients or {}
        for k in NUTRIENT_KEYS:
            v = n.get(k)
            if v is not None:
                totals[k] += float(v)
        # sodium (mg): prefer sodium_mg, else salt * 400
        salt = float(n.get('salt') or 0)
        sodium_mg = n.get('sodium_mg')
        if sodium_mg is not None:
            totals['sodium'] += float(sodium_mg)
        else:
            totals['sodium'] += salt * 400

    result = {k: round(totals[k], 1) for k in NUTRIENT_KEYS}
    result['sodium'] = round(totals['sodium'], 0)
    result['fats'] = result['fat']  # alias for dashboard
    return result
