"""
One-time historical data backfill.

Fetches ONI data from NOAA for the full available history and caches it locally.
Also validates that seed CSVs are present and parseable.

Usage:
    python scripts/backfill_data.py
"""

import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    # ONI — full history
    logger.info("Backfilling ONI data...")
    try:
        from ingestion.oni import ONIConnector
        connector = ONIConnector()
        df = connector.fetch("1950-01-01", "2026-03-01")
        logger.info("ONI: %d records fetched and cached", len(df))
    except Exception as exc:
        logger.error("ONI backfill failed: %s", exc)

    # Validate seed CSVs
    from config.settings import BASE_DIR
    seeds = [
        BASE_DIR / "data" / "seeds" / "input_costs.csv",
        BASE_DIR / "data" / "seeds" / "fx_rates.csv",
    ]
    import pandas as pd
    for path in seeds:
        if path.exists():
            df = pd.read_csv(path)
            logger.info("Seed CSV %s: %d rows, columns: %s", path.name, len(df), list(df.columns))
        else:
            logger.warning("Missing seed CSV: %s", path)

    # Policy calendar
    from ingestion.policy import PolicyConnector
    policy = PolicyConnector()
    df = policy.fetch("2018-01-01", "2026-03-01")
    logger.info("Policy dummies: %d months, columns: %s", len(df), list(df.columns))

    logger.info("Backfill complete.")


if __name__ == "__main__":
    main()
