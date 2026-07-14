"""
Zimbabwe Agro-Ecological Natural Regions and spatial weights.

Natural Regions I–V are Zimbabwe's official agro-ecological classification
system used by the Ministry of Lands, Agriculture, Water, and Rural Resettlement.
Spatial weights are derived from FAO/ZimVAC land-use classification data.
"""

# Natural Region definitions
NATURAL_REGIONS = {
    "I": {
        "name": "Natural Region I",
        "rainfall_mm_min": 1000,
        "rainfall_mm_max": None,
        "description": "Highveld — tea, coffee, macadamia, exotic timber",
        "typical_crops": ["tea", "coffee", "macadamia"],
        "primary_system": "mixed",
    },
    "II": {
        "name": "Natural Region II",
        "rainfall_mm_min": 750,
        "rainfall_mm_max": 1000,
        "description": "Commercial farming belt — maize, tobacco, cotton, soya",
        "typical_crops": ["Maize", "Tobacco", "Cotton", "Soybeans"],
        "primary_system": "rain_fed",
    },
    "III": {
        "name": "Natural Region III",
        "rainfall_mm_min": 650,
        "rainfall_mm_max": 800,
        "description": "Semi-intensive — maize, small grains, tobacco",
        "typical_crops": ["Maize", "Sorghum", "Millet", "Sunflower"],
        "primary_system": "rain_fed",
    },
    "IV": {
        "name": "Natural Region IV",
        "rainfall_mm_min": 450,
        "rainfall_mm_max": 650,
        "description": "Extensive — small grains, livestock, cotton",
        "typical_crops": ["Sorghum", "Millet", "Cotton"],
        "primary_system": "rain_fed",
    },
    "V": {
        "name": "Natural Region V",
        "rainfall_mm_min": 0,
        "rainfall_mm_max": 450,
        "description": "Arid — extensive livestock, marginal cropping",
        "typical_crops": ["Sorghum", "Millet"],
        "primary_system": "rain_fed",
    },
}

# Crop failure thresholds (hg/ha) — below this = subsistence failure
CROP_FAILURE_THRESHOLDS = {
    "Maize": 10000,
    "Wheat": 8000,
    "Sorghum": 6000,
    "Millet": 5000,
    "Cotton": 4000,
    "Soybeans": 7000,
    "Sunflower": 4000,
    "Tobacco": 8000,
    "default": 8000,
}

# Bumper crop thresholds (hg/ha) — above this = exceptional yield
BUMPER_CROP_THRESHOLDS = {
    "Maize": 55000,
    "Wheat": 45000,
    "Sorghum": 30000,
    "Millet": 25000,
    "Cotton": 20000,
    "Soybeans": 35000,
    "Sunflower": 20000,
    "Tobacco": 35000,
    "default": 35000,
}

# Province → Natural Region composition weights
# Weights represent the fraction of cultivated area in each Natural Region
# Source: FAO/ZimVAC land-use classification 2020
PROVINCE_TO_REGION_WEIGHTS = {
    "Manicaland":         {"I": 0.15, "II": 0.45, "III": 0.25, "IV": 0.10, "V": 0.05},
    "Mashonaland_Central":{"I": 0.05, "II": 0.55, "III": 0.25, "IV": 0.15, "V": 0.00},
    "Mashonaland_East":   {"I": 0.05, "II": 0.60, "III": 0.20, "IV": 0.15, "V": 0.00},
    "Mashonaland_West":   {"I": 0.05, "II": 0.55, "III": 0.25, "IV": 0.15, "V": 0.00},
    "Masvingo":           {"I": 0.00, "II": 0.10, "III": 0.20, "IV": 0.40, "V": 0.30},
    "Matabeleland_North": {"I": 0.00, "II": 0.05, "III": 0.15, "IV": 0.45, "V": 0.35},
    "Matabeleland_South": {"I": 0.00, "II": 0.05, "III": 0.10, "IV": 0.40, "V": 0.45},
    "Midlands":           {"I": 0.00, "II": 0.20, "III": 0.40, "IV": 0.30, "V": 0.10},
    "Harare":             {"I": 0.05, "II": 0.70, "III": 0.20, "IV": 0.05, "V": 0.00},
    "Bulawayo":           {"I": 0.00, "II": 0.10, "III": 0.30, "IV": 0.40, "V": 0.20},
}

# National province weights (proportional to cultivated area, ha)
# Source: ZimStat Agricultural Survey 2021
NATIONAL_PROVINCE_WEIGHTS = {
    "Manicaland":          0.11,
    "Mashonaland_Central": 0.14,
    "Mashonaland_East":    0.16,
    "Mashonaland_West":    0.18,
    "Masvingo":            0.13,
    "Matabeleland_North":  0.07,
    "Matabeleland_South":  0.06,
    "Midlands":            0.12,
    "Harare":              0.02,
    "Bulawayo":            0.01,
}

PROVINCES = list(NATIONAL_PROVINCE_WEIGHTS.keys())
SYSTEM_TYPES = ["rain_fed", "irrigated"]

# Zimbabwe bounding box for raster clipping
ZIMBABWE_BBOX = {
    "min_lon": 25.2,
    "max_lon": 33.1,
    "min_lat": -22.4,
    "max_lat": -15.6,
}
