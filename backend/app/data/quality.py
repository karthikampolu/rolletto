"""Data-quality checks run on normalised financials before any valuation is attempted."""

from __future__ import annotations

from app.data.normalize import NormalizationReport
from app.schemas.common import DataQuality, QualityWarning
from app.schemas.company import Financials, MarketData

MIN_YEARS_FOR_DCF = 2


def assess_quality(fin: Financials, market: MarketData, report: NormalizationReport, *, is_financial: bool) -> DataQuality:
    """Return a ``DataQuality`` object; ``usable_for_dcf`` is False if projecting would mean computing on garbage."""
    w: list[QualityWarning] = []
    years = fin.years
    n = len(years)

    def add(code: str, severity: str, message: str) -> None:
        w.append(QualityWarning(code=code, severity=severity, message=message))  # type: ignore[arg-type]

    if n == 0:
        add("no_financials", "error", "No annual financial statements are available for this ticker.")
    elif n < 3:
        add("few_years", "warning", f"Only {n} year(s) of financials available; historical averages are less reliable.")

    for prev, cur in zip(years, years[1:]):
        if cur.fiscal_year - prev.fiscal_year > 1:
            add("missing_year", "warning", f"Gap in reported years between FY{prev.fiscal_year} and FY{cur.fiscal_year}.")

    for period in report.dropped_periods:
        add("dropped_period", "info", f"Period ending {period} was dropped because it has no revenue figure.")

    if years:
        latest = years[-1]
        _check_latest(latest, add, is_financial=is_financial)
        for prev, cur in zip(years, years[1:]):
            if prev.revenue and cur.revenue and prev.revenue > 0 and abs(cur.revenue / prev.revenue - 1) > 1.0:
                add("revenue_jump", "warning", f"Revenue changed by more than 100% in FY{cur.fiscal_year}; check for M&A or restatement.")

    for note in report.fallbacks:
        add("derived_field", "info", note)

    if market.beta is None:
        add("missing_beta", "info", "Beta is not reported; a sector-neutral beta of 1.0 is used (overridable).")
    if market.fx_rate != 1.0:
        add("fx_converted", "info", f"Shares trade in {market.trading_currency} but report in {market.currency}; "
            f"market data converted at {market.fx_rate:.4f} {market.currency}/{market.trading_currency}.")
    if market.total_debt is None:
        add("missing_debt", "warning", "Total debt not reported by the provider; balance-sheet debt is used where available, otherwise zero.")

    errors = [x for x in w if x.severity == "error"]
    warnings = [x for x in w if x.severity == "warning"]
    usable = not errors and n >= MIN_YEARS_FOR_DCF
    grade = "poor" if errors or n < MIN_YEARS_FOR_DCF else ("fair" if len(warnings) >= 2 else "good")
    return DataQuality(grade=grade, years_available=n, usable_for_dcf=usable, warnings=w)


def _check_latest(latest, add, *, is_financial: bool) -> None:  # noqa: ANN001 - small internal helper
    fy = latest.fiscal_year
    if latest.revenue is None or latest.revenue <= 0:
        add("non_positive_revenue", "error", f"FY{fy} revenue is zero or negative; cash flows cannot be projected.")
    if latest.total_equity is not None and latest.total_equity < 0:
        add("negative_equity", "warning", f"Book equity is negative in FY{fy} (often due to buybacks); P/B-style metrics are not meaningful.")
    if is_financial:
        return
    if latest.ebitda is None:
        add("missing_ebitda", "error", f"EBITDA (or EBIT + D&A) is unavailable for FY{fy}.")
    elif latest.ebitda <= 0:
        add("negative_ebitda", "warning", f"FY{fy} EBITDA is negative; leverage-based LBO metrics are not meaningful.")
    if latest.capex is None:
        add("missing_capex", "warning", f"Capex not reported for FY{fy}; the capex assumption falls back to D&A.")
    if latest.d_and_a is None:
        add("missing_da", "warning", f"D&A not reported for FY{fy}; a 3% of revenue placeholder is used and flagged.")
    if latest.net_working_capital is None:
        add("missing_nwc", "info", f"Working capital items not reported for FY{fy}; NWC is assumed constant (0% of incremental revenue).")
