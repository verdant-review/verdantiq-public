"""
Per-capita cereal consumption norms and provincial population data.
Used for food security score calculation at the provincial/national level.

Sources:
- Population: ZimStat Census 2022 projections
- Cereal norms: FAO/WFP Zimbabwe Emergency Food Security Assessment
"""

# Per-capita cereal requirement (kg/person/year)
PER_CAPITA_CEREAL_KG_YEAR = 180.0  # FAO Zimbabwe standard

# Provincial populations (2024 estimates)
PROVINCE_POPULATION = {
    "Manicaland":          2_021_000,
    "Mashonaland_Central": 1_273_000,
    "Mashonaland_East":    1_344_000,
    "Mashonaland_West":    1_501_000,
    "Masvingo":            1_486_000,
    "Matabeleland_North":    770_000,
    "Matabeleland_South":    703_000,
    "Midlands":            1_711_000,
    "Harare":              2_124_000,
    "Bulawayo":              676_000,
}

NATIONAL_POPULATION = sum(PROVINCE_POPULATION.values())

# National annual cereal consumption requirement (tonnes)
NATIONAL_CONSUMPTION_NEED = NATIONAL_POPULATION * PER_CAPITA_CEREAL_KG_YEAR / 1000

# Food security score thresholds (production / need ratio)
FOOD_SECURITY_THRESHOLDS = {
    "surplus":     1.10,   # > 110% of need
    "adequate":    0.90,   # 90–110% of need
    "stressed":    0.70,   # 70–90% of need
    "crisis":      0.50,   # 50–70% of need
    "emergency":   0.00,   # < 50% of need
}

def food_security_score(production_tonnes: float, province: str) -> float:
    """Returns a 0–1 score: production / provincial consumption need."""
    need = PROVINCE_POPULATION[province] * PER_CAPITA_CEREAL_KG_YEAR / 1000
    return min(production_tonnes / need, 1.5)  # cap at 1.5 (surpluses above 150% capped)

def food_security_label(score: float) -> str:
    thresholds = FOOD_SECURITY_THRESHOLDS
    if score >= thresholds["surplus"]:
        return "surplus"
    elif score >= thresholds["adequate"]:
        return "adequate"
    elif score >= thresholds["stressed"]:
        return "stressed"
    elif score >= thresholds["crisis"]:
        return "crisis"
    return "emergency"
