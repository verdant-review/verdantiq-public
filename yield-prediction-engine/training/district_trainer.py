"""
District-level trainer — builds and trains 10 base model instances:
  5 Natural Regions × 2 system types (rain_fed, irrigated)

Each model is a VotingRegressor ensemble pipeline trained on historical
FAOSTAT yield data augmented with ONI, CHIRPS, macro, and policy features.

Usage:
    python -m training.district_trainer
"""

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from training.base_trainer import BaseTrainer
from training.ensemble_trainer import build_ensemble_pipeline
from features.builder import FEATURE_COLUMNS
from config.zones import NATURAL_REGIONS, SYSTEM_TYPES

logger = logging.getLogger(__name__)

MODEL_SUBDIR = "district"


class DistrictTrainer(BaseTrainer):
    """Trains one ensemble pipeline per Natural Region × system type combination."""

    def train_all(self, data: pd.DataFrame) -> Dict:
        """
        Train all 10 base models.

        Args:
            data: DataFrame with FEATURE_COLUMNS + "yield_hg_ha" column,
                  plus "natural_region" (str) and "system_type" (str) columns.

        Returns:
            Dict of {model_name: {"rmse": float, "mape": float}} summary stats.
        """
        results = {}
        for region in NATURAL_REGIONS:
            for system_type in SYSTEM_TYPES:
                model_name = f"region_{region}_{system_type}"
                subset = data[
                    (data["natural_region"] == region) &
                    (data["system_type"] == system_type)
                ]

                if len(subset) < 20:
                    logger.warning(
                        "Skipping %s — only %d samples (minimum 20 required)",
                        model_name, len(subset),
                    )
                    continue

                stats = self.train_one(subset, model_name)
                results[model_name] = stats

        return results

    def train_one(self, data: pd.DataFrame, model_name: str) -> Dict:
        """
        Train a single region/system pipeline.

        Args:
            data:       Subset DataFrame for this region+system
            model_name: e.g. "region_II_rain_fed"

        Returns:
            Dict with validation stats
        """
        logger.info("Training %s on %d samples", model_name, len(data))

        X = data[FEATURE_COLUMNS].copy()
        y = data["yield_hg_ha"].copy()

        # Fill NaN features with column medians
        X = X.fillna(X.median(numeric_only=True))

        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        pipeline = build_ensemble_pipeline()
        pipeline.fit(X_train, y_train)

        cv_stats = self.cross_validate(pipeline, X, y)

        self.save_artefacts(
            pipeline=pipeline,
            name=model_name,
            subdir=MODEL_SUBDIR,
            feature_names=FEATURE_COLUMNS,
            X_val=X_val,
            y_val=y_val,
            extra_meta={
                "natural_region": model_name.split("_")[1],
                "system_type": "_".join(model_name.split("_")[2:]),
                "n_train_samples": len(X_train),
                **cv_stats,
            },
        )

        return {
            "rmse": cv_stats["cv_rmse"],
            "mape": cv_stats["cv_mape_pct"],
            "r2": cv_stats["cv_r2"],
            "n_samples": len(data),
        }

    def load_model(self, region: str, system_type: str):
        """Load a trained pipeline for a given region + system type."""
        model_name = f"region_{region}_{system_type}"
        return self.load_pipeline(model_name, MODEL_SUBDIR)
