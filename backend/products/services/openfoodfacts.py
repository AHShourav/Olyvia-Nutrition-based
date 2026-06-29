"""
Client for the Open Food Facts public API.
Docs: https://wiki.openfoodfacts.org/API
"""

import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

BASE_URL = 'https://world.openfoodfacts.org/api/v2/product'
SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'

# User-Agent per OFF docs to identify the app
HEADERS = {
    'User-Agent': 'Olyvia/1.0 (nutrition app)',
}


def fetch_product(barcode: str) -> Optional[dict]:
    """
    Fetch a single product by barcode from OpenFoodFacts.
    Returns the raw product dict or None if not found / error.
    """
    url = f'{BASE_URL}/{barcode}.json'
    try:
        response = requests.get(url, headers=HEADERS, timeout=60)
        response.raise_for_status()
        data = response.json()
        if data.get('status') == 1:
            return data.get('product')
        return None
    except requests.RequestException as exc:
        logger.error('OpenFoodFacts request failed for %s: %s', barcode, exc)
        return None


def search_products(query: str, page_size: int = 5) -> list[dict]:
    """
    Search products by name. Returns list of product dicts (max page_size).
    Rate limit: 10 req/min. Use sparingly.
    """
    query = (query or '').strip()[:100]
    if not query:
        return []
    try:
        response = requests.get(
            SEARCH_URL,
            params={
                'search_terms': query,
                'json': 1,
                'page_size': min(max(page_size, 1), 20),
            },
            headers=HEADERS,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        products = data.get('products', [])
        return [p for p in products if p.get('product_name')]
    except requests.RequestException as exc:
        logger.error('OpenFoodFacts search failed for %r: %s', query, exc)
        return []
