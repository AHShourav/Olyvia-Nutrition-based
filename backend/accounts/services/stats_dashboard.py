"""
Stats dashboard: today summary, health risk, trends, insights.
"""
from datetime import date, timedelta

from accounts.models import FoodLog, UserProfile
from accounts.services.nutrition_summary import get_nutrition_summary, NUTRIENT_KEYS
from products.services.rules_engine import evaluate, _build_active_rules

# Condition -> user-facing label for health risk messages
CONDITION_LABELS = {
    'hypertension': 'hypertension',
    'diabetes': 'diabetes',
    'high_cholesterol': 'high cholesterol',
    'kidney': 'kidney health',
    'heart': 'heart condition',
    'digestive': 'digestive sensitivity',
}

# Rule type -> condition (when from condition_rules). Used to attribute violations.
RULE_TYPE_TO_CONDITION = {
    'sodium': ['hypertension', 'kidney', 'heart'],
    'sugar': ['diabetes'],
    'saturated_fat': ['high_cholesterol', 'heart'],
    'ultra_processed': ['digestive'],
}

# Rule type -> human-readable nutrient name (no underscores)
NUTRIENT_DISPLAY = {
    'sodium': 'sodium',
    'sugar': 'sugar',
    'sugars': 'sugar',
    'saturated_fat': 'saturated fat',
    'ultra_processed': 'processed foods',
}

# Default daily targets for progress (generic adult)
DEFAULT_TARGETS = {
    'energy_kcal': 2000,
    'proteins': 50,
    'sugars': 50,
    'sodium': 2300,
    'fat': 65,
    'saturated_fat': 20,
    'carbs': 260,
    'fiber': 25,
}


def _get_profile_dict(user):
    try:
        p = UserProfile.objects.get(user=user)
        return {
            'goal_primary': p.goal_primary or '',
            'condition_rules': p.condition_rules or [],
            'nutrition_rules': p.nutrition_rules or [],
            'health_conditions': p.health_conditions or [],
            'diet_preferences': p.diet_preferences or [],
        }
    except Exception:
        return None


def _nutrients_from_log(log: FoodLog) -> dict:
    """Extract nutrients dict from FoodLog for rules engine."""
    n = log.nutrients or {}
    return {k: v for k, v in n.items() if v is not None}


def get_health_risk(user, for_date: date = None):
    """
    Evaluate today's FoodLog entries against rules engine.
    Returns: { level, violations, message, condition_impacts, top_contributors, next_action }
    condition_impacts: [{ condition_label, condition_key, severity, nutrient_name, cause, excess_mg, top_foods }]
    """
    if for_date is None:
        for_date = date.today()

    profile = _get_profile_dict(user)
    rules = _build_active_rules(profile) if profile else []
    if not rules:
        return {
            'level': 'low',
            'violations': [],
            'message': 'No personal rules set. Add health conditions in Profile for tailored guidance.',
            'condition_impacts': [],
            'top_contributors': [],
            'next_action': None,
        }

    logs = list(FoodLog.objects.filter(user=user, logged_at__date=for_date).order_by('-logged_at'))
    violation_counts = {}  # (rule_type, condition_label) -> count
    violating_foods = {}   # (rule_type, condition_label) -> [food_name, ...]

    for log in logs:
        nutrients = _nutrients_from_log(log)
        if not nutrients:
            continue
        result = evaluate(nutrients, profile)
        for t in result.get('triggered_rules', []):
            rule_type = t.get('type', '')
            conds = RULE_TYPE_TO_CONDITION.get(rule_type, [])
            cond_label = None
            if profile and conds:
                for c in conds:
                    if c in (profile.get('health_conditions') or []):
                        cond_label = CONDITION_LABELS.get(c, c)
                        break
            key = (rule_type, cond_label or rule_type)
            violation_counts[key] = violation_counts.get(key, 0) + 1
            if key not in violating_foods:
                violating_foods[key] = []
            if log.food_name and log.food_name not in violating_foods[key]:
                violating_foods[key].append(log.food_name)

    violations = [
        {
            'rule_type': rt,
            'condition_label': cl,
            'count': cnt,
            'top_foods': violating_foods.get((rt, cl), [])[:5],
        }
        for (rt, cl), cnt in violation_counts.items()
    ]

    total_violations = sum(v['count'] for v in violations)
    if total_violations == 0:
        return {
            'level': 'low',
            'violations': [],
            'message': 'All logged foods fit your health rules today.',
            'condition_impacts': [],
            'top_contributors': [],
            'next_action': None,
        }

    if total_violations >= 3 or any(v['count'] >= 2 for v in violations):
        level = 'elevated'
    else:
        level = 'moderate'

    # Build condition_impacts (condition-first, human-centric)
    today_summary = get_nutrition_summary(user, for_date)
    targets = DEFAULT_TARGETS
    condition_impacts = []
    all_contributors = []

    for v in violations:
        rt, cl, cnt = v['rule_type'], v['condition_label'], v['count']
        nutrient_name = NUTRIENT_DISPLAY.get(rt, rt.replace('_', ' '))
        severity = 'high' if cnt >= 2 or total_violations >= 3 else 'moderate'

        # Build cause text (human-centric)
        if rt == 'sodium':
            val = today_summary.get('sodium', 0) or 0
            tgt = targets.get('sodium', 2300)
            excess = int(val - tgt) if val > tgt else 0
            cause = f"Sodium exceeded your target by {excess} mg." if excess > 0 else f"High sodium from {cnt} food{'s' if cnt != 1 else ''}."
        elif rt in ('sugar', 'sugars'):
            cause = f"Sugar went above your target {'multiple times' if cnt >= 2 else 'once'} today."
        elif rt == 'saturated_fat':
            val = today_summary.get('saturated_fat', 0) or 0
            tgt = targets.get('saturated_fat', 20)
            pct = int((val / tgt * 100)) if tgt > 0 else 0
            cause = f"Saturated fat is at {pct}% of your daily limit."
        else:
            cause = f"{nutrient_name} exceeded your target."

        condition_impacts.append({
            'condition_label': cl,
            'condition_key': next((c for c in RULE_TYPE_TO_CONDITION.get(rt, []) if c in (profile.get('health_conditions') or [])), None),
            'severity': severity,
            'nutrient_name': nutrient_name,
            'cause': cause,
            'count': cnt,
        })
        all_contributors.extend(v.get('top_foods', []))

    # Dedupe top contributors, keep order
    seen = set()
    top_contributors = []
    for name in all_contributors:
        if name and name not in seen:
            seen.add(name)
            top_contributors.append(name)
            if len(top_contributors) >= 5:
                break

    # Next action
    next_action = None
    if level in ('moderate', 'elevated'):
        if any(v['rule_type'] == 'sodium' for v in violations):
            next_action = "Keep your next meal low in sodium and avoid processed foods tonight."
        elif any(v['rule_type'] in ('sugar', 'sugars') for v in violations):
            next_action = "Choose a lower-sugar or high-fiber snack for your next meal."
        elif any(v['rule_type'] == 'saturated_fat' for v in violations):
            next_action = "Prioritize lean proteins and vegetables for your next meal."
        else:
            next_action = "Choose a lower-sodium, lower-sugar dinner to reduce cumulative impact today."

    # Legacy message (kept for backward compat)
    parts = []
    for v in violations:
        nutrient_name = NUTRIENT_DISPLAY.get(v['rule_type'], v['rule_type'].replace('_', ' '))
        if v['condition_label']:
            parts.append(f"{v['count']} food{'s' if v['count'] != 1 else ''} pushed {nutrient_name} above your target for {v['condition_label']}.")
        else:
            parts.append(f"{v['count']} food{'s' if v['count'] != 1 else ''} exceeded your {nutrient_name} limit.")
    message = ' '.join(parts)

    return {
        'level': level,
        'violations': violations,
        'message': message,
        'condition_impacts': condition_impacts,
        'top_contributors': top_contributors,
        'next_action': next_action,
    }


