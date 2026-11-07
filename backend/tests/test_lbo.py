"""LBO engine against the hand-checked Acme fixture."""

import numpy as np
import pytest

from app.engine.valuation import base_drivers, evaluate, lbo_result
from tests.fixtures.acme import ACME_CONTEXT, ACME_VALUES

CENT = 0.005


def _run(**overrides):
    v = {**ACME_VALUES, **overrides}
    return evaluate(ACME_CONTEXT, v, base_drivers(v), mid_year=False)


def test_sources_and_uses_balance():
    ev = _run()
    e = ev.entry
    assert e.offer_price == pytest.approx(15.0)
    assert e.entry_ev == pytest.approx(1700.0)
    assert e.entry_multiple == pytest.approx(8.5)
    assert e.advisory_fees == pytest.approx(34.0)
    assert e.financing_fees == pytest.approx(18.0)
    assert e.total_uses == pytest.approx(1872.0)
    assert e.sponsor_equity == pytest.approx(872.0)
    r = lbo_result(ev)
    assert sum(s.amount for s in r.sources) == pytest.approx(sum(u.amount for u in r.uses))


def test_debt_schedule_matches_hand_calculation():
    a = _run().lbo
    assert a.interest_senior[0, 0] + a.interest_sub[0, 0] == pytest.approx(81.0, abs=CENT)
    assert a.taxes[0, 0] == pytest.approx(22.95, abs=CENT)
    assert a.fcf[0] == pytest.approx([50.05, 61.809, 73.7709, 85.743222, 97.526968], abs=CENT)
    assert a.mandatory[0] == pytest.approx([30.0] * 5)
    assert a.senior[0] == pytest.approx([549.95, 488.141, 414.3701, 328.626878, 231.09991], abs=CENT)
    assert a.sub[0] == pytest.approx([300.0] * 5)  # bullet
    assert a.cash[0] == pytest.approx([20.0] * 5)  # 100% sweep keeps cash at the minimum
    assert a.net_leverage[0, 0] == pytest.approx(3.842361, abs=1e-6)
    assert a.coverage[0, 0] == pytest.approx(2.666667, abs=1e-6)


def test_returns_to_the_cent():
    a = _run().lbo
    assert a.exit_ev[0] == pytest.approx(2140.21, abs=CENT)
    assert a.exit_equity[0] == pytest.approx(1629.11, abs=CENT)
    assert a.moic[0] == pytest.approx(1.868243, abs=1e-6)
    assert a.irr[0] == pytest.approx(0.133148, abs=1e-6)


def test_partial_sweep_accumulates_cash():
    a = _run(cash_sweep=0.5).lbo
    # Y1 excess after mandatory = 20.05; half sweeps, half stays as cash above the 20 minimum.
    assert a.sweep[0, 0] == pytest.approx(10.025, abs=CENT)
    assert a.cash[0, 0] == pytest.approx(30.025, abs=CENT)


def test_revolver_funds_shortfall_and_is_repaid():
    # 20% amortisation (120/yr) exceeds Y1 FCF of 50.05 -> revolver draws the 69.95 gap.
    a = _run(senior_amortization=0.20).lbo
    assert a.revolver_draw[0, 0] == pytest.approx(120.0 - 50.05, abs=CENT)
    assert a.revolver[0, 0] == pytest.approx(69.95, abs=CENT)
    assert a.cash[0, 0] == pytest.approx(20.0, abs=CENT)


def test_covenant_breach_flags():
    a = _run(max_net_leverage=3.5, min_interest_coverage=2.8).lbo
    assert a.leverage_breach[0].tolist() == [True, False, False, False, False]  # 3.84x > 3.5x only in Y1
    assert a.coverage_breach[0].tolist() == [True, False, False, False, False]  # 2.67x < 2.8x only in Y1


def test_infeasible_when_ebitda_not_positive():
    from dataclasses import replace

    ctx = replace(ACME_CONTEXT, ltm_ebitda=-10.0)
    ev = evaluate(ctx, ACME_VALUES, base_drivers(ACME_VALUES), mid_year=False)
    assert not ev.entry.feasible
    assert np.isnan(ev.lbo.irr[0])


def test_offer_price_for_target_irr_round_trips():
    from app.engine.lbo import offer_price_for_irr

    ev = _run()
    # At the base IRR the solved offer price must equal the actual offer price.
    p = offer_price_for_irr(ev.lbo.exit_equity, float(ev.lbo.irr[0]), ev.entry, ev.terms, shares=100.0)
    assert p[0] == pytest.approx(15.0, abs=1e-6)
