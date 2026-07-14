"""
National aggregation layer — weighted rollup of provincial outputs.

Outputs:
  - National average yield (hg/ha)
  - Total production (tonnes)
  - Import requirement = max(0, national cereal need - production)
  - Provincial breakdown dict
"""

import logging
from typing import Dict

from config.zones import NATIONAL_PROVINCE_WEIGHTS, PROVINCES
from config.consumption_norms import NATIONAL_CONSUMPTION_NEED

logger = logging.getLogger(__name__)


class NationalAggregator:
    """Rolls up provincial predictions into a national forecast."""

    def predict(self, provincial_results: Dict[str, Dict]) -> Dict:
        """
        Args:
            provincial_results: {province: {yield_hg_ha, production_tonnes, ...}}

        Returns:
            {
                national_yield_hg_ha: float,
                total_production_tonnes: float,
                import_requirement_tonnes: float,
                provincial_breakdown: Dict,
            }
        """
        # Weighted average yield
        national_yield = 0.0
        total_weight = 0.0
        total_production = 0.0

        for province, result in provincial_results.items():
            weight = NATIONAL_PROVINCE_WEIGHTS.get(province, 0.0)
            yield_val = result.get("yield_hg_ha", 0.0)
            national_yield += weight * yield_val
            total_weight += weight
            total_production += result.get("production_tonnes", 0.0)

        if total_weight > 0:
            national_yield /= total_weight

        import_requirement = max(0.0, NATIONAL_CONSUMPTION_NEED - total_production)

        return {
            "national_yield_hg_ha": round(national_yield, 1),
            "total_production_tonnes": round(total_production, 0),
            "import_requirement_tonnes": round(import_requirement, 0),
            "provincial_breakdown": provincial_results,
        }
