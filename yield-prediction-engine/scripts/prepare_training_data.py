"""
Preprocessing pipeline: converts raw FAOSTAT CSV into the merged training
dataset expected by scripts/train_all.py.

Steps:
  1. Parse FAOSTAT yields (kg/ha) → hg/ha (×10)
  2. Assign each crop to its primary Natural Region + system_type
  3. Fetch ONI historical data (NOAA, 2000-2024)
  4. Fetch CPI from World Bank API (2000-2024)
  5. Join macro seed CSVs (2018+), interpolate back for 2000-2017
  6. Add policy dummies for each year-month
  7. Write merged_training_data.csv

Usage:
    python scripts/prepare_training_data.py \
        --faostat data/seeds/faostat_zimbabwe_yields.csv \
        --output  data/seeds/merged_training_data.csv
"""

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd
import numpy as np

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ---------------------------------------------------------------------------
# Crop → (natural_region, system_type) mapping
# Based on Zimbabwe agronomy: primary growing zones per crop.
# National yield proxies the dominant region for that crop.
# ---------------------------------------------------------------------------
CROP_REGION_MAP = {
    # FAOSTAT Item name          : [(natural_region, system_type, weight), ...]
    # Weight determines how many copies a crop creates across multiple regions.
    "Maize (corn)":              [("II", "rain_fed", 0.55),
                                  ("III", "rain_fed", 0.30),
                                  ("IV", "rain_fed", 0.15)],
    "Wheat":                     [("II", "irrigated", 1.00)],  # almost entirely irrigated
    "Sorghum":                   [("IV", "rain_fed", 0.50),
                                  ("V",  "rain_fed", 0.30),
                                  ("III","rain_fed", 0.20)],
    "Soya beans":                [("II", "rain_fed", 0.70),
                                  ("III","rain_fed", 0.30)],
    "Seed cotton, unginned":     [("III","rain_fed", 0.50),
                                  ("IV", "rain_fed", 0.50)],
    "Unmanufactured tobacco":    [("II", "rain_fed", 0.70),
                                  ("I",  "rain_fed", 0.30)],
}

# Normalised crop name for feature encoder
CROP_NAME_MAP = {
    "Maize (corn)":           "Maize",
    "Wheat":                  "Wheat",
    "Sorghum":                "Sorghum",
    "Soya beans":             "Soya beans",
    "Seed cotton, unginned":  "Seed cotton, unginned",
    "Unmanufactured tobacco": "Tobacco",
}

# Region-specific yield adjustment factors
# Accounts for above/below national average productivity per zone.
# Source: FAO/ZimVAC regional productivity differentials.
REGION_YIELD_FACTOR = {
    "I":   1.30,  # high-altitude, fertile
    "II":  1.15,  # commercial belt, above average
    "III": 0.95,  # semi-intensive, near average
    "IV":  0.70,  # extensive, below average
    "V":   0.50,  # arid, well below average
}

# System-type adjustment
SYSTEM_YIELD_FACTOR = {
    "rain_fed":  1.00,
    "irrigated": 1.40,  # irrigation buffers drought, boosts yields ~40%
}


def load_faostat(path: str) -> pd.DataFrame:
    """Parse FAOSTAT CSV → clean DataFrame with year, crop, yield_hg_ha."""
    df = pd.read_csv(path)
    # Keep only yield rows (Element == "Yield")
    df = df[df["Element"] == "Yield"].copy()
    df = df.rename(columns={"Year": "year", "Item": "faostat_crop", "Value": "yield_raw"})
    df["year"] = df["year"].astype(int)
    df["yield_raw"] = pd.to_numeric(df["yield_raw"], errors="coerce")
    # Unit is kg/ha — convert to hg/ha (×10)
    df["yield_hg_ha_national"] = df["yield_raw"] * 10
    df["data_flag"] = df["Flag"]
    return df[["year", "faostat_crop", "yield_hg_ha_national", "data_flag"]].dropna()


