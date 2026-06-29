from django.contrib import admin

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('barcode', 'name', 'brand', 'nutriscore_grade', 'created_at')
    search_fields = ('barcode', 'name', 'brand')
    list_filter = ('nutriscore_grade', 'nova_group', 'source')
    readonly_fields = ('created_at', 'updated_at', 'raw_json')
