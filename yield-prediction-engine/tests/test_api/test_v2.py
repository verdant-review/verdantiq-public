"""V2 API tests."""

import pytest


def test_data_status_returns_200(client):
    response = client.get("/api/v2/data-status")
    assert response.status_code == 200
    data = response.get_json()
    for key in ("chirps", "ndvi", "oni", "macro"):
        assert key in data
        assert data[key]["status"] in ("fresh", "stale", "unavailable")


def test_simulate_requires_scenarios(client):
    response = client.post("/api/v2/simulate", json={
        "year": 2027, "crop": "Maize", "scenarios": []
    })
    assert response.status_code == 400


def test_predict_v2_validates_region(client):
    response = client.post("/api/v2/predict", json={
        "year": 2027, "crop": "Maize", "natural_region": "INVALID"
    })
    assert response.status_code == 400
