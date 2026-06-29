"""
Client for the USDA FoodData Central API.
Docs: https://fdc.nal.usda.gov/api-guide.html

USDA focuses on food-by-name search (vs OpenFoodFacts which is barcode/brand-based).
Rate limit: 1,000 requests/hour per IP. Exceeding blocks the key for 1 hour.
"""

import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

BASE_URL = 'https://api.nal.usda.gov/fdc/v1'


def _get_api_key():
    from django.conf import settings
    return getattr(settings, 'USDA_API_KEY', '') or ''


def search_foods(query: str, page_size: int = 25, page_number: int = 1) -> Optional[dict]:
    """
    Search foods by name/description.
    Returns the full SearchResult dict (totalHits, foods, etc.) or None on error.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning('USDA_API_KEY not set; USDA search will fail')
        return None

    url = f'{BASE_URL}/foods/search'
    payload = {
        'query': query.strip(),
        'pageSize': min(max(page_size, 1), 200),
        'pageNumber': max(page_number, 1),
    }
    try:
        response = requests.post(
            url,
            json=payload,
            params={'api_key': api_key},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.error('USDA search failed for query=%r: %s', query, exc)
        return None


def get_food(fdc_id: int) -> Optional[dict]:
    """
    Fetch a single food by FDC ID.
    Returns the raw food dict (Branded/Foundation/SR Legacy/etc.) or None.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning('USDA_API_KEY not set; USDA get_food will fail')
        return None

    url = f'{BASE_URL}/food/{fdc_id}'
    params = {'api_key': api_key}
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.error('USDA get_food failed for fdc_id=%s: %s', fdc_id, exc)
        return None
