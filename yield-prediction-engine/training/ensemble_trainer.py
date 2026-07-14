"""
Ensemble model builder — VotingRegressor of RF + GBM + BaggingRegressor.

Weights: RF=0.4, GBM=0.4, Bagging=0.2
The BaggingRegressor retains the MVP model's implicit knowledge as a third voter.
"""

from sklearn.ensemble import (
    RandomForestRegressor,
    GradientBoostingRegressor,
    BaggingRegressor,
    VotingRegressor,
)
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import FeatureUnion
import numpy as np

from features.builder import FEATURE_COLUMNS

# Features that receive polynomial expansion (climate variables)
CLIMATE_FEATURES = [
    "rainfall_mm_3mo_avg", "rainfall_mm_anomaly",
    "ndvi_mean", "ndvi_anomaly",
    "oni_lag3", "oni_lag6",
]

# Features passed through without transformation (policy, economic flags)
PASSTHROUGH_FEATURES = [
    "year", "month", "crop_encoded", "natural_region_encoded",
    "enso_phase_encoded", "cpi_mom_pct", "cpi_3mo_avg",
    "fuel_usd_per_litre", "urea_usd_per_tonne", "parallel_premium_pct",
    "command_agriculture", "pfumvudza_input_subsidy", "irrigated_flag",
]

CLIMATE_INDICES = [FEATURE_COLUMNS.index(f) for f in CLIMATE_FEATURES if f in FEATURE_COLUMNS]
PASSTHROUGH_INDICES = [FEATURE_COLUMNS.index(f) for f in PASSTHROUGH_FEATURES if f in FEATURE_COLUMNS]


def build_ensemble_pipeline(n_estimators_rf: int = 300, random_state: int = 42) -> Pipeline:
    """
    Build the full sklearn Pipeline:
      StandardScaler → VotingRegressor(RF, GBM, Bagging)

    The polynomial feature expansion on climate variables is handled in the
    FeatureBuilder via the 3-month rolling averages — the pipeline itself
    uses a flat scaled feature vector for simplicity and speed.
    """
    rf = RandomForestRegressor(
        n_estimators=n_estimators_rf,
        max_features="sqrt",
        min_samples_leaf=5,
        random_state=random_state,
        n_jobs=-1,
    )
    gbm = GradientBoostingRegressor(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.8,
        random_state=random_state,
    )
    bagging = BaggingRegressor(
        n_estimators=50,
        max_samples=0.8,
        max_features=0.8,
        random_state=random_state,
        n_jobs=-1,
    )

    ensemble = VotingRegressor(
        estimators=[("rf", rf), ("gbm", gbm), ("bagging", bagging)],
        weights=[0.4, 0.4, 0.2],
        n_jobs=-1,
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("ensemble", ensemble),
    ])

    return pipeline