def get_trend_data(user, days: int = 7):
    """Last N days of nutrition totals. Returns { dates, nutrients }."""
    today = date.today()
    dates = [today - timedelta(days=(days - 1 - d)) for d in range(days)]

    trend = {
        'dates': [d.isoformat() for d in dates],
        'energy_kcal': [],
        'sugars': [],
        'sodium': [],
        'proteins': [],
    }

    for d in dates:
        s = get_nutrition_summary(user, d)
        trend['energy_kcal'].append(s.get('energy_kcal', 0) or 0)
        trend['sugars'].append(s.get('sugars', 0) or 0)
        trend['sodium'].append(s.get('sodium', 0) or 0)
        trend['proteins'].append(s.get('proteins', 0) or 0)

    return trend


def get_insights(user, today_summary: dict, trend: dict, health_risk: dict):
    """
    Generate 2-3 sentence data-driven insights.
    No AI; strictly from numbers.
    """
    lines = []

    # Protein vs target
    protein = today_summary.get('proteins', 0) or 0
    target_p = DEFAULT_TARGETS.get('proteins', 50)
    if protein < target_p * 0.7 and target_p > 0:
        lines.append(f'Your average protein intake is below your goal ({protein:.0f}g vs {target_p}g target).')

    # Sodium risk
    if health_risk.get('level') in ('moderate', 'elevated'):
        for v in health_risk.get('violations', []):
            if v.get('rule_type') == 'sodium':
                lines.append('Sodium is your biggest risk area this week.')
                break

    # Sugar trend
    if trend and trend.get('sugars'):
        this_week = sum(trend['sugars'][-3:]) / 3 if len(trend['sugars']) >= 3 else trend['sugars'][-1]
        last_week = sum(trend['sugars'][:-3]) / 3 if len(trend['sugars']) >= 6 else trend['sugars'][0]
        if last_week > 0 and this_week < last_week * 0.9:
            pct = int((1 - this_week / last_week) * 100)
            lines.append(f'Sugar intake decreased {pct}% compared to last week.')
        elif last_week > 0 and this_week > last_week * 1.1:
            pct = int((this_week / last_week - 1) * 100)
            lines.append(f'Sugar intake increased {pct}% compared to last week.')

    # Generic tip if nothing specific
    if not lines:
        sodium = today_summary.get('sodium', 0) or today_summary.get('sodium_mg', 0)
        if sodium > DEFAULT_TARGETS.get('sodium', 2300):
            lines.append('Consider reducing packaged snacks to lower sodium.')
        else:
            lines.append('Your intake looks balanced today.')

    return lines[:3]


def get_stats_dashboard(user, for_date: date = None):
    """
    Full stats dashboard payload.
    """
    if for_date is None:
        for_date = date.today()

    today_summary = get_nutrition_summary(user, for_date)
    health_risk = get_health_risk(user, for_date)
    trend = get_trend_data(user, 7)
    insights = get_insights(user, today_summary, trend, health_risk)

    return {
        'today_summary': today_summary,
        'health_risk': health_risk,
        'trend': trend,
        'insights': insights,
        'targets': DEFAULT_TARGETS,
    }