def expand_to_regions(df: pd.DataFrame) -> pd.DataFrame:
    """Expand national yield rows to regional rows using CROP_REGION_MAP."""
    rows = []
    for _, row in df.iterrows():
        faostat_crop = row["faostat_crop"]
        if faostat_crop not in CROP_REGION_MAP:
            logger.debug("Skipping unmapped crop: %s", faostat_crop)
            continue
        crop_name = CROP_NAME_MAP.get(faostat_crop, faostat_crop)
        region_assignments = CROP_REGION_MAP[faostat_crop]
        for region, system_type, weight in region_assignments:
            # Scale national yield by region+system factors
            region_yield = (
                row["yield_hg_ha_national"]
                * REGION_YIELD_FACTOR.get(region, 1.0)
                * SYSTEM_YIELD_FACTOR.get(system_type, 1.0)
            )
            rows.append({
                "year": row["year"],
                "crop": crop_name,
                "natural_region": region,
                "system_type": system_type,
                "yield_hg_ha": round(region_yield, 1),
                "national_yield_hg_ha": row["yield_hg_ha_national"],
                "region_weight": weight,
                "data_flag": row["data_flag"],
                "month": 3,  # March = harvest assessment
            })
    return pd.DataFrame(rows)


def fetch_oni_features(years: list) -> pd.DataFrame:
    """Fetch ONI data for all training years from NOAA."""
    logger.info("Fetching ONI historical data (2000-2024)...")
    try:
        from ingestion.oni import ONIConnector
        connector = ONIConnector()
        df = connector.fetch("2000-01-01", "2024-12-31")
        if df.empty or "oni_value" not in df.columns:
            raise ValueError("Empty ONI data")
        # Use DJF (Dec-Jan-Feb) season = planting season ONI for each year
        # DJF of year Y uses NDJ(Y-1)/DJF(Y) — take March season as representative
        planting_oni = df[df["season"].isin(["DJF", "NDJ", "OND"])].copy()
        # Group by year, take mean ONI for planting season
        annual = planting_oni.groupby("year").agg(
            oni_value=("oni_value", "mean"),
            enso_phase=("enso_phase", lambda x: x.mode()[0] if not x.empty else "Neutral"),
            oni_lag3=("oni_lag3", "mean"),
            oni_lag6=("oni_lag6", "mean"),
            oni_lag9=("oni_lag9", "mean"),
        ).reset_index()
        logger.info("ONI: %d annual records", len(annual))
        return annual
    except Exception as exc:
        logger.warning("ONI fetch failed (%s) — using neutral defaults", exc)
        return pd.DataFrame({
            "year": years,
            "oni_value": 0.0,
            "enso_phase": "Neutral",
            "oni_lag3": 0.0,
            "oni_lag6": 0.0,
            "oni_lag9": 0.0,
        })


def fetch_macro_features(years: list) -> pd.DataFrame:
    """Fetch CPI from World Bank; use seed CSVs for input costs + FX."""
    logger.info("Fetching macro features...")
    try:
        from ingestion.macro import MacroConnector
        connector = MacroConnector()
        df = connector.fetch("2000-01-01", "2024-12-31")
        if df.empty:
            raise ValueError("Empty macro data")
        df["year"] = pd.to_datetime(df["date"]).dt.year
        # Annual averages
        annual = df.groupby("year").agg(
            cpi_annual_pct=("cpi_annual_pct", "mean"),
            cpi_mom_pct=("cpi_mom_pct", "mean"),
            cpi_3mo_avg=("cpi_3mo_avg", "mean"),
            fuel_usd_per_litre=("fuel_usd_per_litre", "mean"),
            urea_usd_per_tonne=("urea_usd_per_tonne", "mean"),
            official_rate=("official_rate", "last"),
            parallel_rate=("parallel_rate", "last"),
            parallel_premium_pct=("parallel_premium_pct", "mean"),
        ).reset_index()
        logger.info("Macro: %d annual records", len(annual))
        return annual
    except Exception as exc:
        logger.warning("Macro fetch failed (%s) — using defaults", exc)
        # Return reasonable defaults for all training years
        records = []
        for y in years:
            records.append({
                "year": y,
                "cpi_annual_pct": 50.0 if y < 2009 else (10.0 if y < 2019 else 100.0),
                "cpi_mom_pct": 5.0,
                "cpi_3mo_avg": 5.0,
                "fuel_usd_per_litre": 1.20,
                "urea_usd_per_tonne": 400.0,
                "official_rate": 1.0 if y < 2009 else 10.0 if y < 2019 else 360.0,
                "parallel_rate": 1.5 if y < 2009 else 15.0 if y < 2019 else 500.0,
                "parallel_premium_pct": 38.0,
            })
        return pd.DataFrame(records)


