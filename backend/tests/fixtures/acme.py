"""Acme Corp — a hand-checked fixture company.

Base year (FY2025): revenue 1,000, EBITDA 200 (20%), D&A 40, capex 50, debt 300, cash 100,
100 shares at 12.00 (market cap 1,200). History FY2022–FY2025 grows ~7.7% a year at a flat 20% margin.

Model assumptions (``ACME_VALUES``) are chosen so every number can be worked by hand:
growth fades 8% → 7% → 6% → 5% → 4% (g₁ = 8%, terminal 3%, T = 5), margin 20%, D&A 4%, capex 5%,
terminal capex 1.25 × D&A = 5% (so capex does not fade), NWC 10% of revenue, tax 25%, WACC 10%, exit multiple 8.0x.

Hand calculation (end-of-year discounting):
  Revenue     1,080.00  1,155.60  1,224.94  1,286.18  1,337.63
  EBITDA        216.00    231.12    244.99    257.24    267.53
  EBIT          172.80    184.90    195.99    205.79    214.02
  NOPAT         129.60    138.67    146.99    154.34    160.52
  + D&A          43.20     46.22     49.00     51.45     53.51
  − capex        54.00     57.78     61.25     64.31     66.88
  − ΔNWC          8.00      7.56      6.93      6.12      5.14
  UFCF          110.80    119.56    127.81    135.36    141.99   (= 11% of revenue − ΔNWC)
  Σ PV(UFCF) = 476.18
  TV perpetuity = 141.9946 × 1.03 / 0.07 = 2,089.35 → PV 1,297.32 → EV 1,773.50 → equity 1,573.50 → 15.73 / share
  TV exit       = 8.0 × 267.526           = 2,140.21 → PV 1,328.90 → EV 1,805.08 → equity 1,605.08 → 16.05 / share
With mid-year convention: Σ PV = 499.42; perpetuity PV(TV) at t = 4.5 → 1,360.64 → 16.60 / share;
exit PV(TV) at t = 5 unchanged → 16.28 / share.

LBO (25% premium → 15.00 offer, equity 1,500; entry EV 1,700 = 8.5x):
  Uses 1,500 + 300 refinance + 34 advisory (2% EV) + 18 financing (2% of 900) + 20 min cash = 1,872
  Sources 600 senior (3.0x) + 300 sub (1.5x) + 100 existing cash + 872 sponsor equity
  Y1 interest 48 + 33 = 81; taxes (172.80 − 81) × 25% = 22.95; FCF 216 − 81 − 22.95 − 54 − 8 = 50.05;
     mandatory 30, sweep 20.05 → senior 549.95; net debt 829.95 → 3.84x; coverage 2.67x
  … senior at exit (Y5) 231.10; net debt 511.10; exit EV 8.0 × 267.53 = 2,140.21; exit equity 1,629.11
  MOIC 1,629.11 / 872 = 1.8682x; IRR = 1.8682^(1/5) − 1 = 13.31%
"""

from __future__ import annotations

import datetime as dt

from app.engine.dcf import BalanceSheetBridge
from app.engine.valuation import CompanyContext
from app.schemas.company import CompanyProfile, Financials, FinancialYear, MarketData

ACME_VALUES: dict[str, float] = {
    "revenue_growth": 0.08, "ebitda_margin": 0.20, "da_pct_revenue": 0.04, "capex_pct_revenue": 0.05, "terminal_capex_to_da": 1.25, "nwc_pct_revenue": 0.10,
    "tax_rate": 0.25, "projection_years": 5, "risk_free": 0.04, "equity_risk_premium": 0.05, "beta": 1.0, "cost_of_debt": 0.06,
    "debt_weight": 0.2, "wacc": 0.10, "terminal_growth": 0.03, "exit_multiple": 8.0, "offer_premium": 0.25, "advisory_fee_pct": 0.02,
    "financing_fee_pct": 0.02, "min_cash_pct_revenue": 0.02, "senior_leverage": 3.0, "senior_rate": 0.08, "senior_amortization": 0.05,
    "sub_leverage": 1.5, "sub_rate": 0.11, "revolver_size": 0.5, "revolver_rate": 0.07, "cash_sweep": 1.0, "exit_year": 5,
    "max_net_leverage": 6.0, "min_interest_coverage": 2.0,
}

ACME_CONTEXT = CompanyContext(
    revenue0=1000.0, ltm_ebitda=200.0, price=12.0,
    bridge=BalanceSheetBridge(total_debt=300.0, cash=100.0, minority_interest=0.0, non_operating_assets=0.0, shares=100.0),
)

# (fiscal year, revenue, EBITDA, OCF, capex)
_HISTORY = [(2022, 800.0, 160.0, 130.0, 40.0), (2023, 860.0, 172.0, 140.0, 43.0), (2024, 925.0, 185.0, 150.0, 46.25), (2025, 1000.0, 200.0, 160.0, 50.0)]


def acme_financials() -> Financials:
    years = []
    for fy, rev, ebitda, ocf, capex in _HISTORY:
        da = rev * 0.04
        ebit = ebitda - da
        interest = 18.0
        pretax = ebit - interest
        tax = pretax * 0.25
        years.append(FinancialYear(
            fiscal_year=fy, period_end=dt.date(fy, 12, 31), revenue=rev, gross_profit=rev * 0.45, ebitda=ebitda, ebit=ebit, d_and_a=da,
            interest_expense=interest, pretax_income=pretax, tax_expense=tax, net_income=pretax - tax, operating_cash_flow=ocf,
            capex=capex, free_cash_flow=ocf - capex, dividends_paid=20.0, total_debt=300.0, cash=100.0, total_equity=500.0 + (fy - 2022) * 60,
            minority_interest=0.0, total_assets=1500.0, receivables=rev * 0.15, inventory=rev * 0.05, payables=rev * 0.10,
            net_working_capital=rev * 0.10, long_term_investments=0.0, shares_outstanding=100.0,
        ))
    return Financials(currency="USD", years=years)


def acme_market() -> MarketData:
    return MarketData(
        currency="USD", price=12.0, shares_outstanding=100.0, market_cap=1200.0, beta=1.0, total_debt=300.0, cash=100.0,
        enterprise_value=1400.0, fifty_two_week_low=9.5, fifty_two_week_high=14.0, dividend_per_share=0.20, book_value_per_share=6.8,
        return_on_equity=0.17, trailing_eps=1.2, fx_rate=1.0, trading_currency="USD", price_in_trading_currency=12.0,
    )


def acme_profile(ticker: str = "ACME", industry: str = "Specialty Industrial Machinery", sector: str = "Industrials") -> CompanyProfile:
    return CompanyProfile(ticker=ticker, name="Acme Corp", sector=sector, industry=industry, industry_key="specialty-industrial-machinery",
                          sector_key="industrials", country="United States", exchange="NYSE", website="https://acme.example",
                          summary="Acme Corp makes anvils, rockets and other precision equipment for the discerning coyote.",
                          quote_type="EQUITY", currency="USD", trading_currency="USD")
