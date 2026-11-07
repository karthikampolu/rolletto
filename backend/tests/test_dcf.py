"""DCF engine against the hand-checked Acme fixture (see tests/fixtures/acme.py for the working)."""

import numpy as np
import pytest

from app.engine.dcf import project_operations, value_dcf
from tests.fixtures.acme import ACME_CONTEXT, ACME_VALUES

CENT = 0.005
V = ACME_VALUES


def _ops():
    return project_operations(revenue0=1000.0, growth1=V["revenue_growth"], terminal_growth=V["terminal_growth"], ebitda_margin=V["ebitda_margin"],
                              da_pct=V["da_pct_revenue"], capex_pct=V["capex_pct_revenue"], nwc_pct=V["nwc_pct_revenue"], tax_rate=V["tax_rate"], years=5)


def _value(mid_year: bool):
    return value_dcf(_ops(), wacc=V["wacc"], terminal_growth=V["terminal_growth"], exit_multiple=V["exit_multiple"], mid_year=mid_year,
                     bridge=ACME_CONTEXT.bridge)


def test_growth_fades_linearly_to_terminal():
    assert _ops().growth[0] == pytest.approx([0.08, 0.07, 0.06, 0.05, 0.04])


def test_projection_matches_hand_calculation():
    ops = _ops()
    assert ops.revenue[0] == pytest.approx([1080.0, 1155.6, 1224.936, 1286.1828, 1337.630112], abs=CENT)
    assert ops.ebitda[0] == pytest.approx([216.0, 231.12, 244.9872, 257.23656, 267.5260224], abs=CENT)
    assert ops.delta_nwc[0] == pytest.approx([8.0, 7.56, 6.9336, 6.12468, 5.1447312], abs=CENT)
    assert ops.ufcf[0] == pytest.approx([110.80, 119.556, 127.80936, 135.355428, 141.994581], abs=CENT)


def test_end_of_year_valuation_to_the_cent():
    d = _value(mid_year=False)
    assert d.sum_pv[0] == pytest.approx(476.18, abs=CENT)
    assert d.tv_perpetuity[0] == pytest.approx(2089.35, abs=CENT)
    assert d.tv_exit[0] == pytest.approx(2140.21, abs=CENT)
    assert d.ev_perpetuity[0] == pytest.approx(1773.50, abs=CENT)
    assert d.ev_exit[0] == pytest.approx(1805.08, abs=CENT)
    assert d.price_perpetuity[0] == pytest.approx(15.73, abs=CENT)
    assert d.price_exit[0] == pytest.approx(16.05, abs=CENT)


def test_mid_year_convention_to_the_cent():
    d = _value(mid_year=True)
    assert d.sum_pv[0] == pytest.approx(499.42, abs=CENT)
    assert d.pv_tv_perpetuity[0] == pytest.approx(1360.64, abs=CENT)  # discounted at t = 4.5
    assert d.pv_tv_exit[0] == pytest.approx(1328.90, abs=CENT)  # discounted at t = 5
    assert d.price_perpetuity[0] == pytest.approx(16.60, abs=CENT)
    assert d.price_exit[0] == pytest.approx(16.28, abs=CENT)


def test_equity_bridge_subtracts_minorities_and_adds_non_operating_assets():
    from app.engine.dcf import BalanceSheetBridge

    bridge = BalanceSheetBridge(total_debt=300, cash=100, minority_interest=50, non_operating_assets=80, shares=100)
    d = value_dcf(_ops(), wacc=0.10, terminal_growth=0.03, exit_multiple=8.0, mid_year=False, bridge=bridge)
    assert d.equity_perpetuity[0] == pytest.approx(1773.497234 - 200 - 50 + 80, abs=CENT)


def test_vectorised_rows_are_independent():
    ops = project_operations(revenue0=1000.0, growth1=np.array([0.08, 0.02]), terminal_growth=0.03, ebitda_margin=0.2, da_pct=0.04,
                             capex_pct=0.05, nwc_pct=0.10, tax_rate=0.25, years=5)
    d = value_dcf(ops, wacc=np.array([0.10, 0.10]), terminal_growth=np.array([0.03, 0.03]), exit_multiple=8.0, mid_year=False,
                  bridge=ACME_CONTEXT.bridge)
    assert d.price_perpetuity[0] == pytest.approx(15.734972, abs=1e-6)
    assert d.price_perpetuity[1] < d.price_perpetuity[0]


def test_capex_fades_to_steady_state_by_final_year():
    ops = project_operations(revenue0=1000.0, growth1=0.03, terminal_growth=0.03, ebitda_margin=0.2, da_pct=0.04, capex_pct=0.12,
                             nwc_pct=0.0, tax_rate=0.25, years=5, terminal_capex_pct=0.06)
    assert (ops.capex[0] / ops.revenue[0]) == pytest.approx([0.12, 0.105, 0.09, 0.075, 0.06])
    longer = project_operations(revenue0=1000.0, growth1=0.03, terminal_growth=0.03, ebitda_margin=0.2, da_pct=0.04, capex_pct=0.12,
                                nwc_pct=0.0, tax_rate=0.25, years=7, fade_years=5, terminal_capex_pct=0.06)
    assert (longer.capex[0, 5:] / longer.revenue[0, 5:]) == pytest.approx([0.06, 0.06])  # holds steady after the horizon