def fetch_policy_features(years: list) -> pd.DataFrame:
    """Get annual policy dummies for each training year."""
    logger.info("Generating policy dummies...")
    try:
        from ingestion.policy import PolicyConnector
        connector = PolicyConnector()
        df = connector.fetch("2000-01-01", "2024-12-31")
        df["year"] = pd.to_datetime(df["date"]).dt.year
        # Take max within year (if active any month, flag the year)
        policy_cols = [c for c in df.columns if c not in ("date", "year")]
        annual = df.groupby("year")[policy_cols].max().reset_index()
        logger.info("Policy: %d annual records, columns: %s", len(annual), policy_cols)
        return annual
    except Exception as exc:
        logger.warning("Policy fetch failed (%s) — using zeros", exc)
        return pd.DataFrame({"year": years,
                             "command_agriculture": 0,
                             "pfumvudza_input_subsidy": 0})


def main():
    parser = argparse.ArgumentParser(description="Prepare VerdantIQ training dataset")
    parser.add_argument("--faostat", default="data/seeds/faostat_zimbabwe_yields.csv",
                        help="Path to raw FAOSTAT CSV")
    parser.add_argument("--output", default="data/seeds/merged_training_data.csv",
                        help="Output path for merged training CSV")
    args = parser.parse_args()

    faostat_path = Path(args.faostat)
    if not faostat_path.is_absolute():
        faostat_path = Path(__file__).parent.parent / faostat_path

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = Path(__file__).parent.parent / output_path

    # Step 1: Load and expand FAOSTAT
    logger.info("Loading FAOSTAT data from %s", faostat_path)
    faostat_df = load_faostat(str(faostat_path))
    logger.info("FAOSTAT: %d national crop-year rows", len(faostat_df))

    regional_df = expand_to_regions(faostat_df)
    logger.info("Expanded to %d regional rows across %d crops",
                len(regional_df), regional_df["crop"].nunique())

    training_years = sorted(regional_df["year"].unique().tolist())
    logger.info("Training year range: %d–%d", min(training_years), max(training_years))

    # Step 2: Fetch feature data
    oni_df = fetch_oni_features(training_years)
    macro_df = fetch_macro_features(training_years)
    policy_df = fetch_policy_features(training_years)

    # Step 3: Join all features onto the regional yield rows
    df = regional_df.copy()
    df = df.merge(oni_df, on="year", how="left")
    df = df.merge(macro_df, on="year", how="left")
    df = df.merge(policy_df, on="year", how="left")

    # Step 4: Compute enso_phase_encoded and fill gaps
    from features.encoders import encode_enso_phase
    df["enso_phase_encoded"] = df.get("enso_phase", "Neutral").fillna("Neutral").apply(encode_enso_phase)
    df["irrigated_flag"] = (df["system_type"] == "irrigated").astype(int)
    df = df.fillna(0)

    # Step 5: Report
    logger.info("\n=== DATASET SUMMARY ===")
    logger.info("Total rows:          %d", len(df))
    logger.info("Crops:               %s", sorted(df["crop"].unique().tolist()))
    logger.info("Natural regions:     %s", sorted(df["natural_region"].unique().tolist()))
    logger.info("System types:        %s", sorted(df["system_type"].unique().tolist()))
    logger.info("Year range:          %d–%d", df["year"].min(), df["year"].max())
    logger.info("Yield range (hg/ha): %.0f–%.0f", df["yield_hg_ha"].min(), df["yield_hg_ha"].max())
    logger.info("")
    logger.info("Rows per region+system:")
    for (r, s), g in df.groupby(["natural_region", "system_type"]):
        logger.info("  Region %s %-10s: %d rows", r, s, len(g))

    # Step 6: Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    logger.info("\nMerged training data written to: %s", output_path)
    logger.info("Next step: python scripts/train_all.py --data %s", output_path)


if __name__ == "__main__":
    main()
