"""
Legacy fallback wrapper — preserves the MVP BaggingRegressor behaviour.

Used by the v1 API when new district models are unavailable or fail.
Also used as the 3rd voter (weight=0.2) inside the new ensemble pipeline.
"""

import logging
from typing import Optional

import joblib
import pandas as pd

from config.settings import (
    LEGACY_MODEL_PATH,
    LEGACY_AREA_ENCODER_PATH,
    LEGACY_ITEM_ENCODER_PATH,
)

logger = logging.getLogger(__name__)

HG_PER_TONNE = 10_000

# Hardcoded MVP values (preserved exactly from original app.py)
_PREDICTED_TEMPERATURES = {
    2026: 20.5, 2027: 20.6, 2028: 20.7, 2029: 20.8, 2030: 20.9,
    2031: 21.0, 2032: 21.1, 2033: 21.2, 2034: 21.3, 2035: 21.4,
    2036: 21.5, 2037: 21.6, 2038: 21.7, 2039: 21.8,
}
_RAINFALL_MM = 657.0
_PESTICIDES_T = 3000.0
_AREA = "Zimbabwe"

_model = None
_area_enc = None
_item_enc = None


def _load():
    global _model, _area_enc, _item_enc
    if _model is None:
        _model = joblib.load(LEGACY_MODEL_PATH)
        _area_enc = joblib.load(LEGACY_AREA_ENCODER_PATH)
        _item_enc = joblib.load(LEGACY_ITEM_ENCODER_PATH)


def predict(year: int, crop: str) -> dict:
    """
    Run the MVP BaggingRegressor prediction.

    Returns:
        {"predicted_yield_hg_ha": float, "predicted_yield_tonnes_ha": float}
    """
    try:
        _load()
        avg_temp = _PREDICTED_TEMPERATURES.get(year)
        if avg_temp is None:
            raise ValueError(f"No temperature data for year {year}")

        encoded_area = _area_enc.transform([_AREA])[0]
        encoded_item = _item_enc.transform([crop])[0]

        X = pd.DataFrame([[
            encoded_area, encoded_item, year,
            _RAINFALL_MM, _PESTICIDES_T, avg_temp,
        ]], columns=["Area", "Item", "Year", "average_rain_fall_mm_per_year",
                     "pesticides_tonnes", "avg_temp"])

        hg_ha = float(_model.predict(X)[0])
        return {
            "predicted_yield_hg_ha": hg_ha,
            "predicted_yield_tonnes_ha": hg_ha / HG_PER_TONNE,
        }
    except Exception as exc:
        logger.error("Legacy predictor failed: %s", exc)
        raise


def get_available_years() -> list:
    return list(_PREDICTED_TEMPERATURES.keys())


def get_available_crops() -> list:
    _load()
    excluded = {"Cassava", "Rice, paddy"}
    return [c for c in _item_enc.classes_ if c not in excluded]
