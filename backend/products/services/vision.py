"""
Google Cloud Vision API client for food image analysis.

Uses GOOGLE_APPLICATION_CREDENTIALS env var for auth. Set it to the path
of your service account JSON (e.g. in .env, never commit the JSON).
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Max image size: 20 MB (Vision API limit)
MAX_IMAGE_SIZE = 20 * 1024 * 1024


def detect_food_labels(image_bytes: bytes, max_results: int = 10) -> list[dict]:
    """
    Detect labels in an image using Google Cloud Vision API.
    Returns list of {"description": str, "score": float, "topicality": float}.
    """
    if not image_bytes or len(image_bytes) > MAX_IMAGE_SIZE:
        raise ValueError("Invalid image: empty or exceeds 20 MB")

    try:
        from google.cloud import vision
    except ImportError as e:
        logger.error("google-cloud-vision not installed: %s", e)
        raise RuntimeError("Vision API client not available. Install google-cloud-vision.") from e

    # Auth via GOOGLE_APPLICATION_CREDENTIALS (set in .env, never in code)
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    response = client.label_detection(image=image, max_results=max_results)

    if response.error.message:
        logger.error("Vision API error: %s", response.error.message)
        raise RuntimeError(response.error.message)

    labels = []
    for ann in response.label_annotations:
        labels.append({
            "description": ann.description or "",
            "score": float(ann.score),
            "topicality": float(getattr(ann, "topicality", ann.score)),
        })
    return labels
