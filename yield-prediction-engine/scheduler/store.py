"""APScheduler SQLiteJobStore configuration."""

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from config.settings import BASE_DIR

DB_PATH = BASE_DIR / "scheduler.db"

def get_jobstores():
    return {
        "default": SQLAlchemyJobStore(url=f"sqlite:///{DB_PATH}")
    }
