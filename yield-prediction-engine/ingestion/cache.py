"""
Cache status utilities for all ingestion connectors.
Used by the /api/v2/data-status endpoint.
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict

from config.settings import CACHE_DIR, FRESHNESS


def get_connector_status(connector_name: str) -> Dict:
    """
    Returns freshness status for a named connector based on its cache directory.

    Returns:
        {
            "last_fetch": ISO datetime string or None,
            "age_hours": float or None,
            "status": "fresh" | "stale" | "unavailable"
        }
    """
    cache_dir = Path(CACHE_DIR) / connector_name
    if not cache_dir.exists():
        return {"last_fetch": None, "age_hours": None, "status": "unavailable"}

    parquet_files = list(cache_dir.glob("*.parquet"))
    if not parquet_files:
        return {"last_fetch": None, "age_hours": None, "status": "unavailable"}

    latest_mtime = max(f.stat().st_mtime for f in parquet_files)
    last_fetch = datetime.utcfromtimestamp(latest_mtime)
    age = datetime.utcnow() - last_fetch
    age_hours = age.total_seconds() / 3600
    threshold = FRESHNESS.get(connector_name, 168)
    status = "fresh" if age_hours <= threshold else "stale"

    return {
        "last_fetch": last_fetch.isoformat() + "Z",
        "age_hours": round(age_hours, 1),
        "status": status,
    }


def get_all_statuses() -> Dict:
    """Returns freshness status for all known connectors."""
    return {name: get_connector_status(name) for name in FRESHNESS}
