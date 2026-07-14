"""
Hierarchical prediction orchestrator.

Coordinates:
  1. FeatureBuilder   — assembles feature vector from live connectors
  2. District models  — per Natural Region × system type predictions
  3. Provincial layer — spatial-weighted aggregation
  4. National layer   — province rollup + import requirement
  5. Probabilistic    — uncertainty quantification on district outputs
"""

import logging
from typing import Dict, Optional

import pandas as pd

from features.builder import FeatureBuilder
from features.validators import YieldDistribution, PredictResponseV2, NationalResponse
from prediction import probabilistic
from prediction import legacy as legacy_predictor
from training.provincial_trainer import ProvincialAggregator
from training.national_trainer import NationalAggregator
from config.zones import NATURAL_REGIONS, SYSTEM_TYPES, PROVINCES
from config.settings import MODEL_VERSION

logger = logging.getLogger(__name__)

_feature_builder: Optional[FeatureBuilder] = None
_provincial = ProvincialAggregator()
_national = NationalAggregator()


def _get_builder() -> FeatureBuilder:
    global _feature_builder
    if _feature_builder is None:
        _feature_builder = FeatureBuilder.from_live_connectors()
    return _feature_builder


def predict_single(
    year: int,
    crop: str,
    natural_region: str = "II",
    system_type: str = "rain_fed",
    overrides: Optional[Dict] = None,
) -> PredictResponseV2:
    """
    Run a single probabilistic prediction for a specific region + system type.
    Falls back to legacy model if district model is unavailable.
    """
    builder = _get_builder()
    X = builder.build(
        year=year,
        crop=crop,
        natural_region=natural_region,
        system_type=system_type,
        overrides=overrides,
    )

    try:
        dist = probabilistic.predict_distribution(X, natural_region, system_type, crop)
    except FileNotFoundError:
        logger.warning(
            "District model not found for %s/%s — falling back to legacy",
            natural_region, system_type,
        )
        legacy_result = legacy_predictor.predict(year, crop)
        dist = probabilistic.predict_distribution_legacy(
            legacy_result["predicted_yield_hg_ha"], crop
        )

    return PredictResponseV2(
        point_estimate=dist.point_estimate,
        distribution=dist,
        model_version=MODEL_VERSION,
        natural_region=natural_region,
        system_type=system_type,
        crop=crop,
        year=year,
    )


def predict_national(year: int, crop: str, system_type: str = "rain_fed") -> NationalResponse:
    """
    Run the full hierarchical forecast:
      district → province → national

    Falls back gracefully for any region with missing models.
    """
    builder = _get_builder()

    # Step 1: Predict for all 5 Natural Regions
    district_predictions: Dict[str, float] = {}
    district_distributions: Dict[str, YieldDistribution] = {}

    for region in NATURAL_REGIONS:
        X = builder.build(
            year=year, crop=crop,
            natural_region=region, system_type=system_type,
        )
        try:
            dist = probabilistic.predict_distribution(X, region, system_type, crop)
            district_predictions[region] = dist.point_estimate
            district_distributions[region] = dist
        except FileNotFoundError:
            logger.warning("Missing model for region %s/%s — using legacy", region, system_type)
            legacy_result = legacy_predictor.predict(year, crop)
            point = legacy_result["predicted_yield_hg_ha"]
            district_predictions[region] = point
            district_distributions[region] = probabilistic.predict_distribution_legacy(point, crop)

    # Step 2: Provincial aggregation
    provincial_results = _provincial.predict_all_provinces(district_predictions, system_type)

    # Attach distributions to provincial results
    for province, result in provincial_results.items():
        from config.zones import PROVINCE_TO_REGION_WEIGHTS
        weights = PROVINCE_TO_REGION_WEIGHTS.get(province, {})
        # Use the dominant region's distribution as the province distribution
        dominant_region = max(weights, key=weights.get) if weights else "II"
        result["distribution"] = district_distributions.get(dominant_region)

    # Step 3: National rollup
    national = _national.predict(provincial_results)

    # Build national distribution (weighted average of district distributions)
    national_dist = _aggregate_distributions(district_distributions, system_type, crop)

    from features.validators import ProvincialOutlook
    provincial_outlooks = {
        p: ProvincialOutlook(**r) for p, r in provincial_results.items()
    }

    return NationalResponse(
        national_yield_hg_ha=national["national_yield_hg_ha"],
        total_production_tonnes=national["total_production_tonnes"],
        import_requirement_tonnes=national["import_requirement_tonnes"],
        distribution=national_dist,
        provincial_breakdown=provincial_outlooks,
    )


def _aggregate_distributions(
    district_distributions: Dict[str, YieldDistribution],
    system_type: str,
    crop: str,
) -> YieldDistribution:
    """
    Produce a national distribution by averaging district distributions.
    Uses equal weights across regions for the national uncertainty envelope.
    """
    import numpy as np
    import scipy.stats
    from config.zones import CROP_FAILURE_THRESHOLDS, BUMPER_CROP_THRESHOLDS
    from ingestion.cache import get_all_statuses

    means = [d.mean for d in district_distributions.values()]
    stds = [d.std for d in district_distributions.values()]

    combined_mean = float(np.mean(means))
    # Combined std: root-mean-square of individual stds + spread across regions
    combined_std = float(np.sqrt(np.mean([s ** 2 for s in stds]) + np.var(means)))

    dist = scipy.stats.norm(loc=combined_mean, scale=combined_std)
    failure_t = CROP_FAILURE_THRESHOLDS.get(crop, CROP_FAILURE_THRESHOLDS["default"])
    bumper_t = BUMPER_CROP_THRESHOLDS.get(crop, BUMPER_CROP_THRESHOLDS["default"])

    statuses = get_all_statuses()
    confidence_levels = [d.confidence_level for d in district_distributions.values()]
    if all(c == "high" for c in confidence_levels):
        confidence = "high"
    elif any(c == "low" for c in confidence_levels):
        confidence = "low"
    else:
        confidence = "medium"

    return YieldDistribution(
        point_estimate=round(combined_mean, 1),
        mean=round(combined_mean, 1),
        std=round(combined_std, 1),
        p10=round(float(dist.ppf(0.10)), 1),
        p25=round(float(dist.ppf(0.25)), 1),
        p50=round(float(dist.ppf(0.50)), 1),
        p75=round(float(dist.ppf(0.75)), 1),
        p90=round(float(dist.ppf(0.90)), 1),
        crop_failure_probability=round(float(dist.cdf(failure_t)), 4),
        bumper_probability=round(float(1.0 - dist.cdf(bumper_t)), 4),
        confidence_level=confidence,
        data_freshness={k: v.get("last_fetch") for k, v in statuses.items()},
    )
