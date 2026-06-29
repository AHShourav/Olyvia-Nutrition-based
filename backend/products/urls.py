from django.urls import path

from . import views

app_name = 'products'

urlpatterns = [
    path('<str:barcode>/', views.product_by_barcode, name='product-by-barcode'),
]
