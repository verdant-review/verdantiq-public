"""
Abstract base class for all VerdantIQ data ingestion connectors.

Every connector must inherit from BaseConnector and implement:
  - fetch(start_date, end_date) -> pd.DataFrame
  - fetch_latest() -> dict

Built-in behaviours provided by the base class:
  - Retry with exponential backoff (tenacity)
  - Disk-backed caching (joblib.Memory)
  - Fallback to default values on failure
  - Freshness checking
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from config.settings import CACHE_DIR

logger = logging.getLogger(__name__)


class ConnectorError(Exception):
    """Raised when a connector fails and no fallback is available."""
    pass


class BaseConnector(ABC):
    """Abstract base class for all data ingestion connectors."""

    # Subclasses must set these
    name: str = "base"
    fallback_value: Any = None

    def __init__(self, cache_dir: Optional[str] = None):
        self.cache_dir = Path(cache_dir or CACHE_DIR) / self.name
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._last_fetch: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    def _fetch_raw(self, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Perform the actual network/file fetch. Must return a DataFrame.
        Raise any exception on failure — the base class handles retries.
        """
        raise NotImplementedError

    @abstractmethod
    def _fetch_latest_raw(self) -> dict:
        """
        Fetch only the most recent data point. Must return a dict.
        Raise any exception on failure.
        """
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Public interface (wraps raw methods with retry + cache + fallback)
    # ------------------------------------------------------------------

    def fetch(self, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Fetch data for a date range. Uses cache if fresh; otherwise fetches live.

        Args:
            start_date: ISO date string, e.g. "2024-01-01"
            end_date:   ISO date string, e.g. "2024-12-31"

        Returns:
            pd.DataFrame with connector-specific columns
        """
        cache_key = f"{start_date}_{end_date}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            logger.debug("%s: cache hit for %s→%s", self.name, start_date, end_date)
            return cached

        try:
            df = self._fetch_with_retry(start_date, end_date)
            self._save_cache(cache_key, df)
            self._last_fetch = datetime.utcnow()
            return df
        except Exception as exc:
            logger.warning("%s: fetch failed (%s), returning fallback", self.name, exc)
            return self._make_fallback_df(start_date, end_date)

    def fetch_latest(self) -> dict:
        """
        Fetch the most recent data point.

        Returns:
            dict with connector-specific keys, or fallback_value on failure
        """
        try:
            result = self._fetch_latest_with_retry()
            self._last_fetch = datetime.utcnow()
            return result
        except Exception as exc:
            logger.warning("%s: fetch_latest failed (%s), returning fallback", self.name, exc)
            if isinstance(self.fallback_value, dict):
                return self.fallback_value
            return {"value": self.fallback_value, "source": "fallback"}

    def is_stale(self, max_age_hours: Optional[int] = None) -> bool:
        """Return True if the last successful fetch is older than max_age_hours."""
        from config.settings import FRESHNESS
        threshold = max_age_hours or FRESHNESS.get(self.name, 168)
        if self._last_fetch is None:
            return True
        age = datetime.utcnow() - self._last_fetch
        return age > timedelta(hours=threshold)

    @property
    def last_fetch_iso(self) -> Optional[str]:
        if self._last_fetch is None:
            return None
        return self._last_fetch.isoformat() + "Z"

    # ------------------------------------------------------------------
    # Retry wrappers
    # ------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        reraise=True,
    )
    def _fetch_with_retry(self, start_date: str, end_date: str) -> pd.DataFrame:
        return self._fetch_raw(start_date, end_date)

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        reraise=True,
    )
    def _fetch_latest_with_retry(self) -> dict:
        return self._fetch_latest_raw()

    # ------------------------------------------------------------------
    # Cache helpers (parquet-backed per connector/date-range)
    # ------------------------------------------------------------------

    def _cache_path(self, key: str) -> Path:
        safe_key = key.replace("/", "_").replace(":", "_")
        return self.cache_dir / f"{safe_key}.parquet"

    def _load_cache(self, key: str) -> Optional[pd.DataFrame]:
        path = self._cache_path(key)
        if not path.exists():
            return None
        from config.settings import FRESHNESS
        threshold_hours = FRESHNESS.get(self.name, 168)
        mtime = datetime.utcfromtimestamp(path.stat().st_mtime)
        if datetime.utcnow() - mtime > timedelta(hours=threshold_hours):
            logger.debug("%s: cache stale for key %s", self.name, key)
            return None
        try:
            df = pd.read_parquet(path)
            self._last_fetch = mtime
            return df
        except Exception as exc:
            logger.warning("%s: corrupt cache for key %s (%s)", self.name, key, exc)
            return None

    def _save_cache(self, key: str, df: pd.DataFrame) -> None:
        path = self._cache_path(key)
        try:
            df.to_parquet(path, index=False)
        except Exception as exc:
            logger.warning("%s: failed to write cache (%s)", self.name, exc)

    # ------------------------------------------------------------------
    # Fallback
    # ------------------------------------------------------------------

    def _make_fallback_df(self, start_date: str, end_date: str) -> pd.DataFrame:
        """Return an empty DataFrame with a 'source' column marked as fallback."""
        return pd.DataFrame([{
            "date": start_date,
            "source": "fallback",
            "value": self.fallback_value,
        }])
