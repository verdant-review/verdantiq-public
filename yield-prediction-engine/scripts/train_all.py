"""
Full training pipeline runner.

Loads historical yield data, assembles features, trains all 10 district models.

Usage:
    python scripts/train_all.py --data path/to/faostat_zimbabwe.csv

Expected CSV columns:
    year, crop, natural_region, system_type, yield_hg_ha,
    rainfall_mm, avg_temp, oni_value, enso_phase,
    cpi_annual_pct, fuel_usd_per_litre, urea_usd_per_tonne,
    official_rate, parallel_rate,
    command_agriculture, pfumvudza_input_subsidy
"""

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Map raw training CSV columns to the FEATURE_COLUMNS expected by the pipeline."""
    from features.builder import FEATURE_COLUMNS, REGION_ENCODED
    from features.encoders import encode_crop, encode_enso_phase

    df = df.copy()

    # Encode categoricals
    df["crop_encoded"] = df["crop"].apply(encode_crop)
    df["natural_region_encoded"] = df["natural_region"].map(REGION_ENCODED).fillna(2)
    df["enso_phase_encoded"] = df.get("enso_phase", pd.Series("Neutral", index=df.index)).apply(encode_enso_phase)
    df["irrigated_flag"] = (df["system_type"] == "irrigated").astype(int)

    # Rainfall rolling averages (computed from sorted data per region)
    df = df.sort_values(["natural_region", "year"])
    df["rainfall_mm_3mo_avg"] = (
        df.groupby("natural_region")["rainfall_mm"]
        .transform(lambda x: x.rolling(3, min_periods=1).mean())
    )
    df["rainfall_mm_anomaly"] = (
        df["rainfall_mm"] - df.groupby("natural_region")["rainfall_mm"].transform("mean")
    )

    # NDVI placeholder (NaN — model will handle it)
    df["ndvi_mean"] = df.get("ndvi_mean", 0.45)
    df["ndvi_anomaly"] = df.get("ndvi_anomaly", 0.0)

    # ONI lags
    df["oni_lag3"] = df.get("oni_lag3", df.get("oni_value", 0.0))
    df["oni_lag6"] = df.get("oni_lag6", df.get("oni_value", 0.0))

    # Macro
    df["cpi_mom_pct"] = df.get("cpi_mom_pct", df.get("cpi_annual_pct", 5.0) / 12)
    df["cpi_3mo_avg"] = df.get("cpi_3mo_avg", df["cpi_mom_pct"])
    df["parallel_premium_pct"] = (
        (df.get("parallel_rate", df.get("official_rate", 1.0)) -
         df.get("official_rate", 1.0)) /
        df.get("official_rate", 1.0).replace(0, 1) * 100
    )

    # Policy
    df["command_agriculture"] = df.get("command_agriculture", 0).fillna(0).astype(int)
    df["pfumvudza_input_subsidy"] = df.get("pfumvudza_input_subsidy", 0).fillna(0).astype(int)

    # Month default
    if "month" not in df.columns:
        df["month"] = 3  # March harvest assessment

    df = df.fillna(0)
    return df


def main():
    parser = argparse.ArgumentParser(description="Train VerdantIQ district models")
    parser.add_argument("--data", required=True, help="Path to training CSV")
    parser.add_argument("--region", default=None, help="Train specific region only (e.g. II)")
    args = parser.parse_args()

    logger.info("Loading training data from %s", args.data)
    df = pd.read_csv(args.data)
    logger.info("Loaded %d rows", len(df))

    df = prepare_features(df)

    from training.district_trainer import DistrictTrainer
    trainer = DistrictTrainer()

    if args.region:
        for system_type in ["rain_fed", "irrigated"]:
            subset = df[(df["natural_region"] == args.region) & (df["system_type"] == system_type)]
            if not subset.empty:
                trainer.train_one(subset, f"region_{args.region}_{system_type}")
    else:
        results = trainer.train_all(df)
        logger.info("Training complete:")
        for model_name, stats in results.items():
            logger.info("  %s — RMSE=%.0f, MAPE=%.1f%%, R²=%.3f (n=%d)",
                        model_name, stats["rmse"], stats["mape"], stats["r2"], stats["n_samples"])


if __name__ == "__main__":
    main()
