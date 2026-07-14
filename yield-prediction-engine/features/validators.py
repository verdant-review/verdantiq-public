"""
Pydantic schemas for VerdantIQ API request/response validation.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# ------------------------------------------------------------------
# Request schemas
# ------------------------------------------------------------------

class PredictRequestV1(BaseModel):
    year: int = Field(..., ge=2020, le=2040)
    item: str

    @field_validator("year")
    @classmethod
    def year_in_range(cls, v):
        if v < 2020 or v > 2040:
            raise ValueError("year must be between 2020 and 2040")
        return v


class PredictRequestV2(BaseModel):
    year: int = Field(..., ge=2020, le=2040)
    crop: str
    natural_region: Optional[str] = None   # None = national aggregate
    system_type: Optional[str] = "rain_fed"  # "rain_fed" | "irrigated"
    overrides: Optional[Dict[str, float]] = None

    @field_validator("system_type")
    @classmethod
    def valid_system_type(cls, v):
        if v not in ("rain_fed", "irrigated", None):
            raise ValueError("system_type must be 'rain_fed' or 'irrigated'")
        return v

    @field_validator("natural_region")
    @classmethod
    def valid_region(cls, v):
        if v is not None and v not in ("I", "II", "III", "IV", "V"):
            raise ValueError("natural_region must be one of: I, II, III, IV, V")
        return v


class NationalRequestV2(BaseModel):
    year: int = Field(..., ge=2020, le=2040)
    crop: str
    season: Optional[str] = "main"  # "main" | "winter"


class SimulateRequest(BaseModel):
    year: int = Field(..., ge=2020, le=2040)
    crop: str
    natural_region: Optional[str] = None
    scenarios: List[Dict]


# ------------------------------------------------------------------
# Response schemas
# ------------------------------------------------------------------

class YieldDistribution(BaseModel):
    point_estimate: float
    mean: float
    std: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    crop_failure_probability: float = Field(..., ge=0.0, le=1.0)
    bumper_probability: float = Field(..., ge=0.0, le=1.0)
    confidence_level: str  # "high" | "medium" | "low"
    data_freshness: Optional[Dict[str, Optional[str]]] = None


class PredictResponseV2(BaseModel):
    point_estimate: float
    distribution: YieldDistribution
    model_version: str
    natural_region: Optional[str]
    system_type: str
    crop: str
    year: int


class ProvincialOutlook(BaseModel):
    yield_hg_ha: float
    production_tonnes: float
    food_security_score: float
    food_security_label: str
    distribution: Optional[YieldDistribution] = None


class NationalResponse(BaseModel):
    national_yield_hg_ha: float
    total_production_tonnes: float
    import_requirement_tonnes: float
    distribution: YieldDistribution
    provincial_breakdown: Dict[str, ProvincialOutlook]


class RiskCurvePoint(BaseModel):
    yield_hg_ha: float
    probability: float


class RiskCurveResponse(BaseModel):
    crop: str
    year: int
    natural_region: Optional[str]
    cdf_points: List[RiskCurvePoint]
    scenario_thresholds: Dict[str, RiskCurvePoint]


class ConnectorStatus(BaseModel):
    last_fetch: Optional[str]
    age_hours: Optional[float]
    status: str  # "fresh" | "stale" | "unavailable"


class DataStatusResponse(BaseModel):
    chirps: ConnectorStatus
    ndvi: ConnectorStatus
    oni: ConnectorStatus
    macro: ConnectorStatus
