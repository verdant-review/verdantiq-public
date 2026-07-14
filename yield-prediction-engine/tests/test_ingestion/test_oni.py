"""ONI connector tests."""

import pytest
import responses as responses_mock
from ingestion.oni import ONIConnector, ONI_URL

SAMPLE_ONI = """SEAS YR TOTAL CLIM ANOM
DJF 2020  27.0  27.4  -0.4
JFM 2020  27.5  27.7  -0.2
FMA 2020  27.8  28.0  -0.2
MAM 2020  28.2  28.1   0.1
AMJ 2020  28.5  28.3   0.2
MJJ 2020  27.9  28.0  -0.1
JJA 2020  27.2  27.4  -0.2
JAS 2020  27.0  27.2  -0.2
ASO 2020  27.1  27.3  -0.2
SON 2020  27.0  27.2  -0.2
OND 2020  27.1  27.2  -0.1
NDJ 2020  27.3  27.3   0.0
DJF 2021  27.6  27.4   0.2
"""


@responses_mock.activate
def test_oni_fetch_returns_dataframe():
    responses_mock.add(responses_mock.GET, ONI_URL, body=SAMPLE_ONI, status=200)
    connector = ONIConnector()
    df = connector.fetch("2020-01-01", "2021-12-31")
    assert not df.empty
    assert "oni_value" in df.columns
    assert "enso_phase" in df.columns


@responses_mock.activate
def test_oni_lag_columns_present():
    responses_mock.add(responses_mock.GET, ONI_URL, body=SAMPLE_ONI, status=200)
    connector = ONIConnector()
    df = connector.fetch("2020-01-01", "2021-12-31")
    assert "oni_lag3" in df.columns
    assert "oni_lag6" in df.columns
    assert "oni_lag9" in df.columns


@responses_mock.activate
def test_oni_fallback_on_network_error():
    from unittest.mock import patch
    connector = ONIConnector()
    with patch("requests.get", side_effect=ConnectionError("network down")):
        result = connector.fetch_latest()
    assert isinstance(result, dict)
