"""
Policy vectorization connector.

Reads config/policy_calendar.yaml and converts named policy periods into
binary dummy columns indexed by month. No network calls — fully git-versioned.

Output DataFrame columns:
    date                        str (YYYY-MM-DD, first of month)
    command_agriculture         int (0 or 1)
    pfumvudza_input_subsidy     int (0 or 1)
    foreign_currency_restriction int (0 or 1)
    grain_marketing_board_monopoly int (0 or 1)
    fuel_subsidy                int (0 or 1)
    [interaction columns]
    cmd_agri_x_pfumvudza        int (AND of both dummies)
"""

import logging
from pathlib import Path
from typing import Optional

import pandas as pd
import yaml

from ingestion.base import BaseConnector
from config.settings import BASE_DIR

logger = logging.getLogger(__name__)

POLICY_CALENDAR_PATH = BASE_DIR / "config" / "policy_calendar.yaml"


class PolicyConnector(BaseConnector):
    name = "policy"
    fallback_value = {}

    def __init__(self, cache_dir: Optional[str] = None, calendar_path: Optional[Path] = None):
        super().__init__(cache_dir)
        self.calendar_path = calendar_path or POLICY_CALENDAR_PATH

    def _fetch_raw(self, start_date: str, end_date: str) -> pd.DataFrame:
        policies = self._load_calendar()
        spine = pd.DataFrame({
            "date": pd.date_range(start=start_date, end=end_date, freq="MS").strftime("%Y-%m-%d")
        })
        spine["_date_dt"] = pd.to_datetime(spine["date"])

        for policy in policies:
            col = policy["name"]
            spine[col] = 0
            for period in policy.get("active_periods", []):
                p_start = pd.to_datetime(period["start"])
                p_end = pd.to_datetime(period["end"]) if period.get("end") else pd.Timestamp.today()
                mask = (spine["_date_dt"] >= p_start) & (spine["_date_dt"] <= p_end)
                spine.loc[mask, col] = 1

        spine = spine.drop(columns=["_date_dt"])

        # Interaction terms
        if "command_agriculture" in spine.columns and "pfumvudza_input_subsidy" in spine.columns:
            spine["cmd_agri_x_pfumvudza"] = (
                spine["command_agriculture"] & spine["pfumvudza_input_subsidy"]
            ).astype(int)

        return spine

    def _fetch_latest_raw(self) -> dict:
        today = pd.Timestamp.today().strftime("%Y-%m-%d")
        df = self._fetch_raw(today, today)
        if df.empty:
            return {}
        row = df.iloc[0].to_dict()
        row.pop("date", None)
        return {k: int(v) for k, v in row.items()}

    def _load_calendar(self) -> list:
        try:
            with open(self.calendar_path, "r") as f:
                data = yaml.safe_load(f)
            return data.get("policies", [])
        except Exception as exc:
            logger.warning("Policy: failed to load calendar (%s)", exc)
            return []
