"""
NDVI (Normalized Difference Vegetation Index) connector via NASA APPEEARS API.

APPEEARS is a two-stage async workflow:
  Stage 1: Submit a task (returns task_id). Stored in SQLite.
  Stage 2: On next scheduled run, poll for completion and download results.

Credentials: NASA_EARTHDATA_USER and NASA_EARTHDATA_PASS env vars.

Output columns:
    year                int
    season              str  ("main" | "winter")
    natural_region      str
    ndvi_mean           float  (0–1 scale)
    ndvi_anomaly        float  (deviation from 10-year mean)
    source              str
"""

import logging
import time
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests

from ingestion.base import BaseConnector
from config.settings import NASA_EARTHDATA_USER, NASA_EARTHDATA_PASS, BASE_DIR
from config.zones import NATURAL_REGIONS, REGION_BBOX_FALLBACK  # reuse from chirps

logger = logging.getLogger(__name__)

APPEEARS_BASE = "https://appeears.earthdatacloud.nasa.gov/api"
TASK_DB_PATH = BASE_DIR / "cache" / "ndvi_tasks.json"

# Fallback: if NDVI unavailable, use CHIRPS anomaly as proxy (set in feature builder)
NDVI_FALLBACK = None  # signals to feature builder to use CHIRPS proxy


