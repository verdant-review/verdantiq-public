"""
Shared training utilities — cross-validation, residual-std computation, artefact save/load.
All district trainers inherit from BaseTrainer.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import cross_val_predict, KFold
from sklearn.pipeline import Pipeline

from config.settings import MODELS_DIR

logger = logging.getLogger(__name__)


class BaseTrainer:
    """Base class providing save/load/CV utilities for all model trainers."""

    def save_artefacts(
        self,
        pipeline: Pipeline,
        name: str,
        subdir: str,
        feature_names: List[str],
        X_val: pd.DataFrame,
        y_val: pd.Series,
        extra_meta: Dict = None,
    ) -> None:
        """
        Persist a trained pipeline and its metadata JSON.

        Args:
            pipeline:      Fitted sklearn Pipeline
            name:          Model name, e.g. "region_II_rain_fed"
            subdir:        Subdirectory under models/, e.g. "district"
            feature_names: List of feature column names used in training
            X_val:         Validation feature DataFrame (for residual std)
            y_val:         Validation target Series
            extra_meta:    Additional metadata dict to merge into metadata.json
        """
        model_dir = MODELS_DIR / subdir
        model_dir.mkdir(parents=True, exist_ok=True)

        # Save pipeline
        pipeline_path = model_dir / f"{name}_pipeline.joblib"
        joblib.dump(pipeline, pipeline_path)

        # Compute residual std on validation set (aleatoric uncertainty)
        y_pred = pipeline.predict(X_val)
        residuals = np.array(y_val) - y_pred
        residual_std = float(np.std(residuals))
        rmse = float(np.sqrt(np.mean(residuals ** 2)))
        mape = float(np.mean(np.abs(residuals / (np.array(y_val) + 1e-9))) * 100)

        # Feature importance (from RF estimator if available)
        feature_importance = self._extract_feature_importance(pipeline, feature_names)

        metadata = {
            "name": name,
            "trained_at": datetime.utcnow().isoformat() + "Z",
            "feature_names": feature_names,
            "validation_rmse": rmse,
            "validation_mape_pct": mape,
            "residual_std": residual_std,
            "n_validation_samples": len(y_val),
            "feature_importance": feature_importance,
        }
        if extra_meta:
            metadata.update(extra_meta)

        meta_path = model_dir / f"{name}_metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info(
            "Saved %s — RMSE=%.0f hg/ha, MAPE=%.1f%%, residual_std=%.0f",
            name, rmse, mape, residual_std,
        )

    def load_pipeline(self, name: str, subdir: str) -> Tuple[Pipeline, Dict]:
        """Load a pipeline and its metadata. Returns (pipeline, metadata)."""
        model_dir = MODELS_DIR / subdir
        pipeline_path = model_dir / f"{name}_pipeline.joblib"
        meta_path = model_dir / f"{name}_metadata.json"

        if not pipeline_path.exists():
            raise FileNotFoundError(f"No pipeline found at {pipeline_path}")

        pipeline = joblib.load(pipeline_path)
        metadata = {}
        if meta_path.exists():
            with open(meta_path) as f:
                metadata = json.load(f)

        return pipeline, metadata

    def cross_validate(
        self, pipeline: Pipeline, X: pd.DataFrame, y: pd.Series, n_splits: int = 5
    ) -> Dict:
        """Run k-fold CV and return summary stats."""
        kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
        y_pred_cv = cross_val_predict(pipeline, X, y, cv=kf)
        residuals = np.array(y) - y_pred_cv
        return {
            "cv_rmse": float(np.sqrt(np.mean(residuals ** 2))),
            "cv_mape_pct": float(np.mean(np.abs(residuals / (np.array(y) + 1e-9))) * 100),
            "cv_r2": float(1 - np.var(residuals) / np.var(y)),
            "n_splits": n_splits,
        }

    def _extract_feature_importance(
        self, pipeline: Pipeline, feature_names: List[str]
    ) -> Dict:
        """Extract feature importances from RF sub-estimator if available."""
        try:
            # Walk the pipeline to find the VotingRegressor → RF
            estimator = pipeline.named_steps.get("ensemble")
            if estimator is None:
                return {}
            rf = None
            for name, est in estimator.estimators:
                if hasattr(est, "feature_importances_"):
                    rf = est
                    break
            if rf is None:
                return {}
            importances = rf.feature_importances_
            if len(importances) != len(feature_names):
                return {}
            return dict(sorted(
                zip(feature_names, importances.tolist()),
                key=lambda x: x[1], reverse=True,
            ))
        except Exception:
            return {}
