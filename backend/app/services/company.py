"""Company and valuation services: orchestrate provider calls, cleaning, classification and the engines."""

from __future__ import annotations

import datetime as dt
import math
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from app.core.config import CountryDefaults, Settings
from app.core.errors import InsufficientDataError, InvalidInputError
from app.data.normalize import NormalizationReport
from app.data.provider import DataProvider, PeerSnapshot
from app.data.quality import assess_quality
from app.engine.assumptions import derive_defaults, resolve
from app.engine.classify import classify
from app.engine.comps import build_comps, build_football_field, build_peers
from app.engine.financials_valuation import value_financial_company
from app.engine.suitability import score_suitability
from app.engine.valuation import CompanyContext, base_drivers, dcf_result, evaluate, lbo_result, simulate, tornado
from app.schemas.assumptions import AssumptionSet
from app.schemas.common import DataQuality
from app.schemas.company import Classification, CompanyProfile, CompanyResponse, Financials, MarketData, PricePoint
from app.schemas.valuation import ValuationRequest, ValuationResponse

TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-&^=]{0,19}$")
MAX_AUTO_PEERS = 8
MAX_CANDIDATES = 20


def _closest_in_size(snapshots: list[PeerSnapshot], market_cap: float, k: int) -> list[PeerSnapshot]:
    """Keep the ``k`` peers whose market cap is closest to the target's on a log scale."""
    sized = [s for s in snapshots if s.market_cap and s.market_cap > 0]
    if market_cap <= 0:
        return sized[:k]
    return sorted(sized, key=lambda s: abs(math.log(s.market_cap / market_cap)))[:k]


def normalize_ticker(raw: str) -> str:
    t = raw.strip().upper()
    if not TICKER_RE.match(t):
        raise InvalidInputError(f"'{raw}' is not a valid ticker symbol.", code="invalid_ticker")
    return t


@dataclass(frozen=True)
class CompanyBundle:
    profile: CompanyProfile
    market: MarketData
    financials: Financials
    report: NormalizationReport
    history: list[PricePoint]
    classification: Classification
    quality: DataQuality
    country_name: str
    country: CountryDefaults


class CompanyService:
    def __init__(self, provider: DataProvider, settings: Settings) -> None:
        self.provider = provider
        self.settings = settings
        self._pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="peers")

    def load(self, ticker: str) -> CompanyBundle:
        ticker = normalize_ticker(ticker)
        profile = self.provider.get_profile(ticker)
        market = self.provider.get_market_data(ticker)
        fin, report = self.provider.get_financials(ticker)
        history = [PricePoint(date=p.date, close=p.close * market.fx_rate) for p in self.provider.get_price_history(ticker, "1y")]
        classification = classify(profile)
        quality = assess_quality(fin, market, report, is_financial=classification.is_financial)
        country_name, country = self.settings.country_defaults(profile.country)
        return CompanyBundle(profile, market, fin, report, history, classification, quality, country_name, country)

    def default_assumptions(self, b: CompanyBundle) -> AssumptionSet:
        return derive_defaults(b.financials, b.market, b.country_name, b.country)

    def company(self, ticker: str) -> CompanyResponse:
        b = self.load(ticker)
        resp = CompanyResponse(profile=b.profile, market=b.market, financials=b.financials, data_quality=b.quality,
                               classification=b.classification, price_history=b.history)
        if b.classification.is_financial:
            resp.financial_valuation = value_financial_company(b.financials, b.market, b.country, b.classification.reason)
        elif b.quality.usable_for_dcf:
            resp.suitability = score_suitability(b.financials, b.market)
            resp.assumptions = self.default_assumptions(b)
        return resp

    def valuation(self, req: ValuationRequest) -> tuple[ValuationResponse, CompanyBundle]:
        b = self.load(req.ticker)
        if b.classification.is_financial:
            raise InvalidInputError(b.classification.reason, code="financial_company")
        if not b.quality.usable_for_dcf:
            errors = [w.message for w in b.quality.warnings if w.severity == "error"]
            raise InsufficientDataError("Financial data is insufficient for a DCF/LBO: " + " ".join(errors or ["too few years reported."]),
                                        details={"warnings": [w.model_dump() for w in b.quality.warnings]})
        if req.settings.n_sims > self.settings.max_simulations:
            raise InvalidInputError(f"At most {self.settings.max_simulations:,} simulations are allowed.")

        defaults = self.default_assumptions(b)
        resolved = resolve(defaults, req.overrides, req.distributions)
        v = resolved.values
        ctx = CompanyContext.from_data(b.financials, b.market)
        settings = req.settings

        base = evaluate(ctx, v, base_drivers(v), settings.mid_year)
        sim = simulate(ctx, v, resolved.distributions, req.correlation or defaults.correlation, settings)
        sens = tornado(ctx, v, resolved.distributions, settings)
        comps = self._comps(b, ctx, req.peers)
        football = build_football_field(b.market, comps, sim.result, sim.lbo_offer_at_hurdle, settings.hurdle_irr)

        warnings = [w.message for w in b.quality.warnings if w.severity in ("warning", "error")] + sim.result.notes
        resp = ValuationResponse(
            ticker=b.profile.ticker, currency=b.profile.currency, generated_at=dt.datetime.now(dt.UTC), current_price=ctx.price,
            assumptions_used=v, settings=settings, dcf=dcf_result(base, v, ctx, settings.mid_year), lbo=lbo_result(base),
            monte_carlo=sim.result, sensitivity=sens, comps=comps, football_field=football, warnings=warnings,
        )
        return resp, b

    def _comps(self, b: CompanyBundle, ctx: CompanyContext, requested: list[str] | None):  # noqa: ANN202 - returns CompsResult
        if requested is None:
            tickers = self.provider.get_peer_candidates(b.profile.ticker, b.profile)[:MAX_CANDIDATES]
            snapshots = _closest_in_size([s for s in self._pool.map(self.provider.get_peer_snapshot, tickers) if s is not None],
                                         b.market.market_cap / b.market.fx_rate, MAX_AUTO_PEERS)
            source = ("Automatic: curated Indian industry peers" if b.profile.ticker.endswith((".NS", ".BO"))
                      else "Automatic: Yahoo industry and sector leaders closest in market cap")
        else:
            tickers = [normalize_ticker(t) for t in requested if t.strip()]
            snapshots = [s for s in self._pool.map(self.provider.get_peer_snapshot, tickers) if s is not None]
            source = "User-selected peers"
        latest = b.financials.years[-1]
        eps = latest.net_income / b.market.shares_outstanding if latest.net_income is not None and b.market.shares_outstanding else None
        return build_comps(build_peers(snapshots), ebitda=ctx.ltm_ebitda, revenue=ctx.revenue0, eps=eps, bridge=ctx.bridge, source=source)
