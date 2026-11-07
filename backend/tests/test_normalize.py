"""Statement normalisation, data-quality checks, assumption derivation and the cache."""

import pandas as pd
import pytest

from app.core.cache import TTLStore
from app.core.config import get_settings
from app.core.currency import format_money
from app.core.errors import InvalidInputError
from app.data.normalize import RawStatements, normalize_statements
from app.data.quality import assess_quality
from app.engine.assumptions import default_correlation, derive_defaults, resolve, shift_distribution
from app.schemas.assumptions import Distribution
from tests.fixtures.acme import acme_financials, acme_market

P1, P2, P3 = pd.Timestamp("2023-12-31"), pd.Timestamp("2024-12-31"), pd.Timestamp("2025-12-31")


def _frame(rows: dict[str, list[float | None]], cols=(P3, P2, P1)) -> pd.DataFrame:
    return pd.DataFrame(rows, index=list(cols)).T


def _raw(**income_overrides) -> RawStatements:
    income = {"Operating Revenue": [1000, 900, 800], "EBIT": [150, 130, 110], "Interest Expense": [-10, -10, -10],
              "Pretax Income": [140, 120, 100], "Tax Provision": [35, 30, 25], "Net Income": [105, 90, 75], **income_overrides}
    balance = {"Long Term Debt": [200, 200, 200], "Current Debt": [50, 50, 50], "Cash And Cash Equivalents": [80, 70, 60],
               "Stockholders Equity": [400, 350, 300], "Current Assets": [500, 450, 400], "Current Liabilities": [300, 280, 260]}
    cash = {"Operating Cash Flow": [160, 140, 120], "Capital Expenditure": [-50, -45, -40], "Depreciation And Amortization": [40, 36, 32]}
    return RawStatements(_frame(income), _frame(balance), _frame(cash))


def test_aliases_fallbacks_and_sign_conventions():
    fin, report = normalize_statements(_raw(), "USD")
    assert [y.fiscal_year for y in fin.years] == [2023, 2024, 2025]  # ascending
    y = fin.years[-1]
    assert y.revenue == 1000  # "Operating Revenue" alias
    assert y.ebitda == 190  # EBIT + D&A fallback
    assert y.capex == 50 and y.interest_expense == 10  # positive outflows
    assert y.total_debt == 250  # long-term + current
    assert y.free_cash_flow == 110  # OCF - capex
    assert y.net_working_capital == (500 - 80) - (300 - 50)  # current assets/liabilities ex cash and debt
    assert any("EBITDA derived" in f for f in report.fallbacks)


def test_periods_without_revenue_are_dropped_not_invented():
    fin, report = normalize_statements(_raw(**{"Operating Revenue": [1000, None, 800]}), "USD")
    assert [y.fiscal_year for y in fin.years] == [2023, 2025]
    assert report.dropped_periods == ["2024-12-31"]
    q = assess_quality(fin, acme_market(), report, is_financial=False)
    codes = {w.code for w in q.warnings}
    assert {"missing_year", "dropped_period", "few_years"} <= codes


def test_quality_flags_garbage():
    fin = acme_financials()
    fin.years[-1].revenue = 0.0
    fin.years[-1].total_equity = -5.0
    from app.data.normalize import NormalizationReport

    q = assess_quality(fin, acme_market(), NormalizationReport(), is_financial=False)
    codes = {w.code for w in q.warnings}
    assert "non_positive_revenue" in codes and "negative_equity" in codes
    assert q.usable_for_dcf is False and q.grade == "poor"


def test_no_financials_is_unusable():
    from app.data.normalize import NormalizationReport
    from app.schemas.company import Financials

    q = assess_quality(Financials(currency="USD", years=[]), acme_market(), NormalizationReport(), is_financial=False)
    assert not q.usable_for_dcf


def test_default_assumptions_have_sources_and_respect_caps():
    _, country = get_settings().country_defaults("United States")
    s = derive_defaults(acme_financials(), acme_market(), "United States", country)
    by = {a.key: a for a in s.items}
    assert by["revenue_growth"].value == pytest.approx(1.25 ** (1 / 3) - 1)
    assert by["ebitda_margin"].value == pytest.approx(0.20)
    assert by["capex_pct_revenue"].value == pytest.approx(0.05)
    assert by["beta"].value == pytest.approx(1.0)  # Blume of 1.0 is 1.0
    assert by["terminal_growth"].value < by["wacc"].value
    assert all(a.source and a.rationale and a.description for a in s.items)
    assert all(a.distribution is not None for a in s.items if a.stochastic)


def test_wacc_recomputed_when_components_overridden():
    _, country = get_settings().country_defaults("United States")
    s = derive_defaults(acme_financials(), acme_market(), "United States", country)
    base = resolve(s, {}, {})
    higher = resolve(s, {"risk_free": base.values["risk_free"] + 0.01}, {})
    assert higher.values["wacc"] > base.values["wacc"]
    assert higher.distributions["wacc"].mean == pytest.approx(higher.values["wacc"])  # re-centred


def test_resolve_rejects_bad_input():
    _, country = get_settings().country_defaults("United States")
    s = derive_defaults(acme_financials(), acme_market(), "United States", country)
    with pytest.raises(InvalidInputError):
        resolve(s, {"not_a_key": 1.0}, {})
    with pytest.raises(InvalidInputError):
        resolve(s, {"wacc": 0.05, "terminal_growth": 0.049}, {})
    with pytest.raises(InvalidInputError):
        resolve(s, {"exit_year": 12}, {})


def test_shift_distribution_keeps_shape():
    d = Distribution(kind="triangular", low=0.01, mode=0.02, high=0.04)
    s = shift_distribution(d, 0.02, 0.03)
    assert (s.low, s.mode, s.high) == pytest.approx((0.02, 0.03, 0.05))
    ln = shift_distribution(Distribution(kind="lognormal", mean=10, std=1.5), 10, 12)
    assert ln.std / ln.mean == pytest.approx(0.15)
    assert len(default_correlation().variables) == 7


def test_ttl_cache_hits_and_does_not_cache_failures():
    store = TTLStore(10)
    calls = []
    assert store.get_or_set("ns", "k", 60, lambda: calls.append(1) or 42) == 42
    assert store.get_or_set("ns", "k", 60, lambda: calls.append(1) or 43) == 42
    assert len(calls) == 1

    def boom():
        raise RuntimeError("x")

    with pytest.raises(RuntimeError):
        store.get_or_set("ns", "bad", 60, boom)
    assert store.get_or_set("ns", "bad", 60, lambda: 7) == 7


def test_indian_number_formatting():
    assert format_money(1.2345e11, "INR", indian=True) == "₹12,345.0 Cr"
    assert format_money(1.7862863e13, "INR", indian=True) == "₹17,86,286.3 Cr"
    assert format_money(2.5e5, "INR", indian=True) == "₹2.5 L"
    assert format_money(-3.2e9, "USD") == "-$3.2B"
