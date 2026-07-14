"""FeatureBuilder tests."""

import numpy as np
import pytest
from features.builder import FeatureBuilder, FEATURE_COLUMNS


def test_builder_returns_correct_columns():
    builder = FeatureBuilder()  # no connectors = all fallbacks
    X = builder.build(year=2027, crop="Maize", natural_region="II")
    assert list(X.columns) == FEATURE_COLUMNS


def test_builder_single_row():
    builder = FeatureBuilder()
    X = builder.build(year=2027, crop="Maize")
    assert len(X) == 1


def test_builder_override_applied():
    builder = FeatureBuilder()
    X = builder.build(year=2027, crop="Maize", overrides={"rainfall_mm_3mo_avg": 999.0})
    assert float(X["rainfall_mm_3mo_avg"].iloc[0]) == 999.0


def test_builder_missing_ndvi_uses_chirps_proxy():
    """When NDVI connector is None, ndvi_mean should be filled from CHIRPS anomaly proxy."""
    builder = FeatureBuilder(ndvi_connector=None)
    X = builder.build(year=2027, crop="Maize")
    # ndvi_mean should not be NaN (should have been substituted)
    assert not np.isnan(float(X["ndvi_mean"].iloc[0]))


def test_builder_irrigated_flag():
    builder = FeatureBuilder()
    X_rain = builder.build(year=2027, crop="Maize", system_type="rain_fed")
    X_irr = builder.build(year=2027, crop="Maize", system_type="irrigated")
    assert int(X_rain["irrigated_flag"].iloc[0]) == 0
    assert int(X_irr["irrigated_flag"].iloc[0]) == 1
