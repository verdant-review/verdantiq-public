"""
Oceanic Niño Index (ONI) connector.

Source: NOAA Climate Prediction Center — publicly available fixed-width ASCII table.
ONI is a 3-month running mean of sea surface temperature anomalies in the
Niño 3.4 region. It is used as a leading indicator for ENSO-driven drought
in Southern Africa, with a 3–6 month lead time.

Output columns:
    year        int
    season      str  (e.g. "DJF", "JFM", …)
    month       int  (centre month of the 3-month window, 1-indexed)
    oni_value   float  (°C anomaly)
    enso_phase  str  ("El Nino" | "La Nina" | "Neutral")
    oni_lag3    float  (ONI value 3 months prior)
    oni_lag6    float  (ONI value 6 months prior)
    oni_lag9    float  (ONI value 9 months prior)
"""

import io
import logging
from typing import Optional

import pandas as pd
import requests

from ingestion.base import BaseConnector

logger = logging.getLogger(__name__)

ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"

# 3-character season codes and their centre month
SEASON_TO_MONTH = {
    "DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4,
    "AMJ": 5, "MJJ": 6, "JJA": 7, "JAS": 8,
    "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12,
}

# El Niño/La Niña classification: ±0.5°C threshold for 5 consecutive seasons
ENSO_THRESHOLD = 0.5
ENSO_CONSECUTIVE = 5


class ONIConnector(BaseConnector):
    name = "oni"
    fallback_value = 0.0  # ENSO-neutral assumption when unavailable

    def _fetch_raw(self, start_date: str, end_date: str) -> pd.DataFrame:
        df = self._download_oni()
        start_year = int(start_date[:4])
        end_year = int(end_date[:4])
        return df[(df["year"] >= start_year) & (df["year"] <= end_year)].copy()

    def _fetch_latest_raw(self) -> dict:
        df = self._download_oni()
        if df.empty:
            raise ValueError("ONI data is empty")
        latest = df.iloc[-1]
        return {
            "year": int(latest["year"]),
            "season": latest["season"],
            "oni_value": float(latest["oni_value"]),
            "enso_phase": latest["enso_phase"],
            "oni_lag3": float(latest["oni_lag3"]),
            "oni_lag6": float(latest["oni_lag6"]),
            "oni_lag9": float(latest["oni_lag9"]),
        }

    def _download_oni(self) -> pd.DataFrame:
        logger.info("ONI: fetching from NOAA CPC")
        response = requests.get(ONI_URL, timeout=30)
        response.raise_for_status()
        df = self._parse_oni(response.text)
        df = self._classify_enso(df)
        df = self._add_lags(df)
        return df

    def _parse_oni(self, text: str) -> pd.DataFrame:
        """Parse NOAA CPC ONI fixed-width table."""
        lines = [l for l in text.strip().splitlines() if l.strip() and not l.startswith("SEAS")]
        records = []
        for line in lines:
            parts = line.split()
            if len(parts) < 3:
                continue
            try:
                season = parts[0]
                year = int(parts[1])
                oni_value = float(parts[2])
                month = SEASON_TO_MONTH.get(season, 0)
                records.append({
                    "year": year,
                    "season": season,
                    "month": month,
                    "oni_value": oni_value,
                })
            except (ValueError, IndexError):
                continue

        df = pd.DataFrame(records)
        df = df.sort_values(["year", "month"]).reset_index(drop=True)
        return df

    def _classify_enso(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Classify each row as El Nino / La Nina / Neutral.
        Standard definition: ±0.5°C for at least 5 consecutive overlapping seasons.
        """
        phases = ["Neutral"] * len(df)
        n = len(df)

        # Mark El Niño candidates (>= +0.5°C)
        for i in range(n - ENSO_CONSECUTIVE + 1):
            window = df["oni_value"].iloc[i : i + ENSO_CONSECUTIVE]
            if (window >= ENSO_THRESHOLD).all():
                for j in range(i, i + ENSO_CONSECUTIVE):
                    phases[j] = "El Nino"

        # Mark La Niña candidates (<= -0.5°C), overrides Neutral only
        for i in range(n - ENSO_CONSECUTIVE + 1):
            window = df["oni_value"].iloc[i : i + ENSO_CONSECUTIVE]
            if (window <= -ENSO_THRESHOLD).all():
                for j in range(i, i + ENSO_CONSECUTIVE):
                    if phases[j] != "El Nino":
                        phases[j] = "La Nina"

        df = df.copy()
        df["enso_phase"] = phases
        return df

    def _add_lags(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add lagged ONI features (3, 6, 9 months = 3, 6, 9 rows back)."""
        df = df.copy()
        df["oni_lag3"] = df["oni_value"].shift(3)
        df["oni_lag6"] = df["oni_value"].shift(6)
        df["oni_lag9"] = df["oni_value"].shift(9)
        # Fill NaN lags with 0 (neutral assumption)
        df[["oni_lag3", "oni_lag6", "oni_lag9"]] = (
            df[["oni_lag3", "oni_lag6", "oni_lag9"]].fillna(0.0)
        )
        return df
