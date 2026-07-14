"""
Macroeconomic data connector.

Three sub-sources unified into one module:

1. Inflation (Zimbabwe CPI month-on-month)
   Primary: World Bank API (annual) — free, structured, reliable.
   Secondary: ZimStat PDF scraping via pdfplumber (fragile, used as enrichment).

2. Input Costs (fuel, fertilizer)
   Source: Seed CSV at data/seeds/input_costs.csv (quarterly analyst update).
   Columns: date, fuel_usd_per_litre, urea_usd_per_tonne, ammonium_nitrate_usd_per_tonne

3. Parallel Market FX Rate (ZWL vs USD)
   Source: Seed CSV at data/seeds/fx_rates.csv (monthly analyst update).
   Columns: date, official_rate, parallel_rate
   Key feature: parallel_premium = (parallel - official) / official * 100

Output DataFrame columns:
    date                        str (YYYY-MM-DD, first of month)
    cpi_annual_pct              float (year-on-year CPI change)
    cpi_mom_pct                 float (month-on-month CPI change)
    cpi_3mo_avg                 float (3-month rolling average of mom)
    fuel_usd_per_litre          float
    urea_usd_per_tonne          float
    ammonium_nitrate_usd_per_tonne float
    official_rate               float (ZWL per USD)
    parallel_rate               float (ZWL per USD)
    parallel_premium_pct        float
"""

import logging
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

from ingestion.base import BaseConnector
from config.settings import BASE_DIR

logger = logging.getLogger(__name__)

WORLD_BANK_CPI_URL = (
    "https://api.worldbank.org/v2/country/ZW/indicator/FP.CPI.TOTL.ZG"
    "?format=json&per_page=100"
)

INPUT_COSTS_CSV = BASE_DIR / "data" / "seeds" / "input_costs.csv"
FX_RATES_CSV = BASE_DIR / "data" / "seeds" / "fx_rates.csv"


class MacroConnector(BaseConnector):
    name = "macro"
    fallback_value = {
        "cpi_annual_pct": 100.0,
        "cpi_mom_pct": 5.0,
        "cpi_3mo_avg": 5.0,
        "fuel_usd_per_litre": 1.50,
        "urea_usd_per_tonne": 650.0,
        "ammonium_nitrate_usd_per_tonne": 550.0,
        "official_rate": 360.0,
        "parallel_rate": 500.0,
        "parallel_premium_pct": 38.9,
    }

    def _fetch_raw(self, start_date: str, end_date: str) -> pd.DataFrame:
        cpi_df = self._fetch_cpi()
        costs_df = self._load_seed_csv(INPUT_COSTS_CSV, "input_costs")
        fx_df = self._load_seed_csv(FX_RATES_CSV, "fx_rates")

        df = self._merge_macro(cpi_df, costs_df, fx_df, start_date, end_date)
        return df

    def _fetch_latest_raw(self) -> dict:
        df = self._fetch_raw("2020-01-01", pd.Timestamp.today().strftime("%Y-%m-%d"))
        if df.empty:
            raise ValueError("Macro data is empty")
        latest = df.iloc[-1].to_dict()
        latest = {k: (float(v) if pd.notna(v) else None) for k, v in latest.items()}
        return latest

    # ------------------------------------------------------------------
    # CPI — World Bank API
    # ------------------------------------------------------------------

    def _fetch_cpi(self) -> pd.DataFrame:
        try:
            logger.info("Macro: fetching CPI from World Bank API")
            response = requests.get(WORLD_BANK_CPI_URL, timeout=30)
            response.raise_for_status()
            data = response.json()
            records = data[1] if len(data) > 1 and data[1] else []
            rows = []
            for item in records:
                if item.get("value") is not None:
                    rows.append({
                        "year": int(item["date"]),
                        "cpi_annual_pct": float(item["value"]),
                    })
            df = pd.DataFrame(rows).sort_values("year")
            # Expand annual to monthly (forward-fill within year)
            monthly = []
            for _, row in df.iterrows():
                for m in range(1, 13):
                    monthly.append({
                        "date": f"{int(row['year'])}-{m:02d}-01",
                        "cpi_annual_pct": row["cpi_annual_pct"],
                    })
            df = pd.DataFrame(monthly)
            df["cpi_mom_pct"] = df["cpi_annual_pct"] / 12  # rough approximation
            df["cpi_3mo_avg"] = df["cpi_mom_pct"].rolling(3, min_periods=1).mean()
            return df
        except Exception as exc:
            logger.warning("Macro: CPI fetch failed (%s), using fallback", exc)
            return pd.DataFrame()

    # ------------------------------------------------------------------
    # Seed CSVs
    # ------------------------------------------------------------------

    def _load_seed_csv(self, path: Path, name: str) -> pd.DataFrame:
        if not path.exists():
            logger.warning("Macro: seed CSV not found at %s", path)
            return pd.DataFrame()
        try:
            df = pd.read_csv(path, parse_dates=["date"])
            df["date"] = df["date"].dt.strftime("%Y-%m-%d")
            return df
        except Exception as exc:
            logger.warning("Macro: failed to load %s (%s)", name, exc)
            return pd.DataFrame()

    # ------------------------------------------------------------------
    # Merge and compute derived features
    # ------------------------------------------------------------------

    def _merge_macro(
        self,
        cpi_df: pd.DataFrame,
        costs_df: pd.DataFrame,
        fx_df: pd.DataFrame,
        start_date: str,
        end_date: str,
    ) -> pd.DataFrame:
        # Build date spine
        spine = pd.DataFrame({
            "date": pd.date_range(start=start_date, end=end_date, freq="MS").strftime("%Y-%m-%d")
        })

        for df, key_cols in [
            (cpi_df, ["cpi_annual_pct", "cpi_mom_pct", "cpi_3mo_avg"]),
            (costs_df, ["fuel_usd_per_litre", "urea_usd_per_tonne", "ammonium_nitrate_usd_per_tonne"]),
            (fx_df, ["official_rate", "parallel_rate"]),
        ]:
            if not df.empty and "date" in df.columns:
                cols = ["date"] + [c for c in key_cols if c in df.columns]
                spine = spine.merge(df[cols], on="date", how="left")

        # Forward-fill sparse seed data
        spine = spine.sort_values("date").ffill().bfill()

        # Compute parallel FX premium
        if "official_rate" in spine.columns and "parallel_rate" in spine.columns:
            spine["parallel_premium_pct"] = (
                (spine["parallel_rate"] - spine["official_rate"])
                / spine["official_rate"].replace(0, float("nan"))
                * 100
            )

        # Fill remaining NaN with fallback values
        for col, val in self.fallback_value.items():
            if col in spine.columns:
                spine[col] = spine[col].fillna(val)
            else:
                spine[col] = val

        return spine
