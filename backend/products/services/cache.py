"""
Lightweight cache helpers for product lookups.
Can be extended later with Redis / Django cache framework.
"""

from typing import Optional

from products.models import Product


def get_cached_product(barcode: str) -> Optional[Product]:
    """Return a Product from the local DB or None."""
    try:
        return Product.objects.get(barcode=barcode)
    except Product.DoesNotExist:
        return None


def cache_product(data: dict) -> Product:
    """
    Persist a normalised product dict to the database.
    Uses update_or_create so re-fetches overwrite stale data.
    """
    barcode = data.pop('barcode')
    product, _created = Product.objects.update_or_create(
        barcode=barcode,
        defaults=data,
    )
    return product
