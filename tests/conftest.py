"""Shared pytest fixtures."""

from __future__ import annotations

import pytest

from src.core.config import Settings


@pytest.fixture()
def settings() -> Settings:
    """Return a Settings instance with test-safe defaults.

    Overrides secrets and database URLs so tests never touch
    production resources.
    """
    return Settings(
        database_url="postgresql+asyncpg://test:test@localhost:5432/test_db",
        jwt_secret_key="test-secret-key-not-for-production",
        google_api_key="test-google-key",
        tavily_api_key="test-tavily-key",
        minio_endpoint="http://localhost:9000",
        minio_access_key="minioadmin",
        minio_secret_key="minioadmin",
        app_env="testing",
        log_level="DEBUG",
    )
