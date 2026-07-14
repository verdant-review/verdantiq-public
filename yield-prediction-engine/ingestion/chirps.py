"""
CHIRPS (Climate Hazards Group InfraRed Precipitation with Station data) connector.

Source: UCSB CHIRPS v2.0 — monthly global rainfall at ~5km resolution.
URL pattern: https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/

Strategy:
  1. Download monthly .tif.gz rasters for the requested date range via HTTPS.
  2. Clip to Zimbabwe bounding box using rasterio.
  3. Aggregate spatially by Natural Region (simplified polygon lookup).
  4. Return DataFrame with [date, natural_region, rainfall_mm].

Fallback: If rasterio/geopandas unavailable or fetch fails, returns the
MVP hardcoded 657 mm/yr value scaled to the requested month count.
"""

import io
import gzip
import logging
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests

from ingestion.base import BaseConnector
from config.zones import ZIMBABWE_BBOX, NATURAL_REGIONS

logger = logging.getLogger(__name__)

CHIRPS_BASE_URL = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs"
CHIRPS_FALLBACK_MM_YEAR = 657.0  # MVP hardcoded value

# Simplified Natural Region bounding boxes for fallback spatial assignment
# Used when geopandas is unavailable
REGION_BBOX_FALLBACK = {
    "I":   {"min_lat": -19.0, "max_lat": -17.5, "min_lon": 30.5, "max_lon": 33.1},
    "II":  {"min_lat": -20.5, "max_lat": -17.0, "min_lon": 28.0, "max_lon": 32.5},
    "III": {"min_lat": -21.5, "max_lat": -18.5, "min_lon": 27.0, "max_lon": 32.0},
    "IV":  {"min_lat": -22.0, "max_lat": -19.5, "min_lon": 26.0, "max_lon": 31.5},
    "V":   {"min_lat": -22.4, "max_lat": -20.5, "min_lon": 25.2, "max_lon": 29.5},
}


class CHIRPSConnector(BaseConnector):
    name = "chirps"
    fallback_value = CHIRPS_FALLBACK_MM_YEAR / 12  # monthly average

    def _fetch_raw(self, start_date: str, end_date: str) -> pd.DataFrame:
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)
        months = pd.date_range(start=start, end=end, freq="MS")

        records = []
        for month in months:
            try:
                monthly_records = self._fetch_month(month.year, month.month)
                records.extend(monthly_records)
            except Exception as exc:
                logger.warning("CHIRPS: failed for %s/%s (%s), using fallback", month.year, month.month, exc)
                for region in NATURAL_REGIONS:
                    records.append({
                        "date": month.strftime("%Y-%m-%d"),
                        "natural_region": region,
                        "rainfall_mm": CHIRPS_FALLBACK_MM_YEAR / 12,
                        "source": "fallback",
                    })

        df = pd.DataFrame(records)
        df = self._compute_anomaly(df)
        return df

    def _fetch_latest_raw(self) -> dict:
        import calendar
        from datetime import date
        today = date.today()
        # CHIRPS has ~2 week lag; use previous month
        if today.month == 1:
            year, month = today.year - 1, 12
        else:
            year, month = today.year, today.month - 1

        records = self._fetch_month(year, month)
        df = pd.DataFrame(records)
        return {
            "date": f"{year}-{month:02d}-01",
            "rainfall_by_region": {
                r: float(df[df["natural_region"] == r]["rainfall_mm"].mean())
                for r in NATURAL_REGIONS
            },
        }

    def _fetch_month(self, year: int, month: int) -> list:
        """Download and process a single month's CHIRPS raster."""
        filename = f"chirps-v2.0.{year}.{month:02d}.tif.gz"
        url = f"{CHIRPS_BASE_URL}/{filename}"

        logger.info("CHIRPS: downloading %s", filename)
        response = requests.get(url, timeout=120, stream=True)
        response.raise_for_status()

        # Decompress in memory
        compressed = io.BytesIO(response.content)
        with gzip.open(compressed, "rb") as gz:
            tif_bytes = gz.read()

        return self._extract_regional_rainfall(tif_bytes, year, month)

    def _extract_regional_rainfall(self, tif_bytes: bytes, year: int, month: int) -> list:
        """Clip raster to Zimbabwe bbox and aggregate per Natural Region."""
        try:
            import rasterio
            from rasterio.io import MemoryFile
            from rasterio.mask import mask as rasterio_mask
            import json

            with MemoryFile(tif_bytes) as memfile:
                with memfile.open() as dataset:
                    return self._rasterio_extract(dataset, year, month)

        except ImportError:
            logger.warning("CHIRPS: rasterio not available, using bbox centroid fallback")
            return self._bbox_fallback_extract(year, month)

    def _rasterio_extract(self, dataset, year: int, month: int) -> list:
        """Use rasterio to read pixel values within each Natural Region bbox."""
        import rasterio
        from rasterio.windows import from_bounds

        bbox = ZIMBABWE_BBOX
        # Read Zimbabwe window
        window = from_bounds(
            left=bbox["min_lon"], bottom=bbox["min_lat"],
            right=bbox["max_lon"], top=bbox["max_lat"],
            transform=dataset.transform,
        )
        data = dataset.read(1, window=window)
        nodata = dataset.nodata or -9999

        # Compute transform for the window
        win_transform = rasterio.windows.transform(window, dataset.transform)

        records = []
        for region, rbbox in REGION_BBOX_FALLBACK.items():
            region_window = from_bounds(
                left=rbbox["min_lon"], bottom=rbbox["min_lat"],
                right=rbbox["max_lon"], top=rbbox["max_lat"],
                transform=dataset.transform,
            )
            region_data = dataset.read(1, window=region_window)
            valid = region_data[(region_data != nodata) & (region_data >= 0)]
            rainfall_mm = float(np.mean(valid)) if len(valid) > 0 else CHIRPS_FALLBACK_MM_YEAR / 12

            records.append({
                "date": f"{year}-{month:02d}-01",
                "natural_region": region,
                "rainfall_mm": rainfall_mm,
                "source": "chirps",
            })
        return records

    def _bbox_fallback_extract(self, year: int, month: int) -> list:
        """Simple fallback when rasterio is unavailable."""
        return [
            {
                "date": f"{year}-{month:02d}-01",
                "natural_region": region,
                "rainfall_mm": CHIRPS_FALLBACK_MM_YEAR / 12,
                "source": "fallback",
            }
            for region in NATURAL_REGIONS
        ]

    def _compute_anomaly(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Compute rainfall anomaly = actual - long-run monthly mean.
        Uses the dataset's own mean if historical data is available.
        """
        if "rainfall_mm" not in df.columns or df.empty:
            return df

        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df["month_of_year"] = df["date"].dt.month

        monthly_mean = (
            df.groupby(["natural_region", "month_of_year"])["rainfall_mm"]
            .transform("mean")
        )
        df["rainfall_mm_anomaly"] = df["rainfall_mm"] - monthly_mean

        # 3-month rolling average per region
        df = df.sort_values(["natural_region", "date"])
        df["rainfall_mm_3mo_avg"] = (
            df.groupby("natural_region")["rainfall_mm"]
            .transform(lambda x: x.rolling(3, min_periods=1).mean())
        )

        df = df.drop(columns=["month_of_year"])
        return df
