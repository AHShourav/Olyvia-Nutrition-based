from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import CustomUserManager


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """
    Email-based user. No username field.
    """
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'

    def __str__(self):
        return self.email


class UserProfile(models.Model):
    """
    Stores onboarding preferences. One-to-one with CustomUser.
    """
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='profile',
    )

    # Legacy (kept for backward compat)
    diet = models.CharField(max_length=20, blank=True, default='')
    allergies = models.CharField(max_length=255, blank=True, default='')
    goal = models.CharField(max_length=20, blank=True, default='')

    # New onboarding fields
    goal_primary = models.CharField(max_length=32, blank=True, default='')
    goal_commitment = models.CharField(max_length=32, blank=True, default='')
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=32, blank=True, default='')
    height_cm = models.FloatField(null=True, blank=True)
    weight_kg = models.FloatField(null=True, blank=True)
    diet_preferences = models.JSONField(default=list, blank=True)  # ["vegetarian", "keto"]
    nutrition_rules = models.JSONField(default=list, blank=True)  # [{"type":"sugar","strictness":"strict"}]
    health_conditions = models.JSONField(default=list, blank=True)  # ["hypertension", "diabetes"]
    condition_rules = models.JSONField(default=list, blank=True)  # [{"condition":"hypertension","sodium_strictness":"very_strict"}]
    stats_tracked_nutrients = models.JSONField(default=list, blank=True)  # ["energy_kcal","proteins","sugars","sodium","fat"]

    # Profile picture stored in PostgreSQL (BinaryField / bytea)
    profile_avatar = models.BinaryField(null=True, blank=True)

    onboarding_completed = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Profile for {self.user.email}'


class FoodLog(models.Model):
    """
    Stores eaten nutrients per user. Linked when user adds food via voice, barcode, image, or manual.
    """
    SOURCE_CHOICES = [
        ('voice', 'Voice'),
        ('barcode', 'Barcode'),
        ('image', 'Image'),
        ('manual', 'Manual'),
    ]

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='food_logs',
    )
    food_name = models.CharField(max_length=255)
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES)
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='food_logs',
    )
    barcode = models.CharField(max_length=32, blank=True, default='')

    # Nutrients (per 100g equivalent; stored as JSON for flexibility)
    nutrients = models.JSONField(default=dict, blank=True)

    logged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-logged_at']

    def __str__(self):
        return f'{self.food_name} ({self.user.email})'
