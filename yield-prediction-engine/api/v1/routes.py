"""
V1 API — backward-compatible routes.

The /predict endpoint response contract is preserved exactly:
  {"predicted_yield_hg_ha": float, "predicted_yield_tonnes_ha": float}

Internally routes through the new engine; falls back to legacy MVP on failure.
"""

import logging
from flask import Blueprint, request, jsonify, render_template

from prediction import legacy as legacy_predictor
from storage.db import log_forecast
from config.settings import MODEL_VERSION

logger = logging.getLogger(__name__)

v1_bp = Blueprint("v1", __name__)


@v1_bp.route("/")
def index():
    years = legacy_predictor.get_available_years()
    items = legacy_predictor.get_available_crops()
    return render_template("index.html", years=years, items=items)


@v1_bp.route("/predict", methods=["POST"])
def predict():
    try:
        year = int(request.form["year"])
        crop = request.form["item"]

        # Try new engine first, fall back to legacy on any failure
        try:
            from prediction.engine import predict_single
            result = predict_single(year=year, crop=crop)
            hg_ha = result.point_estimate
        except Exception as exc:
            logger.warning("New engine failed (%s), using legacy", exc)
            legacy_result = legacy_predictor.predict(year, crop)
            hg_ha = legacy_result["predicted_yield_hg_ha"]

        response = {
            "predicted_yield_hg_ha": hg_ha,
            "predicted_yield_tonnes_ha": hg_ha / 10_000,
        }

        log_forecast({
            "year": year,
            "crop": crop,
            "natural_region": None,
            "system_type": "rain_fed",
            "point_estimate": hg_ha,
            "p10": None, "p50": None, "p90": None,
            "crop_failure_probability": None,
            "confidence_level": "legacy",
            "model_version": MODEL_VERSION,
        })

        return jsonify(response)

    except Exception as exc:
        logger.error("V1 predict error: %s", exc)
        return jsonify({"error": str(exc)}), 500
