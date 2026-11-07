"""Trading comparables and the football-field summary."""

from __future__ import annotations

import numpy as np

from app.data.provider import PeerSnapshot
from app.engine.dcf import BalanceSheetBridge
from app.schemas.company import MarketData
from app.schemas.valuation import CompsResult, FootballBar, FootballField, MonteCarloResult, MultipleRange, Peer

#: Multiples outside these bounds are treated as not meaningful (losses, near-zero EBITDA, data errors).
BOUNDS = {"ev_ebitda": (0.5, 60.0), "ev_revenue": (0.05, 40.0), "pe": (1.0, 150.0)}
LABELS = {"ev_ebitda": "EV / EBITDA", "ev_revenue": "EV / Revenue", "pe": "P / E"}


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or den is None or den <= 0:
        return None
    return num / den


def _bounded(metric: str, value: float | None) -> float | None:
    lo, hi = BOUNDS[metric]
    return value if value is not None and lo <= value <= hi else None


def build_peers(snapshots: list[PeerSnapshot]) -> list[Peer]:
    peers = []
    for s in snapshots:
        ev_ebitda = _bounded("ev_ebitda", _ratio(s.enterprise_value, s.ebitda))
        ev_revenue = _bounded("ev_revenue", _ratio(s.enterprise_value, s.revenue))
        pe = _bounded("pe", s.trailing_pe)
        included = any(x is not None for x in (ev_ebitda, ev_revenue, pe))
        peers.append(Peer(ticker=s.ticker, name=s.name, currency=s.currency, market_cap=s.market_cap, enterprise_value=s.enterprise_value,
                          ev_ebitda=ev_ebitda, ev_revenue=ev_revenue, pe=pe, included=included,
                          note=None if included else "No meaningful multiples (losses or missing data)."))
    return peers


def build_comps(peers: list[Peer], *, ebitda: float, revenue: float, eps: float | None, bridge: BalanceSheetBridge, source: str) -> CompsResult:
    """Interquartile multiple ranges across included peers and the share prices they imply for the target."""
    ranges = []
    for metric in ("ev_ebitda", "ev_revenue", "pe"):
        values = [getattr(p, metric) for p in peers if p.included and getattr(p, metric) is not None]
        if not values:
            continue
        lo, med, hi = (float(x) for x in np.percentile(values, [25, 50, 75]))

        def implied(multiple: float, metric: str = metric) -> float | None:
            """Implied price per share; None when not meaningful (non-positive base or equity value)."""
            if metric == "pe":
                return multiple * eps if eps and eps > 0 else None
            base = ebitda if metric == "ev_ebitda" else revenue
            if base <= 0:
                return None
            price = (multiple * base - bridge.net_debt - bridge.minority_interest + bridge.non_operating_assets) / bridge.shares
            return price if price > 0 else None

        ranges.append(MultipleRange(metric=metric, label=LABELS[metric], count=len(values), low=lo, median=med, high=hi,  # type: ignore[arg-type]
                                    implied_price_low=implied(lo), implied_price_mid=implied(med), implied_price_high=implied(hi)))
    return CompsResult(peers=peers, ranges=ranges, source=source)


def build_football_field(
    market: MarketData, comps: CompsResult, mc: MonteCarloResult, lbo_offer: np.ndarray | None, hurdle: float
) -> FootballField:
    bars: list[FootballBar] = []
    if market.fifty_two_week_low and market.fifty_two_week_high:
        bars.append(FootballBar(label="52-week range", kind="market", low=market.fifty_two_week_low, high=market.fifty_two_week_high))
    for r in comps.ranges:
        if r.implied_price_low is not None and r.implied_price_high is not None:
            bars.append(FootballBar(label=f"Trading comps · {r.label}", kind="comps", low=min(r.implied_price_low, r.implied_price_high),
                                    high=max(r.implied_price_low, r.implied_price_high), mid=r.implied_price_mid,
                                    note=f"Peer interquartile range {r.low:.1f}x–{r.high:.1f}x ({r.count} peers)"))
    bars.append(FootballBar(label="DCF · Monte Carlo P10–P90", kind="dcf", low=mc.price.p10, high=mc.price.p90, mid=mc.price.p50,
                            note=f"{mc.n_sims:,} simulations, {mc.terminal_method.replace('_', ' ')} terminal value"))
    if lbo_offer is not None:
        lo, mid, hi = (float(x) for x in np.percentile(lbo_offer, [25, 50, 75]))
        bars.append(FootballBar(label=f"LBO · price for {hurdle:.0%} IRR", kind="lbo", low=lo, high=hi, mid=mid,
                                note="Interquartile range of the maximum offer price a sponsor can pay and still earn the hurdle"))
    return FootballField(current_price=market.price, bars=bars)
