"""
Probabilistic forecasting module.

Combines two sources of uncertainty to produce a full yield distribution:

1. Epistemic uncertainty (model disagreement):
   Per-tree predictions from RandomForestRegressor.estimators_ expose the
   spread of the forest. std(tree_preds) = epistemic_std.

2. Aleatoric uncertainty (irreducible noise):
   residual_std stored in model metadata.json from the validation set.

Combined: total_std = sqrt(epistemic_std² + aleatoric_std²)
Distribution: scipy.stats.norm(loc=point_estimate, scale=total_std)
"""

import json
import logging
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd
import scipy.stats

from config.zones import (
    CROP_FAILURE_THRESHOLDS,
    BUMPER_CROP_THRESHOLDS,
    NATURAL_REGIONS,
)
from config.settings import MODELS_DIR, MODEL_VERSION
from features.validators import YieldDistribution
from ingestion.cache import get_all_statuses

logger = logging.getLogger(__name__)

_pipeline_cache: Dict = {}
_metadata_cache: Dict = {}


def _load_model(region: str, system_type: str) -> Tuple[object, Dict]:
    """Load pipeline and metadata, with in-memory caching."""
    key = f"{region}_{system_type}"
    if key not in _pipeline_cache:
        import joblib
        model_dir = MODELS_DIR / "district"
        pipeline_path = model_dir / f"region_{key}_pipeline.joblib"
        meta_path = model_dir / f"region_{key}_metadata.json"

        if not pipeline_path.exists():
            raise FileNotFoundError(f"District model not found: {pipeline_path}")

        _pipeline_cache[key] = joblib.load(pipeline_path)
        if meta_path.exists():
            with open(meta_path) as f:
                _metadata_cache[key] = json.load(f)
        else:
            _metadata_cache[key] = {"residual_std": 5000.0}

    return _pipeline_cache[key], _metadata_cache[key]


def _get_confidence_level(data_freshness: Dict) -> str:
    """Derive confidence level from data freshness statuses."""
    statuses = [v.get("status", "unavailable") for v in data_freshness.values()]
    if all(s == "fresh" for s in statuses):
        return "high"
    if any(s == "unavailable" for s in statuses):
        return "low"
    return "medium"


def predict_distribution(
    X: pd.DataFrame,
    region: str,
    system_type: str,
    crop: str,
) -> YieldDistribution:
    """
    Compute a full probabilistic yield distribution for a single prediction.

    Args:
        X:           Feature DataFrame (1 row, FEATURE_COLUMNS columns)
        region:      Natural Region code (I–V)
        system_type: "rain_fed" or "irrigated"
        crop:        Crop name (for threshold lookup)

    Returns:
        YieldDistribution Pydantic model
    """
    pipeline, metadata = _load_model(region, system_type)

    # Point estimate from ensemble
    point_estimate = float(pipeline.predict(X)[0])

    # Epistemic uncertainty: per-tree predictions from RF
    epistemic_std = _compute_epistemic_std(pipeline, X)

    # Aleatoric uncertainty: residual std from validation set
    aleatoric_std = float(metadata.get("residual_std", 5000.0))

    # Combined uncertainty
    total_std = float(np.sqrt(epistemic_std ** 2 + aleatoric_std ** 2))
    total_std = max(total_std, 1.0)  # floor to avoid zero-std degenerate case

    dist = scipy.stats.norm(loc=point_estimate, scale=total_std)

    # Thresholds
    failure_threshold = CROP_FAILURE_THRESHOLDS.get(crop, CROP_FAILURE_THRESHOLDS["default"])
    bumper_threshold = BUMPER_CROP_THRESHOLDS.get(crop, BUMPER_CROP_THRESHOLDS["default"])

    # Data freshness for confidence level
    data_freshness = get_all_statuses()
    confidence = _get_confidence_level(data_freshness)
    freshness_iso = {k: v.get("last_fetch") for k, v in data_freshness.items()}

    return YieldDistribution(
        point_estimate=round(point_estimate, 1),
        mean=round(point_estimate, 1),
        std=round(total_std, 1),
        p10=round(float(dist.ppf(0.10)), 1),
        p25=round(float(dist.ppf(0.25)), 1),
        p50=round(float(dist.ppf(0.50)), 1),
        p75=round(float(dist.ppf(0.75)), 1),
        p90=round(float(dist.ppf(0.90)), 1),
        crop_failure_probability=round(float(dist.cdf(failure_threshold)), 4),
        bumper_probability=round(float(1.0 - dist.cdf(bumper_threshold)), 4),
        confidence_level=confidence,
        data_freshness=freshness_iso,
    )


