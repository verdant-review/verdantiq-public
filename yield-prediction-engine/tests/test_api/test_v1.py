"""
V1 API backward-compatibility tests.
These MUST pass before any deployment — they are the regression gate.
"""

import pytest


def test_predict_returns_200(client):
    response = client.post("/predict", data={"year": "2027", "item": "Maize"})
    assert response.status_code == 200


def test_predict_response_has_required_fields(client):
    response = client.post("/predict", data={"year": "2027", "item": "Maize"})
    data = response.get_json()
    assert "predicted_yield_hg_ha" in data
    assert "predicted_yield_tonnes_ha" in data


def test_predict_yield_is_positive(client):
    response = client.post("/predict", data={"year": "2027", "item": "Maize"})
    data = response.get_json()
    assert data["predicted_yield_hg_ha"] > 0
    assert data["predicted_yield_tonnes_ha"] > 0


def test_predict_tonnes_is_hg_divided_by_10000(client):
    response = client.post("/predict", data={"year": "2027", "item": "Maize"})
    data = response.get_json()
    assert abs(data["predicted_yield_hg_ha"] / 10_000 - data["predicted_yield_tonnes_ha"]) < 0.001


def test_predict_invalid_year_returns_error(client):
    response = client.post("/predict", data={"year": "1800", "item": "Maize"})
    # Should either return error JSON or 400/500
    assert response.status_code in (400, 500) or "error" in (response.get_json() or {})


def test_index_returns_200(client):
    response = client.get("/")
    assert response.status_code == 200
