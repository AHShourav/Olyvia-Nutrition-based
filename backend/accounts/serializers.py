from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import UserProfile

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'full_name', 'password', 'password_confirm']

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        UserProfile.objects.create(user=user)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'date_joined']
        read_only_fields = ['id', 'email', 'date_joined']


class ProfileSerializer(serializers.ModelSerializer):
    profile_has_avatar = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'diet', 'allergies', 'goal',
            'goal_primary', 'goal_commitment',
            'age', 'gender', 'height_cm', 'weight_kg',
            'diet_preferences', 'nutrition_rules',
            'health_conditions', 'condition_rules',
            'stats_tracked_nutrients',
            'profile_has_avatar',
            'onboarding_completed',
        ]

    def get_profile_has_avatar(self, obj):
        return bool(obj.profile_avatar)
