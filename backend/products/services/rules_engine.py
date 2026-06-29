"""
Rules engine: evaluates product nutrients against user profile.
Returns verdict (safe, caution, avoid), reason, and triggered rules.
"""
from __future__ import annotations

from typing import Optional

# Thresholds per 100g. very_strict = tightest, mild = loosest.
# Based on WHO/guideline patterns. Values in g unless noted.
THRESHOLDS = {
    'sugar': {
        'very_strict': 6,
        'strict': 10,
        'moderate': 15,
        'mild': 22.5,
    },
    'sodium': {
        'very_strict': 300,
        'strict': 400,
        'moderate': 600,
        'mild': 800,
    },
    'saturated_fat': {
        'very_strict': 3,
        'strict': 5,
        'moderate': 10,
        'mild': 15,
    },
    'ultra_processed': {
        'very_strict': 1,
        'strict': 2,
        'moderate': 3,
        'mild': 4,
    },
    'artificial_additives': {
        'very_strict': 1,
        'strict': 2,
        'moderate': 3,
        'mild': 4,
    },
}

# goal_primary can imply extra rules or stricter defaults
GOAL_IMPLIED_RULES = {
    'reduce_sugar': [{'type': 'sugar', 'strictness': 'strict'}],
    'reduce_sodium': [{'type': 'sodium', 'strictness': 'strict'}],
    'lose_weight': [{'type': 'saturated_fat', 'strictness': 'moderate'}],
    'build_muscle': [{'type': 'saturated_fat', 'strictness': 'mild'}],
    'improve_energy': [{'type': 'sugar', 'strictness': 'moderate'}],
    'eat_cleaner': [{'type': 'ultra_processed', 'strictness': 'moderate'}],
    'just_curious': [],
}

VERDICT_SAFE = 'safe'
VERDICT_CAUTION = 'caution'
VERDICT_AVOID = 'avoid'

VERDICT_LABELS = {
    VERDICT_SAFE: 'Good',
    VERDICT_CAUTION: 'Caution',
    VERDICT_AVOID: 'Avoid',
}


def _get_sodium_mg(nutrients: dict) -> float:
    """Get sodium in mg from nutrients (salt or sodium_mg)."""
    sodium = nutrients.get('sodium_mg')
    if sodium is not None:
        return float(sodium)
    salt = nutrients.get('salt')
    if salt is not None:
        return float(salt) * 400
    return 0


def _get_nova(nutrients: dict) -> Optional[int]:
    """Get nova_group from nutrients."""
    v = nutrients.get('nova_group')
    if v is not None:
        try:
            return int(v)
        except (TypeError, ValueError):
            pass
    return None


# Health condition -> nutrient rules. condition_rules override with user's strictness.
CONDITION_NUTRIENT_MAP = {
    'hypertension': 'sodium',
    'diabetes': 'sugar',
    'high_cholesterol': 'saturated_fat',
    'kidney': 'sodium',
    'heart': 'saturated_fat',  # also sodium; we add both
    'digestive': 'ultra_processed',
}

def _build_active_rules(profile: dict) -> list[dict]:
    """Build the full rule set from profile (nutrition_rules + condition_rules + goal_implied)."""
    rules = [r for r in (profile.get('nutrition_rules') or []) if isinstance(r, dict) and r.get('type')]
    existing_types = {r['type'] for r in rules}

    # Condition rules (from health conditions) – highest priority
    for cr in profile.get('condition_rules') or []:
        cond = cr.get('condition', '')
        sodium_s = cr.get('sodium_strictness')
        sugar_s = cr.get('sugar_strictness')
        satfat_s = cr.get('saturated_fat_strictness')
        ultra_s = cr.get('ultra_processed_strictness')
        if cond == 'hypertension' and sodium_s and 'sodium' not in existing_types:
            rules.append({'type': 'sodium', 'strictness': sodium_s})
            existing_types.add('sodium')
        elif cond == 'diabetes' and sugar_s and 'sugar' not in existing_types:
            rules.append({'type': 'sugar', 'strictness': sugar_s})
            existing_types.add('sugar')
        elif cond == 'high_cholesterol' and satfat_s and 'saturated_fat' not in existing_types:
            rules.append({'type': 'saturated_fat', 'strictness': satfat_s})
            existing_types.add('saturated_fat')
        elif cond == 'kidney' and sodium_s and 'sodium' not in existing_types:
            rules.append({'type': 'sodium', 'strictness': sodium_s})
            existing_types.add('sodium')
        elif cond == 'heart':
            if satfat_s and 'saturated_fat' not in existing_types:
                rules.append({'type': 'saturated_fat', 'strictness': satfat_s})
                existing_types.add('saturated_fat')
            if sodium_s and 'sodium' not in existing_types:
                rules.append({'type': 'sodium', 'strictness': sodium_s})
                existing_types.add('sodium')
        elif cond == 'digestive' and ultra_s and 'ultra_processed' not in existing_types:
            rules.append({'type': 'ultra_processed', 'strictness': ultra_s})
            existing_types.add('ultra_processed')

    # Goal-implied rules
    goal = (profile.get('goal_primary') or '').strip()
    implied = GOAL_IMPLIED_RULES.get(goal, [])
    for ir in implied:
        if ir['type'] not in existing_types:
            rules.append(ir)
            existing_types.add(ir['type'])
    return rules


