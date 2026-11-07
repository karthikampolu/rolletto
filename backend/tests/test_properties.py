"""Economic property checks: the models move the right way when inputs move."""

import numpy as np
import pytest

from app.engine.valuation import evaluate
from tests.fixtures.acme import ACME_CONTEXT, ACME_VALUES


def _batch(key: str, values: list[float], **overrides):
    v = {**ACME_VALUES, **overrides}
    drivers = {k: np.full(len(values), v[k]) for k in ("revenue_growth", "ebitda_margin", "capex_pct_revenue", "wacc",
                                                         "terminal_growth", "exit_multiple", "senior_rate")}
    drivers[key] = np.array(values, dtype=float)
    return evaluate(ACME_CONTEXT, v, drivers, mid_year=True)


def _strictly_decreasing(x):
    return bool(np.all(np.diff(x) < 0))


def _strictly_increasing(x):
    return bool(np.all(np.diff(x) > 0))


def test_higher_wacc_means_lower_value():
    ev = _batch("wacc", [0.07, 0.08, 0.09, 0.10, 0.11, 0.12])
    assert _strictly_decreasing(ev.dcf.price_perpetuity)
    assert _strictly_decreasing(ev.dcf.price_exit)


def test_higher_exit_multiple_means_higher_irr_and_exit_value():
    ev = _batch("exit_multiple", [5.0, 6.5, 8.0, 9.5, 11.0])
    assert _strictly_increasing(ev.lbo.irr)
    assert _strictly_increasing(ev.lbo.moic)
    assert _strictly_increasing(ev.dcf.price_exit)
    assert np.ptp(ev.dcf.price_perpetuity) == pytest.approx(0.0)  # perpetuity TV ignores the multiple


def test_higher_margin_means_higher_value():
    ev = _batch("ebitda_margin", [0.15, 0.18, 0.20, 0.22, 0.25])
    assert _strictly_increasing(ev.dcf.price_perpetuity)
    assert _strictly_increasing(ev.lbo.irr)


def test_higher_interest_rate_means_lower_irr():
    ev = _batch("senior_rate", [0.06, 0.08, 0.10, 0.12])
    assert _strictly_decreasing(ev.lbo.irr)


def test_higher_terminal_growth_means_higher_perpetuity_value():
    ev = _batch("terminal_growth", [0.01, 0.02, 0.03, 0.04])
    assert _strictly_increasing(ev.dcf.price_perpetuity)


def test_higher_offer_premium_means_lower_irr():
    irrs = [float(evaluate(ACME_CONTEXT, {**ACME_VALUES, "offer_premium": p}, {k: np.array([ACME_VALUES[k]]) for k in (
        "revenue_growth", "ebitda_margin", "capex_pct_revenue", "wacc", "terminal_growth", "exit_multiple", "senior_rate")},
        mid_year=False).lbo.irr[0]) for p in (0.1, 0.2, 0.3, 0.4)]
    assert _strictly_decreasing(np.array(irrs))
