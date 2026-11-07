"""Dependency wiring. Tests override ``get_service`` to inject a fake provider."""

from __future__ import annotations

from functools import lru_cache

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.cache import TTLStore
from app.core.config import get_settings
from app.data.yfinance_provider import YFinanceProvider
from app.services.company import CompanyService

limiter = Limiter(key_func=get_remote_address, default_limits=[get_settings().rate_limit_default])


@lru_cache
def get_service() -> CompanyService:
    settings = get_settings()
    return CompanyService(YFinanceProvider(settings, TTLStore(settings.cache_max_entries)), settings)
