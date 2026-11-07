"""Normalise provider statements into a consistent set of line items.

Different companies (and different yfinance versions) label the same concept differently, e.g.
"Total Revenue" vs "Operating Revenue". Each normalised field lists its candidate labels in order
of preference; the first one present with a finite value wins. Derived fallbacks (e.g. EBITDA =
EBIT + D&A) are applied afterwards and recorded so data quality can report them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from app.schemas.company import Financials, FinancialYear

MAX_YEARS = 5


@dataclass(frozen=True)
class RawStatements:
    """Annual statements as provider-native frames: rows = line items, columns = period-end dates."""

    income: pd.DataFrame
    balance: pd.DataFrame
    cashflow: pd.DataFrame

INCOME_ALIASES: dict[str, tuple[str, ...]] = {
    "revenue": ("Total Revenue", "Operating Revenue", "Revenue"),
    "gross_profit": ("Gross Profit",),
    "ebitda": ("EBITDA", "Normalized EBITDA"),
    "ebit": ("EBIT", "Operating Income", "Total Operating Income As Reported"),
    "interest_expense": ("Interest Expense", "Interest Expense Non Operating"),
    "pretax_income": ("Pretax Income",),
    "tax_expense": ("Tax Provision", "Income Tax Expense"),
    "net_income": ("Net Income Common Stockholders", "Net Income", "Net Income From Continuing Operation Net Minority Interest"),
    "d_and_a_is": ("Reconciled Depreciation", "Depreciation And Amortization In Income Statement", "Depreciation Amortization Depletion Income Statement"),
}

BALANCE_ALIASES: dict[str, tuple[str, ...]] = {
    "total_debt": ("Total Debt",),
    "long_term_debt": ("Long Term Debt And Capital Lease Obligation", "Long Term Debt"),
    "current_debt": ("Current Debt And Capital Lease Obligation", "Current Debt"),
    "cash": ("Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents", "Cash Financial"),
    "total_equity": ("Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest"),
    "minority_interest": ("Minority Interest",),
    "total_assets": ("Total Assets",),
    "receivables": ("Accounts Receivable", "Receivables", "Gross Accounts Receivable"),
    "inventory": ("Inventory",),
    "payables": ("Accounts Payable", "Payables", "Payables And Accrued Expenses"),
    "current_assets": ("Current Assets",),
    "current_liabilities": ("Current Liabilities",),
    "long_term_investments": ("Long Term Equity Investment", "Investments And Advances", "Investmentin Financial Assets"),
    "shares_outstanding": ("Ordinary Shares Number", "Share Issued"),
}

CASHFLOW_ALIASES: dict[str, tuple[str, ...]] = {
    "operating_cash_flow": ("Operating Cash Flow", "Cash Flow From Continuing Operating Activities"),
    "capex": ("Capital Expenditure", "Purchase Of PPE", "Net PPE Purchase And Sale"),
    "free_cash_flow": ("Free Cash Flow",),
    "dividends_paid": ("Cash Dividends Paid", "Common Stock Dividend Paid"),
    "d_and_a_cf": ("Depreciation And Amortization", "Depreciation Amortization Depletion", "Depreciation"),
}


@dataclass
class NormalizationReport:
    """Facts discovered while normalising, consumed by the data-quality checks."""

    fallbacks: list[str] = field(default_factory=list)
    dropped_periods: list[str] = field(default_factory=list)


def _finite(value: object) -> float | None:
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _pick(frame: pd.DataFrame, column: pd.Timestamp, labels: tuple[str, ...]) -> float | None:
    if frame.empty or column not in frame.columns:
        return None
    for label in labels:
        if label in frame.index:
            value = _finite(frame.at[label, column])
            if value is not None:
                return value
    return None


def _periods(raw: RawStatements) -> list[pd.Timestamp]:
    """Period-end dates that have a revenue figure, ascending, most recent ``MAX_YEARS`` only."""
    if raw.income.empty:
        return []
    periods = sorted(pd.Timestamp(c) for c in raw.income.columns)
    return periods[-MAX_YEARS:]


def normalize_statements(raw: RawStatements, currency: str) -> tuple[Financials, NormalizationReport]:
    """Map raw statements to ``Financials``. Never invents numbers: missing stays ``None``."""
    report = NormalizationReport()
    years: list[FinancialYear] = []
    for period in _periods(raw):
        inc = {k: _pick(raw.income, period, v) for k, v in INCOME_ALIASES.items()}
        bal = {k: _pick(raw.balance, period, v) for k, v in BALANCE_ALIASES.items()}
        cf = {k: _pick(raw.cashflow, period, v) for k, v in CASHFLOW_ALIASES.items()}
        if inc["revenue"] is None:
            report.dropped_periods.append(period.date().isoformat())
            continue
        years.append(_build_year(period, inc, bal, cf, report))
    return Financials(currency=currency, years=years), report


def _build_year(
    period: pd.Timestamp,
    inc: dict[str, float | None],
    bal: dict[str, float | None],
    cf: dict[str, float | None],
    report: NormalizationReport,
) -> FinancialYear:
    fy = period.year
    d_and_a = cf["d_and_a_cf"] if cf["d_and_a_cf"] is not None else inc["d_and_a_is"]
    if d_and_a is not None:
        d_and_a = abs(d_and_a)

    ebit = inc["ebit"]
    ebitda = inc["ebitda"]
    if ebitda is None and ebit is not None and d_and_a is not None:
        ebitda = ebit + d_and_a
        report.fallbacks.append(f"FY{fy}: EBITDA derived as EBIT + D&A")
    if ebit is None and ebitda is not None and d_and_a is not None:
        ebit = ebitda - d_and_a
        report.fallbacks.append(f"FY{fy}: EBIT derived as EBITDA - D&A")

    total_debt = bal["total_debt"]
    if total_debt is None and (bal["long_term_debt"] is not None or bal["current_debt"] is not None):
        total_debt = (bal["long_term_debt"] or 0.0) + (bal["current_debt"] or 0.0)
        report.fallbacks.append(f"FY{fy}: total debt summed from long-term and current debt")

    nwc = _operating_nwc(bal, fy, report)
    capex = abs(cf["capex"]) if cf["capex"] is not None else None
    fcf = cf["free_cash_flow"]
    if fcf is None and cf["operating_cash_flow"] is not None and capex is not None:
        fcf = cf["operating_cash_flow"] - capex

    interest = inc["interest_expense"]
    return FinancialYear(
        fiscal_year=fy,
        period_end=period.date(),
        revenue=inc["revenue"],
        gross_profit=inc["gross_profit"],
        ebitda=ebitda,
        ebit=ebit,
        d_and_a=d_and_a,
        interest_expense=abs(interest) if interest is not None else None,
        pretax_income=inc["pretax_income"],
        tax_expense=inc["tax_expense"],
        net_income=inc["net_income"],
        operating_cash_flow=cf["operating_cash_flow"],
        capex=capex,
        free_cash_flow=fcf,
        dividends_paid=abs(cf["dividends_paid"]) if cf["dividends_paid"] is not None else None,
        total_debt=total_debt,
        cash=bal["cash"],
        total_equity=bal["total_equity"],
        minority_interest=bal["minority_interest"],
        total_assets=bal["total_assets"],
        receivables=bal["receivables"],
        inventory=bal["inventory"],
        payables=bal["payables"],
        net_working_capital=nwc,
        long_term_investments=bal["long_term_investments"],
        shares_outstanding=bal["shares_outstanding"],
    )


def _operating_nwc(bal: dict[str, float | None], fy: int, report: NormalizationReport) -> float | None:
    """Operating NWC = receivables + inventory - payables.

    Fallback when those are missing: (current assets - cash) - (current liabilities - current debt),
    which strips financing items out of the reported working capital.
    """
    if bal["receivables"] is not None or bal["payables"] is not None:
        return (bal["receivables"] or 0.0) + (bal["inventory"] or 0.0) - (bal["payables"] or 0.0)
    if bal["current_assets"] is not None and bal["current_liabilities"] is not None:
        report.fallbacks.append(f"FY{fy}: NWC derived from current assets/liabilities ex cash and debt")
        return (bal["current_assets"] - (bal["cash"] or 0.0)) - (bal["current_liabilities"] - (bal["current_debt"] or 0.0))
    return None
