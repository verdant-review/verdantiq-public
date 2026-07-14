"""
APScheduler background worker for VerdantIQ data pipeline.

Jobs:
  - ONI:   monthly  (1st of each month at 06:00 UTC)
  - CHIRPS: weekly  (every Monday at 07:00 UTC)
  - NDVI:  bi-weekly (every other Monday at 08:00 UTC)
  - Macro: monthly  (1st of each month at 09:00 UTC)

Run as a standalone process:
    python -m scheduler.worker
"""

import logging
import sys
from datetime import datetime

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from scheduler.store import get_jobstores

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, stream=sys.stdout)


def refresh_oni():
    """Monthly ONI refresh."""
    from ingestion.oni import ONIConnector
    logger.info("[scheduler] Refreshing ONI data")
    try:
        connector = ONIConnector()
        result = connector.fetch_latest()
        logger.info("[scheduler] ONI refresh complete: phase=%s, value=%.2f",
                    result.get("enso_phase"), result.get("oni_value", 0))
    except Exception as exc:
        logger.error("[scheduler] ONI refresh failed: %s", exc)


def refresh_chirps():
    """Weekly CHIRPS rainfall refresh."""
    from ingestion.chirps import CHIRPSConnector
    from datetime import date, timedelta
    logger.info("[scheduler] Refreshing CHIRPS data")
    try:
        connector = CHIRPSConnector()
        today = date.today()
        # Fetch the previous month (CHIRPS has ~2 week lag)
        first_of_prev = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
        result = connector.fetch(
            first_of_prev.strftime("%Y-%m-%d"),
            first_of_prev.strftime("%Y-%m-%d"),
        )
        logger.info("[scheduler] CHIRPS refresh complete: %d records", len(result))
    except Exception as exc:
        logger.error("[scheduler] CHIRPS refresh failed: %s", exc)


def refresh_ndvi():
    """Bi-weekly NDVI: check pending tasks and submit new ones."""
    from ingestion.ndvi import NDVIConnector
    from datetime import date
    logger.info("[scheduler] Refreshing NDVI data")
    try:
        connector = NDVIConnector()
        result = connector.fetch_latest()
        logger.info("[scheduler] NDVI refresh complete: source=%s", result.get("source"))
    except Exception as exc:
        logger.error("[scheduler] NDVI refresh failed: %s", exc)


def refresh_macro():
    """Monthly macro data refresh."""
    from ingestion.macro import MacroConnector
    from datetime import date
    logger.info("[scheduler] Refreshing macro data")
    try:
        connector = MacroConnector()
        result = connector.fetch_latest()
        logger.info("[scheduler] Macro refresh complete: cpi=%.1f%%", result.get("cpi_annual_pct", 0))
    except Exception as exc:
        logger.error("[scheduler] Macro refresh failed: %s", exc)


def create_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(jobstores=get_jobstores())

    scheduler.add_job(refresh_oni,   CronTrigger(day=1, hour=6, minute=0),  id="oni_monthly",   replace_existing=True)
    scheduler.add_job(refresh_chirps, CronTrigger(day_of_week="mon", hour=7, minute=0), id="chirps_weekly", replace_existing=True)
    scheduler.add_job(refresh_ndvi,  CronTrigger(day_of_week="mon", week="*/2", hour=8, minute=0), id="ndvi_biweekly", replace_existing=True)
    scheduler.add_job(refresh_macro, CronTrigger(day=1, hour=9, minute=0),  id="macro_monthly", replace_existing=True)

    return scheduler


if __name__ == "__main__":
    logger.info("VerdantIQ data pipeline scheduler starting...")
    scheduler = create_scheduler()
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
