"""Suitability score, classification and the financial-company valuation path."""

import pytest

from app.core.config import get_settings
from app.engine.classify import classify
from app.engine.financials_valuation import value_financial_company
from app.engine.suitability import score_suitability
from tests.fixtures.acme import acme_financials, acme_market, acme_profile


def test_suitability_sub_scores_match_hand_calculation():
    s = score_suitability(acme_financials(), acme_market())
    by = {c.key: c for c in s.components}
    # OCF 130/140/150/160: CV = 11.18 / 145 = 7.7% -> better than the 10% "good" threshold -> 100.
    assert by["cash_flow_stability"].metric == pytest.approx(0.077106, abs=1e-6)
    assert by["cash_flow_stability"].score == 100.0
    # Mean (OCF - capex)/EBITDA = 55.93% -> (0.5593 - 0.15) / 0.45 = 90.96.
    assert by["fcf_conversion"].metric == pytest.approx(0.559316, abs=1e-6)
    assert by["fcf_conversion"].score == pytest.approx(90.959, abs=1e-3)
    # Net debt 200 / EBITDA 200 = 1.0x -> (1 - 4) / (0.5 - 4) = 85.71.
    assert by["current_leverage"].score == pytest.approx(85.714, abs=1e-3)
    assert by["margin_stability"].score == 100.0  # flat 20% margin
    assert by["capex_intensity"].score == pytest.approx(83.333, abs=1e-3)  # 5% of revenue
    assert by["growth_profile"].metric == pytest.approx(1.25 ** (1 / 3) - 1, abs=1e-9)
    assert by["growth_profile"].score == 100.0
    assert s.score == pytest.approx(93.5, abs=0.05)
    assert s.grade == "Strong"
    assert all(c.reasoning for c in s.components)


def test_suitability_redistributes_weight_when_data_missing():
    fin = acme_financials()
    for y in fin.years:
        y.operating_cash_flow = None
    s = score_suitability(fin, acme_market())
    by = {c.key: c for c in s.components}
    assert by["cash_flow_stability"].score is None and by["fcf_conversion"].score is None
    assert 0 < s.score <= 100


@pytest.mark.parametrize(("industry", "kind"), [
    ("Banks - Regional", "bank"), ("Banks - Diversified", "bank"), ("Insurance - Life", "insurer"), ("Credit Services", "nbfc"),
    ("REIT - Industrial", "reit"), ("Capital Markets", "capital_markets"), ("Consumer Electronics", "operating"),
    ("Asset Management", "operating"),
])
def test_classification(industry, kind):
    c = classify(acme_profile(industry=industry, sector="Financial Services"))
    assert c.kind == kind
    assert c.is_financial == (kind != "operating")


def test_financial_company_valuation_pb_roe_and_ddm():
    _, country = get_settings().country_defaults("United States")
    fin, market = acme_financials(), acme_market()
    v = value_financial_company(fin, market, country, "test")
    assert v.pb_roe is not None and v.ddm is not None
    ke, g, roe = v.pb_roe.cost_of_equity, v.pb_roe.growth, v.pb_roe.roe
    assert g < ke
    assert v.pb_roe.justified_pb == pytest.approx((roe - g) / (ke - g))
    assert v.ddm.value_per_share == pytest.approx(0.20 * (1 + g) / (ke - g))
    assert v.upside_pb_roe == pytest.approx(v.pb_roe.value_per_share / 12.0 - 1)
