"""
V2 API — probabilistic, hierarchical endpoints.

Endpoints:
  POST /api/v2/predict          — probabilistic single-region forecast
  POST /api/v2/national         — national rollup with provincial breakdown
  GET  /api/v2/risk-curve       — full CDF for humanitarian planning
  GET  /api/v2/data-status      — connector freshness
  POST /api/v2/simulate         — scenario comparison
"""

import logging
from flask import Blueprint, request, jsonify

from features.validators import PredictRequestV2, NationalRequestV2
from ingestion.cache import get_all_statuses
from storage.db import log_forecast
from config.settings import MODEL_VERSION

logger = logging.getLogger(__name__)

v2_bp = Blueprint("v2", __name__)


@v2_bp.route("/predict", methods=["POST"])
def predict():
    try:
        body = request.get_json(force=True)
        req = PredictRequestV2(**body)
    except Exception as exc:
        return jsonify({"error": f"Invalid request: {exc}"}), 400

    try:
        from prediction.engine import predict_single
        result = predict_single(
            year=req.year,
            crop=req.crop,
            natural_region=req.natural_region or "II",
            system_type=req.system_type or "rain_fed",
            overrides=req.overrides,
        )

        log_forecast({
            "year": req.year,
            "crop": req.crop,
            "natural_region": req.natural_region,
            "system_type": req.system_type,
            "point_estimate": result.point_estimate,
            "p10": result.distribution.p10,
            "p50": result.distribution.p50,
            "p90": result.distribution.p90,
            "crop_failure_probability": result.distribution.crop_failure_probability,
            "confidence_level": result.distribution.confidence_level,
            "model_version": MODEL_VERSION,
        })

        return jsonify(result.model_dump())

    except Exception as exc:
        logger.error("V2 predict error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@v2_bp.route("/national", methods=["POST"])
def national():
    try:
        body = request.get_json(force=True)
        req = NationalRequestV2(**body)
    except Exception as exc:
        return jsonify({"error": f"Invalid request: {exc}"}), 400

    try:
        from prediction.engine import predict_national
        result = predict_national(year=req.year, crop=req.crop)
        return jsonify(result.model_dump())
    except Exception as exc:
        logger.error("V2 national error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@v2_bp.route("/risk-curve", methods=["GET"])
def risk_curve():
    try:
        year = int(request.args.get("year", 2027))
        crop = request.args.get("crop", "Maize")
        region = request.args.get("natural_region", "II")
        system_type = request.args.get("system_type", "rain_fed")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        from features.builder import FeatureBuilder
        from prediction.probabilistic import compute_risk_curve

        builder = FeatureBuilder.from_live_connectors()
        X = builder.build(year=year, crop=crop, natural_region=region, system_type=system_type)
        curve = compute_risk_curve(X, region, system_type, crop)

        return jsonify({
            "crop": crop,
            "year": year,
            "natural_region": region,
            **curve,
        })
    except Exception as exc:
        logger.error("V2 risk-curve error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@v2_bp.route("/data-status", methods=["GET"])
def data_status():
    statuses = get_all_statuses()
    return jsonify(statuses)


@v2_bp.route("/simulate", methods=["POST"])
def simulate():
    """
    Run the model under multiple user-specified scenarios and return comparative results.

    Request body:
        {
            "year": 2027,
            "crop": "Maize",
            "natural_region": "II",
            "scenarios": [
                {"name": "baseline", "overrides": {}},
                {"name": "drought", "overrides": {"rainfall_mm_3mo_avg": 30, "oni_lag3": 2.5}},
                {"name": "policy_removed", "overrides": {"pfumvudza_input_subsidy": 0}}
            ]
        }
    """
    try:
        body = request.get_json(force=True)
    except Exception as exc:
        return jsonify({"error": f"Invalid request: {exc}"}), 400

    year = body.get("year", 2027)
    crop = body.get("crop", "Maize")
    region = body.get("natural_region", "II")
    system_type = body.get("system_type", "rain_fed")
    scenarios = body.get("scenarios", [])

    if not scenarios:
        return jsonify({"error": "At least one scenario required"}), 400

    try:
        from prediction.engine import predict_single
        results = {}
        for scenario in scenarios:
            name = scenario.get("name", "unnamed")
            overrides = scenario.get("overrides", {})
            result = predict_single(
                year=year, crop=crop,
                natural_region=region, system_type=system_type,
                overrides=overrides,
            )
            results[name] = result.model_dump()

        return jsonify({
            "year": year,
            "crop": crop,
            "natural_region": region,
            "scenarios": results,
        })

    except Exception as exc:
        logger.error("V2 simulate error: %s", exc)
        return jsonify({"error": str(exc)}), 500
