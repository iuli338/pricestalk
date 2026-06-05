"""App configuration from environment variables (with safe dev defaults)."""
import os

BASE_DIR = os.path.dirname(__file__)


class Config:
    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-in-prod")
    DEBUG = os.environ.get("DEBUG", "0") == "1"

    # Database: SQLite file by default; override with DATABASE_URL for Postgres etc.
    DATABASE_URL = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'pricestalk.db')}"
    )

    # Background price re-fetch interval (hours); 0 disables the scheduler.
    REFRESH_HOURS = int(os.environ.get("REFRESH_HOURS", "24"))
