"""
Encoder utilities — wraps existing MVP LabelEncoders and adds new ones.
"""

import logging
from pathlib import Path
from typing import Optional

import joblib
import numpy as np

from config.settings import LEGACY_AREA_ENCODER_PATH, LEGACY_ITEM_ENCODER_PATH

logger = logging.getLogger(__name__)

_area_encoder = None
_item_encoder = None


def get_area_encoder():
    global _area_encoder
    if _area_encoder is None:
        _area_encoder = joblib.load(LEGACY_AREA_ENCODER_PATH)
    return _area_encoder


def get_item_encoder():
    global _item_encoder
    if _item_encoder is None:
        _item_encoder = joblib.load(LEGACY_ITEM_ENCODER_PATH)
    return _item_encoder


def encode_crop(crop_name: str) -> int:
    """Encode a crop name to its integer label. Returns -1 if unknown."""
    enc = get_item_encoder()
    if crop_name not in enc.classes_:
        logger.warning("Unknown crop '%s', encoding as -1", crop_name)
        return -1
    return int(enc.transform([crop_name])[0])


def encode_enso_phase(phase: str) -> int:
    """Encode ENSO phase to integer: El Nino=1, La Nina=-1, Neutral=0."""
    return {"El Nino": 1, "La Nina": -1, "Neutral": 0}.get(phase, 0)


def get_available_crops() -> list:
    """Return list of crops supported by the encoders (excluding filtered ones)."""
    enc = get_item_encoder()
    excluded = {"Cassava", "Rice, paddy"}
    return [c for c in enc.classes_ if c not in excluded]
