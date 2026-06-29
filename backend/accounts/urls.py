from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

app_name = 'accounts'

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('me/', views.me, name='me'),
    path('me/avatar/', views.avatar_serve, name='avatar-serve'),
    path('me/avatar/upload/', views.avatar_upload, name='avatar-upload'),
    path('nutrition-summary/', views.nutrition_summary, name='nutrition-summary'),
    path('food-log/', views.food_log_list, name='food-log-list'),
    path('fix-food-results/', views.fix_food_results, name='fix-food-results'),
    path('stats-dashboard/', views.stats_dashboard, name='stats-dashboard'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]
