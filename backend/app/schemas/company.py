"""Company-level schemas: profile, market data, cleaned financials, classification, suitability."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.assumptions import AssumptionSet
from app.schemas.common import DataQuality


class SearchResult(BaseModel):
    symbol: str
    name: str
    exchange: str | None = None
    quote_type: str | None = None


class CompanyProfile(BaseModel):
    ticker: str
    name: str
    sector: str | None = None
    industry: str | None = None
    industry_key: str | None = None
    sector_key: str | None = None
    country: str | None = None
    exchange: str | None = None
    website: str | None = None
    summary: str | None = None
    quote_type: str | None = None
    currency: str = Field(description="Reporting (financial statement) currency")
    trading_currency: str = Field(description="Currency the share price is quoted in")


class MarketData(BaseModel):
    """Market data, expressed in the company's reporting currency.

    If the listing trades in a different currency (e.g. an ADR), price and market cap have been
    converted at ``fx_rate`` (reporting units per trading unit) so they are comparable with the
    financial statements.
    """

    currency: str
    price: float
    shares_outstanding: float
    market_cap: float
    beta: float | None = None
    total_debt: float | None = None
    cash: float | None = None
    enterprise_value: float | None = None
    fifty_two_week_low: float | None = None
    fifty_two_week_high: float | None = None
    dividend_per_share: float | None = None
    book_value_per_share: float | None = None
    return_on_equity: float | None = None
    trailing_eps: float | None = None
    fx_rate: float = 1.0
    trading_currency: str
    price_in_trading_currency: float


class FinancialYear(BaseModel):
    """One fiscal year of normalised line items. ``None`` means the provider did not report it."""

    fiscal_year: int
    period_end: dt.date
    revenue: float | None = None
    gross_profit: float | None = None
    ebitda: float | None = None
    ebit: float | None = None
    d_and_a: float | None = None
    interest_expense: float | None = None
    pretax_income: float | None = None
    tax_expense: float | None = None
    net_income: float | None = None
    operating_cash_flow: float | None = None
    capex: float | None = Field(default=None, description="Positive number = cash spent")
    free_cash_flow: float | None = None
    dividends_paid: float | None = Field(default=None, description="Positive number = cash paid out")
    total_debt: float | None = None
    cash: float | None = Field(default=None, description="Cash, equivalents and short-term investments")
    total_equity: float | None = None
    minority_interest: float | None = None
    total_assets: float | None = None
    receivables: float | None = None
    inventory: float | None = None
    payables: float | None = None
    net_working_capital: float | None = Field(default=None, description="Operating NWC: receivables + inventory - payables")
    long_term_investments: float | None = None
    shares_outstanding: float | None = None


class Financials(BaseModel):
    currency: str
    years: list[FinancialYear] = Field(description="Ascending by fiscal year")


class PricePoint(BaseModel):
    date: dt.date
    close: float


CompanyKind = Literal["operating", "bank", "insurer", "nbfc", "reit", "capital_markets"]


class Classification(BaseModel):
    kind: CompanyKind
    is_financial: bool
    reason: str


class SuitabilityComponent(BaseModel):
    key: str
    label: str
    weight: float
    score: float | None = Field(description="0-100, or None when the metric could not be computed")
    metric: float | None = None
    metric_label: str
    reasoning: str


class Suitability(BaseModel):
    score: float
    grade: Literal["Strong", "Moderate", "Weak", "Poor"]
    summary: str
    components: list[SuitabilityComponent]


class PbRoeValuation(BaseModel):
    book_value_per_share: float
    roe: float
    cost_of_equity: float
    growth: float
    justified_pb: float
    value_per_share: float


class DdmValuation(BaseModel):
    dividend_per_share: float
    growth: float
    cost_of_equity: float
    value_per_share: float


class FinancialCompanyValuation(BaseModel):
    """Simplified valuation for banks, insurers, NBFCs and REITs where DCF/LBO do not apply."""

    explanation: str
    pb_roe: PbRoeValuation | None = None
    ddm: DdmValuation | None = None
    notes: list[str]
    current_price: float
    upside_pb_roe: float | None = None
    upside_ddm: float | None = None


class CompanyResponse(BaseModel):
    profile: CompanyProfile
    market: MarketData
    financials: Financials
    data_quality: DataQuality
    classification: Classification
    suitability: Suitability | None = None
    assumptions: AssumptionSet | None = None
    financial_valuation: FinancialCompanyValuation | None = None
    price_history: list[PricePoint]
