"""
VerdantIQ — Yield Prediction Engine v2
Application factory entry point.
"""

import logging
import os

from dotenv import load_dotenv
from flask import Flask

import structlog

load_dotenv()

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)


def create_app() -> Flask:
    app = Flask(__name__)

    # Register blueprints
    from api.v1.routes import v1_bp
    from api.v2.routes import v2_bp
    app.register_blueprint(v1_bp)
    app.register_blueprint(v2_bp, url_prefix="/api/v2")

    # Initialise database
    from storage.db import get_engine
    get_engine()

    # Move legacy model files to models/legacy/ on first boot if not already there
    _migrate_legacy_models()

    return app


def _migrate_legacy_models():
    """Move MVP model files to models/legacy/ so legacy.py can find them."""
    from pathlib import Path
    root = Path(__file__).parent
    legacy_dir = root / "models" / "legacy"
    legacy_dir.mkdir(parents=True, exist_ok=True)

    files_to_move = [
        "bagging_regressor_model_zimbabwe.joblib",
        "bagging_regressor_zimbabwe_model.pkl",
        "area_label_encoder_zimbabwe.pkl",
        "item_label_encoder_zimbabwe.pkl",
    ]
    for fname in files_to_move:
        src = root / fname
        dst = legacy_dir / fname
        if src.exists() and not dst.exists():
            import shutil
            shutil.copy2(src, dst)


app = create_app()

if __name__ == "__main__":
    app.run(debug=False)
