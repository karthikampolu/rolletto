"""Application settings and country-level market defaults."""

from __future__ import annotations

import json
from functools import lru_cache

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class CountryDefaults(BaseModel):
    """Market parameters used when deriving default assumptions for a company domiciled in a country.

    Values are long-run, nominal, local-currency figures. They are starting points only:
    every one of them is user-overridable per request and can be replaced wholesale via the
    ``COUNTRY_OVERRIDES`` environment variable (JSON object keyed by yfinance country name).
    """

    risk_free: float = Field(description="10-year local government bond yield")
    equity_risk_premium: float = Field(description="Mature-market ERP plus country risk premium")
    terminal_growth: float = Field(description="Long-run nominal growth used as terminal growth default")
    tax_rate: float = Field(description="Statutory corporate tax rate, used when effective rate is unusable")
    senior_spread: float = Field(description="Spread over risk-free for a senior secured LBO term loan")
    sub_spread: float = Field(default=0.035, description="Additional spread of subordinated debt over senior")


_BASE_COUNTRY_DEFAULTS: dict[str, CountryDefaults] = {
    "United States": CountryDefaults(risk_free=0.0425, equity_risk_premium=0.045, terminal_growth=0.025, tax_rate=0.25, senior_spread=0.0325),
    "India": CountryDefaults(risk_free=0.066, equity_risk_premium=0.0725, terminal_growth=0.05, tax_rate=0.2517, senior_spread=0.025),
    "United Kingdom": CountryDefaults(risk_free=0.045, equity_risk_premium=0.05, terminal_growth=0.02, tax_rate=0.25, senior_spread=0.035),
    "Germany": CountryDefaults(risk_free=0.026, equity_risk_premium=0.05, terminal_growth=0.02, tax_rate=0.30, senior_spread=0.035),
    "France": CountryDefaults(risk_free=0.033, equity_risk_premium=0.052, terminal_growth=0.02, tax_rate=0.25, senior_spread=0.035),
    "Netherlands": CountryDefaults(risk_free=0.028, equity_risk_premium=0.048, terminal_growth=0.02, tax_rate=0.258, senior_spread=0.035),
    "Switzerland": CountryDefaults(risk_free=0.007, equity_risk_premium=0.045, terminal_growth=0.015, tax_rate=0.196, senior_spread=0.03),
    "Japan": CountryDefaults(risk_free=0.017, equity_risk_premium=0.055, terminal_growth=0.01, tax_rate=0.306, senior_spread=0.02),
    "Canada": CountryDefaults(risk_free=0.033, equity_risk_premium=0.048, terminal_growth=0.02, tax_rate=0.265, senior_spread=0.0325),
    "China": CountryDefaults(risk_free=0.018, equity_risk_premium=0.06, terminal_growth=0.03, tax_rate=0.25, senior_spread=0.03),
    "Taiwan": CountryDefaults(risk_free=0.016, equity_risk_premium=0.055, terminal_growth=0.02, tax_rate=0.20, senior_spread=0.025),
    "South Korea": CountryDefaults(risk_free=0.029, equity_risk_premium=0.055, terminal_growth=0.02, tax_rate=0.24, senior_spread=0.03),
    "Australia": CountryDefaults(risk_free=0.043, equity_risk_premium=0.048, terminal_growth=0.025, tax_rate=0.30, senior_spread=0.0325),
}

#: Fallback when the company's country is unknown or not in the table.
DEFAULT_COUNTRY = "United States"


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (prefix ``ROLLETTO_``) or ``.env``."""

    model_config = SettingsConfigDict(env_prefix="ROLLETTO_", env_file=".env", extra="ignore")

    app_name: str = "Rolletto API"
    environment: str = "development"
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    #: Optional regex of extra allowed origins, e.g. Vercel preview URLs (https://rolletto[a-z0-9-]*\.vercel\.app).
    cors_origin_regex: str | None = None

    cache_ttl_financials_s: int = 12 * 3600
    cache_ttl_market_s: int = 15 * 60
    cache_max_entries: int = 2048

    provider_timeout_s: float = 12.0
    provider_retries: int = 3

    rate_limit_default: str = "120/minute"
    rate_limit_valuation: str = "30/minute"
    rate_limit_export: str = "15/minute"

    default_simulations: int = 10_000
    max_simulations: int = 100_000

    country_overrides: str = ""

    def country_table(self) -> dict[str, CountryDefaults]:
        """Return the country defaults table with any JSON overrides from the environment merged in."""
        table = dict(_BASE_COUNTRY_DEFAULTS)
        if self.country_overrides:
            for name, values in json.loads(self.country_overrides).items():
                base = table.get(name, table[DEFAULT_COUNTRY]).model_dump()
                table[name] = CountryDefaults(**{**base, **values})
        return table

    def country_defaults(self, country: str | None) -> tuple[str, CountryDefaults]:
        """Look up defaults for ``country``, falling back to the United States. Returns (country used, defaults)."""
        table = self.country_table()
        if country and country in table:
            return country, table[country]
        return DEFAULT_COUNTRY, table[DEFAULT_COUNTRY]


@lru_cache
def get_settings() -> Settings:
    return Settings()