def predict_distribution_legacy(point_estimate: float, crop: str) -> YieldDistribution:
    """
    Produce a probabilistic distribution from a legacy BaggingRegressor point estimate.
    Uses fixed aleatoric std derived from historical Zimbabwe yield volatility.
    """
    # Approximate residual std from historical Zimbabwe maize yield CV (~35%)
    aleatoric_std = point_estimate * 0.35
    total_std = max(aleatoric_std, 1.0)

    dist = scipy.stats.norm(loc=point_estimate, scale=total_std)

    failure_threshold = CROP_FAILURE_THRESHOLDS.get(crop, CROP_FAILURE_THRESHOLDS["default"])
    bumper_threshold = BUMPER_CROP_THRESHOLDS.get(crop, BUMPER_CROP_THRESHOLDS["default"])

    data_freshness = get_all_statuses()
    freshness_iso = {k: v.get("last_fetch") for k, v in data_freshness.items()}

    return YieldDistribution(
        point_estimate=round(point_estimate, 1),
        mean=round(point_estimate, 1),
        std=round(total_std, 1),
        p10=round(float(dist.ppf(0.10)), 1),
        p25=round(float(dist.ppf(0.25)), 1),
        p50=round(float(dist.ppf(0.50)), 1),
        p75=round(float(dist.ppf(0.75)), 1),
        p90=round(float(dist.ppf(0.90)), 1),
        crop_failure_probability=round(float(dist.cdf(failure_threshold)), 4),
        bumper_probability=round(float(1.0 - dist.cdf(bumper_threshold)), 4),
        confidence_level="low",  # legacy model = low confidence
        data_freshness=freshness_iso,
    )


def compute_risk_curve(
    X: pd.DataFrame,
    region: str,
    system_type: str,
    crop: str,
    n_points: int = 100,
) -> Dict:
    """
    Compute the full CDF discretised at n_points for humanitarian planning dashboards.

    Returns:
        {
            "cdf_points": [{"yield_hg_ha": float, "probability": float}, ...],
            "scenario_thresholds": {
                "humanitarian_intervention": {"yield_hg_ha": float, "probability": float},
                "food_import_needed": {"yield_hg_ha": float, "probability": float},
            }
        }
    """
    dist_obj = predict_distribution(X, region, system_type, crop)
    mean = dist_obj.mean
    std = dist_obj.std

    dist = scipy.stats.norm(loc=mean, scale=std)

    # CDF from p1 to p99
    probabilities = np.linspace(0.01, 0.99, n_points)
    yields = dist.ppf(probabilities)

    cdf_points = [
        {"yield_hg_ha": round(float(y), 0), "probability": round(float(p), 4)}
        for y, p in zip(yields, probabilities)
    ]

    failure_t = CROP_FAILURE_THRESHOLDS.get(crop, CROP_FAILURE_THRESHOLDS["default"])
    import_t = failure_t * 1.5  # food import needed at 1.5× failure threshold

    return {
        "cdf_points": cdf_points,
        "scenario_thresholds": {
            "humanitarian_intervention": {
                "yield_hg_ha": failure_t,
                "probability": round(float(dist.cdf(failure_t)), 4),
            },
            "food_import_needed": {
                "yield_hg_ha": import_t,
                "probability": round(float(dist.cdf(import_t)), 4),
            },
        },
    }


def _compute_epistemic_std(pipeline, X: pd.DataFrame) -> float:
    """Extract per-tree predictions from RF sub-estimator to compute epistemic std."""
    try:
        ensemble = pipeline.named_steps.get("ensemble")
        if ensemble is None:
            return 0.0
        scaler = pipeline.named_steps.get("scaler")
        X_scaled = scaler.transform(X) if scaler is not None else X.values

        rf = None
        for name, est in ensemble.estimators:
            if hasattr(est, "estimators_"):
                rf = est
                break
        if rf is None:
            return 0.0

        tree_preds = np.array([tree.predict(X_scaled)[0] for tree in rf.estimators_])
        return float(tree_preds.std())
    except Exception as exc:
        logger.debug("Could not compute epistemic std: %s", exc)
        return 0.0
