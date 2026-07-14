"""
Provincial aggregation layer — deterministic spatial-weighted rollup of district outputs.

Not an ML model — training data is too sparse at province level.
Weights are derived from FAO/ZimVAC land-use classification.
"""

import logging
from typing import Dict

from config.zones import PROVINCE_TO_REGION_WEIGHTS, PROVINCES, SYSTEM_TYPES
from config.consumption_norms import (
    PROVINCE_POPULATION,
    PER_CAPITA_CEREAL_KG_YEAR,
    food_security_score,
    food_security_label,
)

logger = logging.getLogger(__name__)

# Average hectares under cultivation per province (ZimStat 2021)
PROVINCE_CULTIVATED_HA = {
    "Manicaland":          320_000,
    "Mashonaland_Central": 430_000,
    "Mashonaland_East":    490_000,
    "Mashonaland_West":    550_000,
    "Masvingo":            400_000,
    "Matabeleland_North":  210_000,
    "Matabeleland_South":  180_000,
    "Midlands":            370_000,
    "Harare":               60_000,
    "Bulawayo":             30_000,
}


class ProvincialAggregator:
    """
    Aggregates district-level yield predictions to province level.

    For each province:
    1. Look up its Natural Region composition weights
    2. Take the weighted average of district model predictions for that province
    3. Compute food security score from production vs consumption need
    """

    def predict(
        self,
        province: str,
        district_predictions: Dict[str, float],
        system_type: str = "rain_fed",
    ) -> Dict:
        """
        Args:
            province:             Province name (must be in PROVINCES)
            district_predictions: {region: yield_hg_ha} for all 5 regions
            system_type:          "rain_fed" or "irrigated"

        Returns:
            {
                yield_hg_ha: float,
                production_tonnes: float,
                food_security_score: float,
                food_security_label: str,
            }
        """
        weights = PROVINCE_TO_REGION_WEIGHTS.get(province, {})
        if not weights:
            logger.warning("Provincial: unknown province '%s'", province)
            return self._empty_result()

        # Weighted average yield
        total_weight = 0.0
        weighted_yield = 0.0
        for region, weight in weights.items():
            region_yield = district_predictions.get(region)
            if region_yield is None:
                logger.warning("Provincial: missing district prediction for region %s", region)
                continue
            weighted_yield += weight * region_yield
            total_weight += weight

        if total_weight == 0:
            return self._empty_result()

        yield_hg_ha = weighted_yield / total_weight

        # Production in tonnes: yield (hg/ha) × area (ha) / 10000 (hg→t)
        cultivated_ha = PROVINCE_CULTIVATED_HA.get(province, 100_000)
        production_tonnes = yield_hg_ha * cultivated_ha / 10_000

        fs_score = food_security_score(production_tonnes, province)
        fs_label = food_security_label(fs_score)

        return {
            "yield_hg_ha": round(yield_hg_ha, 1),
            "production_tonnes": round(production_tonnes, 0),
            "food_security_score": round(fs_score, 3),
            "food_security_label": fs_label,
        }

    def predict_all_provinces(
        self, district_predictions: Dict[str, float], system_type: str = "rain_fed"
    ) -> Dict:
        """Run prediction for all 10 provinces."""
        return {
            province: self.predict(province, district_predictions, system_type)
            for province in PROVINCES
        }

    def _empty_result(self) -> Dict:
        return {
            "yield_hg_ha": 0.0,
            "production_tonnes": 0.0,
            "food_security_score": 0.0,
            "food_security_label": "emergency",
        }
