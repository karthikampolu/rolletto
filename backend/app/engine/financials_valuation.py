"""Equity-side valuation for financial companies: justified P/B from ROE, and a Gordon dividend discount model.

Justified P/B (single-stage residual income):  P/B = (ROE − g) / (Ke − g)
Gordon DDM:                                     P = D₀ (1 + g) / (Ke − g)

Growth is the sustainable rate ROE × retention, capped at the country's long-run nominal growth so
the perpetuity is not driven by a few unusually good years.
"""

from __future__ import annotations

import statistics

from app.core.config import CountryDefaults
from app.engine.wacc import BETA_CAP, BETA_FLOOR, blume_adjust, cost_of_equity
from app.schemas.company import DdmValuation, FinancialCompanyValuation, Financials, MarketData, PbRoeValuation

MIN_SPREAD = 0.01  # Ke must exceed g by at least 1pp for a stable perpetuity


def _average_roe(fin: Financials) -> float | None:
    ys = fin.years
    roes = []
    for prev, cur in zip(ys, ys[1:]):
        if cur.net_income is not None and prev.total_equity and cur.total_equity:
            avg_eq = (prev.total_equity + cur.total_equity) / 2
            if avg_eq > 0:
                roes.append(cur.net_income / avg_eq)
    return statistics.fmean(roes[-3:]) if roes else None


def _payout(fin: Financials) -> float:
    pairs = [(y.dividends_paid or 0.0, y.net_income) for y in fin.years[-3:] if y.net_income and y.net_income > 0]
    if not pairs:
        return 0.0
    return max(0.0, min(1.0, sum(d for d, _ in pairs) / sum(n for _, n in pairs)))


def value_financial_company(fin: Financials, market: MarketData, country: CountryDefaults, explanation: str) -> FinancialCompanyValuation:
    notes: list[str] = []
    beta = max(BETA_FLOOR, min(BETA_CAP, blume_adjust(market.beta))) if market.beta is not None else 1.0
    if market.beta is None:
        notes.append("Beta unavailable; 1.0 assumed.")
    ke = cost_of_equity(country.risk_free, beta, country.equity_risk_premium)
    notes.append(f"Cost of equity {ke:.2%} = Rf {country.risk_free:.2%} + β {beta:.2f} (Blume-adjusted) × ERP {country.equity_risk_premium:.2%}.")

    roe = _average_roe(fin)
    if roe is None and market.return_on_equity is not None:
        roe = market.return_on_equity
        notes.append("ROE taken from the provider's trailing figure (statement history insufficient).")
    payout = _payout(fin)
    latest = fin.years[-1] if fin.years else None

    g = None
    if roe is not None:
        g = min(roe * (1 - payout), country.terminal_growth, ke - MIN_SPREAD)
        notes.append(f"Sustainable growth {g:.2%} = min(ROE {roe:.2%} × retention {1 - payout:.0%}, long-run nominal growth {country.terminal_growth:.2%}).")

    pb = None
    if roe is not None and g is not None and latest and latest.total_equity and latest.total_equity > 0 and market.shares_outstanding > 0:
        bvps = latest.total_equity / market.shares_outstanding
        justified = (roe - g) / (ke - g)
        if justified > 0:
            pb = PbRoeValuation(book_value_per_share=bvps, roe=roe, cost_of_equity=ke, growth=g, justified_pb=justified, value_per_share=bvps * justified)
        else:
            notes.append("ROE is below sustainable growth, so the justified P/B is not meaningful.")
    else:
        notes.append("Book value or ROE unavailable; P/B–ROE valuation skipped.")

    ddm = None
    dps = market.dividend_per_share
    if not dps and latest and latest.dividends_paid and market.shares_outstanding > 0:
        dps = latest.dividends_paid / market.shares_outstanding
    if dps and dps > 0 and g is not None:
        ddm = DdmValuation(dividend_per_share=dps, growth=g, cost_of_equity=ke, value_per_share=dps * (1 + g) / (ke - g))
    else:
        notes.append("No dividend history; dividend discount model skipped.")

    price = market.price
    return FinancialCompanyValuation(
        explanation=explanation,
        pb_roe=pb,
        ddm=ddm,
        notes=notes,
        current_price=price,
        upside_pb_roe=pb.value_per_share / price - 1 if pb else None,
        upside_ddm=ddm.value_per_share / price - 1 if ddm else None,
    )
