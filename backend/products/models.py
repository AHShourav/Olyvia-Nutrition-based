from django.db import models


class Product(models.Model):
    """
    Stores normalised product data fetched from OpenFoodFacts (or other sources).
    """
    barcode = models.CharField(max_length=32, unique=True, db_index=True)
    name = models.CharField(max_length=255, blank=True, default='')
    brand = models.CharField(max_length=255, blank=True, default='')
    image_url = models.URLField(blank=True, default='')

    # Nutrition (per 100 g / 100 ml) - USDA IDs: 208,204,205,203,291,269,307,606,605,601
    nutriscore_grade = models.CharField(max_length=1, blank=True, default='')
    nova_group = models.PositiveSmallIntegerField(null=True, blank=True)
    energy_kcal = models.FloatField(null=True, blank=True)
    fat = models.FloatField(null=True, blank=True)
    saturated_fat = models.FloatField(null=True, blank=True)
    trans_fat = models.FloatField(null=True, blank=True)
    sugars = models.FloatField(null=True, blank=True)
    salt = models.FloatField(null=True, blank=True)
    proteins = models.FloatField(null=True, blank=True)
    fiber = models.FloatField(null=True, blank=True)
    carbs = models.FloatField(null=True, blank=True)
    cholesterol = models.FloatField(null=True, blank=True)
    sodium_mg = models.FloatField(null=True, blank=True)
    calcium_mg = models.FloatField(null=True, blank=True)
    iron_mg = models.FloatField(null=True, blank=True)
    potassium_mg = models.FloatField(null=True, blank=True)

    # Ingredients
    ingredients_text = models.TextField(blank=True, default='')

    # Meta
    categories = models.CharField(max_length=512, blank=True, default='')
    source = models.CharField(
        max_length=32, default='openfoodfacts',
        help_text='Origin API the data was fetched from',
    )
    raw_json = models.JSONField(
        null=True, blank=True,
        help_text='Full original API response for future re-processing',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.barcode})'