def _check_rule(rule_type: str, strictness: str, nutrients: dict) -> tuple[bool, Optional[str]]:
    """
    Check if a rule is violated. Returns (violated, reason).
    """
    thresh = THRESHOLDS.get(rule_type)
    if not thresh:
        return False, None

    limit = thresh.get(strictness)
    if limit is None:
        return False, None

    if rule_type in ('sugar', 'sugars'):
        val = nutrients.get('sugars')
        if val is None:
            return False, None
        val = float(val)
        if val > limit:
            return True, f'Higher in sugar ({val:.1f}g) than recommended for your goals.'
        return False, None

    if rule_type == 'sodium':
        val = _get_sodium_mg(nutrients)
        if val <= 0:
            return False, None
        if val > limit:
            return True, f'Higher in sodium ({int(val)}mg) than recommended.'
        return False, None

    if rule_type == 'saturated_fat':
        val = nutrients.get('saturated_fat')
        if val is None:
            return False, None
        val = float(val)
        if val > limit:
            return True, f'Higher in saturated fat ({val:.1f}g) than recommended.'
        return False, None

    if rule_type in ('ultra_processed', 'artificial_additives'):
        nova = _get_nova(nutrients)
        if nova is None:
            return False, None
        # For nova: strict=avoid if >=2, moderate=avoid if >=3, mild=avoid if >=4
        if nova >= limit:
            return True, 'Contains highly processed ingredients.'
        return False, None

    return False, None


def evaluate(nutrients: dict, profile: Optional[dict]) -> dict:
    """
    Evaluate nutrients against user profile.
    nutrients: dict with sugars, salt/sodium_mg, saturated_fat, nova_group, etc. (per 100g)
    profile: dict with nutrition_rules, goal_primary, diet_preferences

    Returns:
        {
            'verdict': 'safe' | 'caution' | 'avoid',
            'verdict_label': 'Good' | 'Caution' | 'Avoid',
            'reason': str (user-friendly explanation),
            'triggered_rules': [{'type': str, 'strictness': str, 'reason': str}],
        }
    """
    if not profile:
        return {
            'verdict': VERDICT_SAFE,
            'verdict_label': VERDICT_LABELS[VERDICT_SAFE],
            'reason': 'No personal rules set. Add preferences in Settings for tailored guidance.',
            'triggered_rules': [],
        }

    rules = _build_active_rules(profile)
    if not rules:
        return {
            'verdict': VERDICT_SAFE,
            'verdict_label': VERDICT_LABELS[VERDICT_SAFE],
            'reason': 'Looks fine for your current preferences.',
            'triggered_rules': [],
        }

    triggered = []
    for r in rules:
        rule_type = r.get('type')
        strictness = r.get('strictness') or 'moderate'
        if not rule_type:
            continue
        violated, reason = _check_rule(rule_type, strictness, nutrients)
        if violated and reason:
            triggered.append({'type': rule_type, 'strictness': strictness, 'reason': reason})

    if not triggered:
        return {
            'verdict': VERDICT_SAFE,
            'verdict_label': VERDICT_LABELS[VERDICT_SAFE],
            'reason': 'Fits your nutrition goals.',
            'triggered_rules': [],
        }

    # Worst strictness among triggered determines verdict
    strictness_order = {'very_strict': 4, 'strict': 3, 'moderate': 2, 'mild': 1}
    worst = max(triggered, key=lambda t: strictness_order.get(t['strictness'], 0))
    count = len(triggered)

    if worst['strictness'] == 'strict' or count >= 2:
        verdict = VERDICT_AVOID
        reason = triggered[0]['reason']
        if count > 1:
            reason = f'{reason} Consider a lower-sugar or lower-sodium alternative.'
    else:
        verdict = VERDICT_CAUTION
        reason = triggered[0]['reason']

    return {
        'verdict': verdict,
        'verdict_label': VERDICT_LABELS[verdict],
        'reason': reason,
        'triggered_rules': triggered,
    }


def nutrients_from_product(product) -> dict:
    """Extract nutrients dict from Product model for evaluation."""
    return {
        'sugars': product.sugars,
        'salt': product.salt,
        'sodium_mg': product.sodium_mg,
        'saturated_fat': product.saturated_fat,
        'fat': product.fat,
        'proteins': product.proteins,
        'carbs': product.carbs,
        'energy_kcal': product.energy_kcal,
        'nova_group': product.nova_group,
        'fiber': product.fiber,
    }


def nutrients_from_dict(data: dict) -> dict:
    """Use nutrition dict as-is for evaluation (voice/image response)."""
    return {k: v for k, v in data.items() if v is not None}
