from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

from .models import UserProfile

User = get_user_model()


@admin.register(User)
class CustomUserAdmin(BaseUserAdmin):
    ordering = ('-date_joined',)
    list_display = ('email', 'full_name', 'is_staff', 'is_active', 'date_joined')
    search_fields = ('email', 'full_name')
    list_filter = ('is_staff', 'is_active')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('full_name',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'diet', 'goal', 'onboarding_completed')
    list_filter = ('diet', 'goal', 'onboarding_completed')
    search_fields = ('user__email',)
