"""End-to-end API tests with the market-data provider replaced by an in-memory fake (no network)."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.api.deps import get_service, limiter
from app.core.config import get_settings
from app.core.errors import TickerNotFoundError
from app.data.normalize import NormalizationReport
from app.data.provider import PeerSnapshot
from app.main import app
from app.schemas.company import PricePoint, SearchResult
from app.services.company import CompanyService
from tests.fixtures.acme import ACME_VALUES, acme_financials, acme_market, acme_profile


class FakeProvider:
    name = "fake"
    _profiles = {"ACME": acme_profile(), "BANKX": acme_profile("BANKX", industry="Banks - Regional", sector="Financial Services")}

    def search(self, query):
        return [SearchResult(symbol=t, name=p.name, exchange="NYSE", quote_type="EQUITY") for t, p in self._profiles.items() if query.upper() in t]

    def get_profile(self, ticker):
        if ticker not in self._profiles:
            raise TickerNotFoundError(f"No listed company found for ticker '{ticker}'.")
        return self._profiles[ticker]

    def get_financials(self, ticker):
        self.get_profile(ticker)
        return acme_financials(), NormalizationReport()

    def get_price_history(self, ticker, period="1y"):
        return [PricePoint(date="2025-12-31", close=12.0)]

    def get_market_data(self, ticker):
        self.get_profile(ticker)
        return acme_market()

    def get_peer_candidates(self, ticker, profile):
        return ["PEER1", "PEER2", "PEER3"]

    def get_peer_snapshot(self, ticker):
        mult = {"PEER1": 7.0, "PEER2": 8.0, "PEER3": 9.0, "PEER4": 10.0}.get(ticker)
        if mult is None:
            return None
        return PeerSnapshot(ticker=ticker, name=ticker.title(), currency="USD", market_cap=1000.0, enterprise_value=mult * 100,
                            ebitda=100.0, revenue=500.0, trailing_pe=mult * 1.5)


@pytest.fixture
def client():
    limiter.enabled = False
    app.dependency_overrides[get_service] = lambda: CompanyService(FakeProvider(), get_settings())
    yield TestClient(app)
    app.dependency_overrides.clear()
    limiter.enabled = True


def _body(**kw):
    return {"ticker": "acme", "overrides": {k: v for k, v in ACME_VALUES.items()}, "settings": {"n_sims": 2000, "seed": 11}, **kw}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["provider"] == "fake"


def test_search(client):
    r = client.get("/api/search", params={"q": "ac"})
    assert r.status_code == 200 and r.json()[0]["symbol"] == "ACME"


def test_company_operating(client):
    r = client.get("/api/company/ACME")
    assert r.status_code == 200
    body = r.json()
    assert body["classification"]["kind"] == "operating"
    assert body["suitability"]["score"] == pytest.approx(93.5, abs=0.05)
    assert {a["key"] for a in body["assumptions"]["items"]} >= {"wacc", "exit_multiple", "senior_leverage"}
    assert body["financial_valuation"] is None


def test_company_financial_path(client):
    body = client.get("/api/company/BANKX").json()
    assert body["classification"]["is_financial"] is True
    assert body["assumptions"] is None and body["financial_valuation"]["pb_roe"] is not None
    r = client.post("/api/valuation", json=_body(ticker="BANKX"))
    assert r.status_code == 422 and r.json()["error"]["code"] == "financial_company"


def test_unknown_and_invalid_tickers(client):
    r = client.get("/api/company/NOPE")
    assert r.status_code == 404 and r.json()["error"]["code"] == "ticker_not_found"
    r = client.get("/api/company/%24%24%24")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_ticker"


def test_valuation_end_to_end_matches_hand_checked_fixture(client):
    r = client.post("/api/valuation", json=_body())
    assert r.status_code == 200, r.text
    v = r.json()
    # Mid-year convention is the default setting: hand-checked 16.60 (perpetuity) / 16.28 (exit).
    assert v["dcf"]["price_perpetuity"] == pytest.approx(16.60, abs=0.005)
    assert v["dcf"]["price_exit"] == pytest.approx(16.28, abs=0.005)
    assert v["lbo"]["irr"] == pytest.approx(0.133148, abs=1e-6)
    assert v["lbo"]["sponsor_equity"] == pytest.approx(872.0)
    mc = v["monte_carlo"]
    assert mc["n_sims"] == 2000 and mc["irr"] is not None and len(mc["convergence"]) > 10
    assert len(v["sensitivity"]["items"]) == 7
    assert [p["ticker"] for p in v["comps"]["peers"]] == ["PEER1", "PEER2", "PEER3"]
    ev_ebitda = next(m for m in v["comps"]["ranges"] if m["metric"] == "ev_ebitda")
    assert ev_ebitda["median"] == pytest.approx(8.0)
    assert ev_ebitda["implied_price_mid"] == pytest.approx((8.0 * 200 - 200) / 100)
    kinds = [b["kind"] for b in v["football_field"]["bars"]]
    assert kinds[0] == "market" and "dcf" in kinds and "lbo" in kinds


def test_valuation_is_reproducible_and_peers_editable(client):
    a = client.post("/api/valuation", json=_body()).json()
    b = client.post("/api/valuation", json=_body()).json()
    assert a["monte_carlo"]["price"] == b["monte_carlo"]["price"]
    c = client.post("/api/valuation", json=_body(peers=["PEER4", "UNKNOWN"])).json()
    assert [p["ticker"] for p in c["comps"]["peers"]] == ["PEER4"]


def test_validation_errors_use_consistent_format(client):
    r = client.post("/api/valuation", json=_body(settings={"n_sims": 10}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = client.post("/api/valuation", json=_body(overrides={"wacc": 0.05, "terminal_growth": 0.049}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"
    bad = {"variables": ["revenue_growth", "ebitda_margin", "wacc"], "matrix": [[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]]}
    r = client.post("/api/valuation", json=_body(correlation=bad))
    assert r.status_code == 422 and r.json()["error"]["code"] == "correlation_not_psd"
    r = client.post("/api/valuation", json=_body(distributions={"wacc": {"kind": "uniform", "low": 0.1, "high": 0.05}}))
    assert r.status_code == 422


def test_excel_export(client):
    r = client.post("/api/export/excel", json=_body())
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == ["Summary", "Assumptions", "DCF", "LBO", "Monte Carlo", "Comps", "Historicals"]
    assert str(wb["DCF"]["C7"].value).startswith("=")  # live formula
    assert wb["Assumptions"]["B5"].font.color.rgb.endswith("0000FF")  # blue input


def test_memo_export(client):
    r = client.post("/api/export/memo", json=_body())
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert r.headers["content-type"] == "application/pdf"
