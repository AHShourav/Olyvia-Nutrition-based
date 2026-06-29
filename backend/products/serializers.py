from rest_framework import serializers

from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            'id',
            'barcode',
            'name',
            'brand',
            'image_url',
            'nutriscore_grade',
            'nova_group',
            'energy_kcal',
            'fat',
            'saturated_fat',
            'trans_fat',
            'sugars',
            'salt',
            'proteins',
            'fiber',
            'carbs',
            'cholesterol',
            'sodium_mg',
            'calcium_mg',
            'iron_mg',
            'potassium_mg',
            'ingredients_text',
            'categories',
            'source',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