class NDVIConnector(BaseConnector):
    name = "ndvi"
    fallback_value = NDVI_FALLBACK

    def __init__(self, cache_dir: Optional[str] = None):
        super().__init__(cache_dir)
        self._token: Optional[str] = None

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def _fetch_raw(self, start_date: str, end_date: str) -> pd.DataFrame:
        if not NASA_EARTHDATA_USER or not NASA_EARTHDATA_PASS:
            logger.warning("NDVI: NASA credentials not set, using fallback")
            return self._make_fallback_df(start_date, end_date)

        try:
            self._authenticate()
            task_id = self._submit_task(start_date, end_date)
            self._persist_task_id(task_id, start_date, end_date)
            # First call: task submitted, data not ready yet
            # Return empty with pending marker; scheduler will retry
            logger.info("NDVI: task %s submitted, data will be available on next run", task_id)
            return pd.DataFrame([{
                "year": int(start_date[:4]),
                "season": "main",
                "natural_region": region,
                "ndvi_mean": np.nan,
                "ndvi_anomaly": np.nan,
                "source": "pending",
            } for region in NATURAL_REGIONS])
        except Exception as exc:
            logger.warning("NDVI: fetch failed (%s)", exc)
            return self._make_ndvi_fallback(start_date, end_date)

    def _fetch_latest_raw(self) -> dict:
        """Check for pending tasks and download completed ones."""
        pending = self._load_pending_tasks()
        if not pending:
            return {"ndvi_by_region": {r: None for r in NATURAL_REGIONS}, "source": "no_data"}

        if not NASA_EARTHDATA_USER:
            return {"ndvi_by_region": {r: None for r in NATURAL_REGIONS}, "source": "no_credentials"}

        self._authenticate()
        for task in pending:
            task_id = task["task_id"]
            status = self._poll_task(task_id)
            if status == "done":
                df = self._download_results(task_id)
                self._mark_task_complete(task_id)
                if df is not None and not df.empty:
                    return {
                        "ndvi_by_region": {
                            r: float(df[df["natural_region"] == r]["ndvi_mean"].mean())
                            for r in NATURAL_REGIONS
                            if r in df["natural_region"].values
                        },
                        "source": "appeears",
                    }

        return {"ndvi_by_region": {r: None for r in NATURAL_REGIONS}, "source": "pending"}

    # ------------------------------------------------------------------
    # APPEEARS API calls
    # ------------------------------------------------------------------

    def _authenticate(self) -> None:
        response = requests.post(
            f"{APPEEARS_BASE}/login",
            auth=(NASA_EARTHDATA_USER, NASA_EARTHDATA_PASS),
            timeout=30,
        )
        response.raise_for_status()
        self._token = response.json()["token"]

    def _submit_task(self, start_date: str, end_date: str) -> str:
        task_payload = {
            "task_type": "area",
            "task_name": f"VerdantIQ_NDVI_{start_date}_{end_date}",
            "params": {
                "dates": [{"startDate": start_date, "endDate": end_date}],
                "layers": [{"product": "MOD13A3.006", "layer": "_1_km_monthly_NDVI"}],
                "output": {"format": {"type": "geotiff"}, "projection": "geographic"},
                "geo": {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[
                                [25.2, -22.4], [33.1, -22.4],
                                [33.1, -15.6], [25.2, -15.6],
                                [25.2, -22.4],
                            ]],
                        },
                    }],
                },
            },
        }
        response = requests.post(
            f"{APPEEARS_BASE}/task",
            json=task_payload,
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["task_id"]

    def _poll_task(self, task_id: str) -> str:
        response = requests.get(
            f"{APPEEARS_BASE}/task/{task_id}",
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("status", "unknown")

    def _download_results(self, task_id: str) -> Optional[pd.DataFrame]:
        """Download CSV result files from a completed APPEEARS task."""
        response = requests.get(
            f"{APPEEARS_BASE}/bundle/{task_id}",
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=30,
        )
        if not response.ok:
            return None

        files = response.json().get("files", [])
        csv_files = [f for f in files if f["file_name"].endswith(".csv")]
        if not csv_files:
            return None

        file_id = csv_files[0]["file_id"]
        dl_response = requests.get(
            f"{APPEEARS_BASE}/bundle/{task_id}/{file_id}",
            headers={"Authorization": f"Bearer {self._token}"},
            stream=True,
            timeout=120,
        )
        dl_response.raise_for_status()

        import io
        df = pd.read_csv(io.StringIO(dl_response.text))
        return self._process_appeears_csv(df)

    def _process_appeears_csv(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map APPEEARS output CSV to Natural Region level."""
        ndvi_col = next((c for c in df.columns if "NDVI" in c.upper()), None)
        if ndvi_col is None:
            return pd.DataFrame()

        df = df.copy()
        df[ndvi_col] = pd.to_numeric(df[ndvi_col], errors="coerce")
        # Scale MOD13A3 NDVI (raw = value * 0.0001)
        df["ndvi_scaled"] = df[ndvi_col] * 0.0001
        df["ndvi_scaled"] = df["ndvi_scaled"].clip(lower=-0.2, upper=1.0)

        # Assign to Natural Region using lat/lon
        if "Latitude" not in df.columns or "Longitude" not in df.columns:
            return pd.DataFrame()

        from config.zones import REGION_BBOX_FALLBACK as RBBOX
        records = []
        for region, bbox in RBBOX.items():
            mask = (
                (df["Latitude"] >= bbox["min_lat"]) & (df["Latitude"] <= bbox["max_lat"]) &
                (df["Longitude"] >= bbox["min_lon"]) & (df["Longitude"] <= bbox["max_lon"])
            )
            subset = df[mask]
            if subset.empty:
                continue
            mean_ndvi = float(subset["ndvi_scaled"].mean())
            anomaly = mean_ndvi - 0.45  # 0.45 is approximate Zimbabwe growing season baseline
            records.append({
                "natural_region": region,
                "ndvi_mean": mean_ndvi,
                "ndvi_anomaly": anomaly,
                "source": "appeears",
            })
        return pd.DataFrame(records)

    # ------------------------------------------------------------------
    # Task persistence (simple JSON store)
    # ------------------------------------------------------------------

    def _persist_task_id(self, task_id: str, start_date: str, end_date: str) -> None:
        import json
        TASK_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        tasks = self._load_pending_tasks()
        tasks.append({"task_id": task_id, "start": start_date, "end": end_date, "status": "pending"})
        with open(TASK_DB_PATH, "w") as f:
            json.dump(tasks, f)

    def _load_pending_tasks(self) -> list:
        import json
        if not TASK_DB_PATH.exists():
            return []
        with open(TASK_DB_PATH) as f:
            return [t for t in json.load(f) if t.get("status") == "pending"]

    def _mark_task_complete(self, task_id: str) -> None:
        import json
        if not TASK_DB_PATH.exists():
            return
        with open(TASK_DB_PATH) as f:
            tasks = json.load(f)
        for t in tasks:
            if t["task_id"] == task_id:
                t["status"] = "done"
        with open(TASK_DB_PATH, "w") as f:
            json.dump(tasks, f)

    def _make_ndvi_fallback(self, start_date: str, end_date: str) -> pd.DataFrame:
        year = int(start_date[:4])
        return pd.DataFrame([{
            "year": year,
            "season": "main",
            "natural_region": region,
            "ndvi_mean": np.nan,
            "ndvi_anomaly": np.nan,
            "source": "fallback",
        } for region in NATURAL_REGIONS])
