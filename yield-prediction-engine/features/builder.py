"""
Feature matrix assembler — bridges all ingestion connector outputs to model inputs.

All training and inference flows through this single module.
Missing connectors produce NaN columns (never raises), logged as warnings.
Overrides dict allows callers to substitute specific feature values at inference time.
"""

import logging
from typing import Dict, Optional

import numpy as np
import pandas as pd

from features.encoders import encode_crop, encode_enso_phase
from config.zones import NATURAL_REGIONS

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "year", "month", "crop_encoded", "natural_region_encoded",
    "rainfall_mm_3mo_avg", "rainfall_mm_anomaly",
    "ndvi_mean", "ndvi_anomaly",
    "oni_lag3", "oni_lag6", "enso_phase_encoded",
    "cpi_mom_pct", "cpi_3mo_avg",
    "fuel_usd_per_litre", "urea_usd_per_tonne", "parallel_premium_pct",
    "command_agriculture", "pfumvudza_input_subsidy", "irrigated_flag",
]

REGION_ENCODED = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}


class FeatureBuilder:
    """
    Assembles a feature vector for a single (year, crop, natural_region, system_type) combination.

    Usage:
        builder = FeatureBuilder()
        X = builder.build(year=2027, crop="Maize", natural_region="II", system_type="rain_fed")
        # Returns pd.DataFrame with one row and FEATURE_COLUMNS columns
    """

    def __init__(
        self,
        oni_connector=None,
        chirps_connector=None,
        ndvi_connector=None,
        macro_connector=None,
        policy_connector=None,
    ):
        self._oni = oni_connector
        self._chirps = chirps_connector
        self._ndvi = ndvi_connector
        self._macro = macro_connector
        self._policy = policy_connector

    @classmethod
    def from_live_connectors(cls) -> "FeatureBuilder":
        """Instantiate with all live connectors. Use at inference time."""
        from ingestion.oni import ONIConnector
        from ingestion.chirps import CHIRPSConnector
        from ingestion.ndvi import NDVIConnector
        from ingestion.macro import MacroConnector
        from ingestion.policy import PolicyConnector
        return cls(
            oni_connector=ONIConnector(),
            chirps_connector=CHIRPSConnector(),
            ndvi_connector=NDVIConnector(),
            macro_connector=MacroConnector(),
            policy_connector=PolicyConnector(),
        )

    def build(
        self,
        year: int,
        crop: str,
        natural_region: str = "II",
        system_type: str = "rain_fed",
        month: int = 3,  # default: March = peak harvest assessment month
        overrides: Optional[Dict] = None,
    ) -> pd.DataFrame:
        """
        Build a single-row feature DataFrame for prediction.

        Args:
            year:           Prediction year
            crop:           Crop name (must be in item encoder classes)
            natural_region: One of I, II, III, IV, V
            system_type:    "rain_fed" or "irrigated"
            month:          Month of assessment (1–12)
            overrides:      Dict of feature_name → value to override fetched values

        Returns:
            pd.DataFrame with one row and FEATURE_COLUMNS columns
        """
        row: Dict = {}

        # Static / encoded features
        row["year"] = year
        row["month"] = month
        row["crop_encoded"] = encode_crop(crop)
        row["natural_region_encoded"] = REGION_ENCODED.get(natural_region, 2)
        row["irrigated_flag"] = 1 if system_type == "irrigated" else 0

        # Date string for connector queries
        date_str = f"{year}-{month:02d}-01"
        start_str = f"{year - 1}-{month:02d}-01"  # 12-month lookback window

        # ONI features
        row.update(self._get_oni_features(start_str, date_str))

        # CHIRPS rainfall features
        row.update(self._get_chirps_features(natural_region, start_str, date_str))

        # NDVI features (may return NaN — falls back to CHIRPS anomaly proxy)
        row.update(self._get_ndvi_features(natural_region, year))
        if np.isnan(row.get("ndvi_mean", np.nan)):
            row["ndvi_mean"] = row.get("rainfall_mm_anomaly", 0.0) * 0.01  # CHIRPS proxy
            row["ndvi_anomaly"] = row.get("rainfall_mm_anomaly", 0.0) * 0.01

        # Macro features
        row.update(self._get_macro_features(start_str, date_str))

        # Policy features
        row.update(self._get_policy_features(date_str))

        # Apply caller overrides last
        if overrides:
            for k, v in overrides.items():
                if k in FEATURE_COLUMNS:
                    row[k] = v
                else:
                    logger.warning("FeatureBuilder: unknown override key '%s' ignored", k)

        # Ensure all expected columns are present (fill missing with 0)
        for col in FEATURE_COLUMNS:
            if col not in row:
                logger.warning("FeatureBuilder: missing column '%s', defaulting to 0", col)
                row[col] = 0.0

        return pd.DataFrame([row])[FEATURE_COLUMNS]

    # ------------------------------------------------------------------
    # Per-connector helpers — each returns a dict, never raises
    # ------------------------------------------------------------------

    def _get_oni_features(self, start_date: str, end_date: str) -> Dict:
        defaults = {"oni_lag3": 0.0, "oni_lag6": 0.0, "enso_phase_encoded": 0}
        if self._oni is None:
            return defaults
        try:
            df = self._oni.fetch(start_date, end_date)
            if df.empty or "oni_value" not in df.columns:
                return defaults
            latest = df.iloc[-1]
            return {
                "oni_lag3": float(latest.get("oni_lag3", 0.0)),
                "oni_lag6": float(latest.get("oni_lag6", 0.0)),
                "enso_phase_encoded": encode_enso_phase(str(latest.get("enso_phase", "Neutral"))),
            }
        except Exception as exc:
            logger.warning("FeatureBuilder: ONI fetch error (%s)", exc)
            return defaults

    def _get_chirps_features(self, natural_region: str, start_date: str, end_date: str) -> Dict:
        defaults = {"rainfall_mm_3mo_avg": 657.0 / 12, "rainfall_mm_anomaly": 0.0}
        if self._chirps is None:
            return defaults
        try:
            df = self._chirps.fetch(start_date, end_date)
            if df.empty or "natural_region" not in df.columns:
                return defaults
            region_df = df[df["natural_region"] == natural_region]
            if region_df.empty:
                return defaults
            latest = region_df.iloc[-1]
            return {
                "rainfall_mm_3mo_avg": float(latest.get("rainfall_mm_3mo_avg", 657.0 / 12)),
                "rainfall_mm_anomaly": float(latest.get("rainfall_mm_anomaly", 0.0)),
            }
        except Exception as exc:
            logger.warning("FeatureBuilder: CHIRPS fetch error (%s)", exc)
            return defaults

    def _get_ndvi_features(self, natural_region: str, year: int) -> Dict:
        defaults = {"ndvi_mean": np.nan, "ndvi_anomaly": np.nan}
        if self._ndvi is None:
            return defaults
        try:
            result = self._ndvi.fetch_latest()
            by_region = result.get("ndvi_by_region", {})
            ndvi_val = by_region.get(natural_region)
            if ndvi_val is None:
                return defaults
            return {
                "ndvi_mean": float(ndvi_val),
                "ndvi_anomaly": float(ndvi_val) - 0.45,  # subtract baseline
            }
        except Exception as exc:
            logger.warning("FeatureBuilder: NDVI fetch error (%s)", exc)
            return defaults

    def _get_macro_features(self, start_date: str, end_date: str) -> Dict:
        from ingestion.macro import MacroConnector
        defaults = MacroConnector.fallback_value if hasattr(MacroConnector, "fallback_value") else {}
        defaults = {
            "cpi_mom_pct": 5.0, "cpi_3mo_avg": 5.0,
            "fuel_usd_per_litre": 1.50, "urea_usd_per_tonne": 650.0,
            "parallel_premium_pct": 38.9,
        }
        if self._macro is None:
            return defaults
        try:
            df = self._macro.fetch(start_date, end_date)
            if df.empty:
                return defaults
            latest = df.iloc[-1]
            return {
                "cpi_mom_pct": float(latest.get("cpi_mom_pct", defaults["cpi_mom_pct"])),
                "cpi_3mo_avg": float(latest.get("cpi_3mo_avg", defaults["cpi_3mo_avg"])),
                "fuel_usd_per_litre": float(latest.get("fuel_usd_per_litre", defaults["fuel_usd_per_litre"])),
                "urea_usd_per_tonne": float(latest.get("urea_usd_per_tonne", defaults["urea_usd_per_tonne"])),
                "parallel_premium_pct": float(latest.get("parallel_premium_pct", defaults["parallel_premium_pct"])),
            }
        except Exception as exc:
            logger.warning("FeatureBuilder: macro fetch error (%s)", exc)
            return defaults

    def _get_policy_features(self, date_str: str) -> Dict:
        defaults = {"command_agriculture": 0, "pfumvudza_input_subsidy": 0}
        if self._policy is None:
            return defaults
        try:
            result = self._policy.fetch_latest()
            return {
                "command_agriculture": int(result.get("command_agriculture", 0)),
                "pfumvudza_input_subsidy": int(result.get("pfumvudza_input_subsidy", 0)),
            }
        except Exception as exc:
            logger.warning("FeatureBuilder: policy fetch error (%s)", exc)
            return defaults
