"""Shared pytest fixtures for VerdantIQ tests."""

import pytest
from app import create_app


@pytest.fixture
def app():
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def sample_feature_row():
    """A minimal valid feature dict for use in prediction tests."""
    from features.builder import FEATURE_COLUMNS
    return {col: 0.0 for col in FEATURE_COLUMNS}
