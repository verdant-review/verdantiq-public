import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Cache
CACHE_DIR = os.getenv("CACHE_DIR", str(BASE_DIR / "cache"))
CACHE_MAX_AGE_HOURS = int(os.getenv("CACHE_MAX_AGE_HOURS", "168"))  # 1 week default

# Database
DB_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'verdantiq.db'}")

# NASA APPEEARS (NDVI)
NASA_EARTHDATA_USER = os.getenv("NASA_EARTHDATA_USER", "")
NASA_EARTHDATA_PASS = os.getenv("NASA_EARTHDATA_PASS", "")

# Model paths
MODELS_DIR = BASE_DIR / "models"
LEGACY_MODEL_PATH = MODELS_DIR / "legacy" / "bagging_regressor_model_zimbabwe.joblib"
LEGACY_AREA_ENCODER_PATH = MODELS_DIR / "legacy" / "area_label_encoder_zimbabwe.pkl"
LEGACY_ITEM_ENCODER_PATH = MODELS_DIR / "legacy" / "item_label_encoder_zimbabwe.pkl"

# Data freshness thresholds (hours)
FRESHNESS = {
    "chirps": 168,    # weekly
    "ndvi": 336,      # bi-weekly
    "oni": 720,       # monthly
    "macro": 720,     # monthly
}

# Model version
MODEL_VERSION = os.getenv("MODEL_VERSION", "2.0.0")
