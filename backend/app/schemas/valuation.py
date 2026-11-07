"""Valuation request and response schemas."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.assumptions import CorrelationSpec, Distribution

TerminalMethod = Literal["perpetuity", "exit_multiple"]


class SimSettings(BaseModel):
    n_sims: int = Field(default=10_000, ge=500, le=100_000)
    seed: int | None = Field(default=42, ge=0, le=2**32 - 1)
    hurdle_irr: float = Field(default=0.20, ge=0.0, le=1.0)
    terminal_method: TerminalMethod = "perpetuity"
    mid_year: bool = True


class ValuationRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    overrides: dict[str, float] = Field(default_factory=dict, description="Assumption key -> value")
    distributions: dict[str, Distribution] = Field(default_factory=dict, description="Override distribution per stochastic driver")
    correlation: CorrelationSpec | None = None
    settings: SimSettings = Field(default_factory=SimSettings)
    peers: list[str] | None = Field(default=None, max_length=12, description="Peer tickers; None = automatic peer set")

    @field_validator("ticker")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


# ----------------------------------------------------------------------------- DCF


class DcfYear(BaseModel):
    year: int
    revenue: float
    growth: float
    ebitda: float
    ebitda_margin: float
    d_and_a: float
    ebit: float
    taxes: float
    nopat: float
    capex: float
    delta_nwc: float
    ufcf: float
    discount_factor: float
    pv_ufcf: float


class DcfResult(BaseModel):
    years: list[DcfYear]
    wacc: float
    terminal_growth: float
    exit_multiple: float
    mid_year: bool
    sum_pv_ufcf: float
    tv_perpetuity: float
    tv_exit: float
    pv_tv_perpetuity: float
    pv_tv_exit: float
    ev_perpetuity: float
    ev_exit: float
    net_debt: float
    minority_interest: float
    non_operating_assets: float
    equity_perpetuity: float
    equity_exit: float
    price_perpetuity: float
    price_exit: float
    upside_perpetuity: float
    upside_exit: float
    tv_share_perpetuity: float = Field(description="PV of terminal value / EV under perpetuity method")
    implied_multiple_from_perpetuity: float = Field(description="TV(perpetuity) / final-year EBITDA")
    implied_growth_from_exit: float = Field(description="Perpetual growth implied by the exit-multiple TV")


# ----------------------------------------------------------------------------- LBO


class SourceUse(BaseModel):
    label: str
    amount: float
    pct: float
    ebitda_multiple: float | None = None


class LboYear(BaseModel):
    year: int
    revenue: float
    ebitda: float
    interest_senior: float
    interest_sub: float
    interest_revolver: float
    taxes: float
    capex: float
    delta_nwc: float
    fcf_before_debt: float
    mandatory_amortization: float
    revolver_draw: float
    revolver_repay: float
    cash_sweep: float
    senior_end: float
    sub_end: float
    revolver_end: float
    cash_end: float
    total_debt: float
    net_debt: float
    net_leverage: float
    interest_coverage: float
    leverage_breach: bool
    coverage_breach: bool


class LboResult(BaseModel):
    feasible: bool
    infeasible_reason: str | None = None
    offer_price: float
    offer_premium: float
    entry_equity_value: float
    entry_ev: float
    entry_multiple: float
    ltm_ebitda: float
    sources: list[SourceUse]
    uses: list[SourceUse]
    sponsor_equity: float
    schedule: list[LboYear]
    exit_year: int
    exit_multiple: float
    exit_ev: float
    exit_net_debt: float
    exit_equity: float
    irr: float
    moic: float
    max_net_leverage: float
    min_interest_coverage: float


# ----------------------------------------------------------------------------- Monte Carlo


class HistogramBin(BaseModel):
    start: float
    end: float
    count: int


class DistributionStats(BaseModel):
    mean: float
    std: float
    min: float
    max: float
    p5: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    p95: float
    histogram: list[HistogramBin]
    outside_histogram: int = Field(description="Samples beyond the displayed range (P0.5–P99.5)")


class CovenantBreachYear(BaseModel):
    year: int
    leverage: float
    coverage: float
    any: float


class ConvergencePoint(BaseModel):
    n: int
    mean: float
    lower: float
    upper: float


class InputSummary(BaseModel):
    key: str
    label: str
    unit: str
    base: float
    mean: float
    p5: float
    p95: float
    distribution: Distribution


class MonteCarloResult(BaseModel):
    n_sims: int
    seed: int | None
    elapsed_ms: float
    terminal_method: TerminalMethod
    price: DistributionStats
    enterprise_value: DistributionStats
    prob_price_above_current: float
    irr: DistributionStats | None
    moic: DistributionStats | None
    prob_irr_above_hurdle: float | None
    prob_loss: float | None
    hurdle_irr: float
    covenant_breach: list[CovenantBreachYear]
    convergence: list[ConvergencePoint]
    inputs: list[InputSummary]
    correlation: CorrelationSpec
    notes: list[str]


class TornadoItem(BaseModel):
    key: str
    label: str
    unit: str
    low_input: float
    high_input: float
    price_low: float
    price_high: float
    irr_low: float | None
    irr_high: float | None
    price_swing: float


class SensitivityResult(BaseModel):
    base_price: float
    base_irr: float | None
    items: list[TornadoItem]


# ----------------------------------------------------------------------------- Comps & football field


class Peer(BaseModel):
    ticker: str
    name: str
    currency: str | None
    market_cap: float | None
    enterprise_value: float | None
    ev_ebitda: float | None
    ev_revenue: float | None
    pe: float | None
    included: bool
    note: str | None = None


class MultipleRange(BaseModel):
    metric: Literal["ev_ebitda", "ev_revenue", "pe"]
    label: str
    count: int
    low: float
    median: float
    high: float
    implied_price_low: float | None
    implied_price_mid: float | None
    implied_price_high: float | None


class CompsResult(BaseModel):
    peers: list[Peer]
    ranges: list[MultipleRange]
    source: str


class FootballBar(BaseModel):
    label: str
    kind: Literal["market", "comps", "dcf", "lbo"]
    low: float
    high: float
    mid: float | None = None
    note: str | None = None


class FootballField(BaseModel):
    current_price: float
    bars: list[FootballBar]


class ValuationResponse(BaseModel):
    ticker: str
    currency: str
    generated_at: dt.datetime
    current_price: float
    assumptions_used: dict[str, float]
    settings: SimSettings
    dcf: DcfResult
    lbo: LboResult
    monte_carlo: MonteCarloResult
    sensitivity: SensitivityResult
    comps: CompsResult
    football_field: FootballField
    warnings: list[str]
