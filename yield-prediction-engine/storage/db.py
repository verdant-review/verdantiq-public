"""SQLAlchemy + SQLite forecast log."""

from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Text
from sqlalchemy.orm import DeclarativeBase, Session
from config.settings import DB_URL


class Base(DeclarativeBase):
    pass


class ForecastLog(Base):
    __tablename__ = "forecast_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    year = Column(Integer)
    crop = Column(String(100))
    natural_region = Column(String(10))
    system_type = Column(String(20))
    point_estimate = Column(Float)
    p10 = Column(Float)
    p50 = Column(Float)
    p90 = Column(Float)
    crop_failure_probability = Column(Float)
    confidence_level = Column(String(10))
    model_version = Column(String(20))
    request_json = Column(Text)


_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
        Base.metadata.create_all(_engine)
    return _engine


def log_forecast(data: dict) -> None:
    """Write a forecast record to the log table."""
    try:
        engine = get_engine()
        with Session(engine) as session:
            record = ForecastLog(**{
                k: v for k, v in data.items()
                if k in ForecastLog.__table__.columns.keys()
            })
            session.add(record)
            session.commit()
    except Exception:
        pass  # Never let logging failures break a prediction request
