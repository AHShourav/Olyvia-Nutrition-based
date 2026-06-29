"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('blog/', Home.as_view(), name='blog')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include

from products.views import scan_barcode, search_foods_by_name, food_by_fdc_id, voice_analyze, analyze_image

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/scan-barcode', scan_barcode),
    path('api/voice-analyze', voice_analyze),
    path('api/analyze-image', analyze_image),
    path('api/products/', include('products.urls')),
    path('api/foods/search/', search_foods_by_name),
    path('api/foods/<int:fdc_id>/', food_by_fdc_id),
]
