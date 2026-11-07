"""Glue between resolved assumptions and the vectorised DCF / LBO engines.

``evaluate`` runs both models for any batch of driver values. The base case is a batch of one,
the Monte Carlo a batch of n samples, and the tornado a batch of 2k one-at-a-time swings, so all
three are guaranteed to use identical maths.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np

from app.engine.assumptions import SPECS, STOCHASTIC_KEYS
from app.engine.dcf import BalanceSheetBridge, DcfArrays, OperatingProjection, project_operations, value_dcf
from app.engine.distributions import quantile
from app.engine.lbo import LboArrays, LboEntry, LboTerms, build_entry, offer_price_for_irr, run_lbo
from app.engine.montecarlo import build_correlation, convergence, sample, summarize
from app.schemas.assumptions import CorrelationSpec, Distribution
from app.schemas.company import Financials, MarketData
from app.schemas.valuation import (
    CovenantBreachYear,
    DcfResult,
    DcfYear,
    InputSummary,
    LboResult,
    LboYear,
    MonteCarloResult,
    SensitivityResult,
    SimSettings,
    SourceUse,
    TornadoItem,
)

MIN_WACC_SPREAD = 0.005  # terminal growth is clipped to WACC − 0.5pp inside simulations


@dataclass(frozen=True)
class CompanyContext:
    """The company facts the models need, all in the reporting currency."""

    revenue0: float
    ltm_ebitda: float
    price: float
    bridge: BalanceSheetBridge

    @classmethod
    def from_data(cls, fin: Financials, market: MarketData) -> CompanyContext:
        latest = fin.years[-1]
        debt = market.total_debt if market.total_debt is not None else (latest.total_debt or 0.0)
        cash = market.cash if market.cash is not None else (latest.cash or 0.0)
        return cls(
            revenue0=float(latest.revenue or 0.0),
            ltm_ebitda=float(latest.ebitda or 0.0),
            price=market.price,
            bridge=BalanceSheetBridge(
                total_debt=debt,
                cash=cash,
                minority_interest=latest.minority_interest or 0.0,
                non_operating_assets=latest.long_term_investments or 0.0,
                shares=market.shares_outstanding,
            ),
        )


@dataclass(frozen=True)
class Evaluation:
    ops: OperatingProjection
    dcf: DcfArrays
    entry: LboEntry
    lbo: LboArrays
    terms: LboTerms
    clipped_terminal_growth: int


def lbo_terms(v: dict[str, float]) -> LboTerms:
    return LboTerms(
        offer_premium=v["offer_premium"], advisory_fee_pct=v["advisory_fee_pct"], financing_fee_pct=v["financing_fee_pct"],
        min_cash_pct_revenue=v["min_cash_pct_revenue"], senior_leverage=v["senior_leverage"], sub_leverage=v["sub_leverage"],
        senior_amortization=v["senior_amortization"], revolver_size=v["revolver_size"], cash_sweep=v["cash_sweep"],
        exit_year=int(v["exit_year"]), max_net_leverage=v["max_net_leverage"], min_interest_coverage=v["min_interest_coverage"],
    )


def evaluate(ctx: CompanyContext, v: dict[str, float], drivers: dict[str, np.ndarray], mid_year: bool) -> Evaluation:
    """Run DCF and LBO for a batch of stochastic driver values (each array shape (n,))."""
    dcf_years, terms = int(v["projection_years"]), lbo_terms(v)
    wacc = drivers["wacc"]
    tg_raw = drivers["terminal_growth"]
    tg = np.minimum(tg_raw, wacc - MIN_WACC_SPREAD)
    exit_multiple = np.maximum(drivers["exit_multiple"], 0.5)
    senior_rate = np.maximum(drivers["senior_rate"], 0.0)

    ops = project_operations(
        revenue0=ctx.revenue0, growth1=drivers["revenue_growth"], terminal_growth=tg, ebitda_margin=drivers["ebitda_margin"],
        da_pct=v["da_pct_revenue"], capex_pct=np.maximum(drivers["capex_pct_revenue"], 0.0), nwc_pct=v["nwc_pct_revenue"],
        tax_rate=v["tax_rate"], years=max(dcf_years, terms.exit_year), fade_years=dcf_years,
        terminal_capex_pct=v["terminal_capex_to_da"] * v["da_pct_revenue"],
    )
    dcf = value_dcf(ops.head(dcf_years), wacc=wacc, terminal_growth=tg, exit_multiple=exit_multiple, mid_year=mid_year, bridge=ctx.bridge)
    entry = build_entry(price=ctx.price, shares=ctx.bridge.shares, total_debt=ctx.bridge.total_debt, cash=ctx.bridge.cash,
                        revenue0=ctx.revenue0, ltm_ebitda=ctx.ltm_ebitda, terms=terms)
    lbo = run_lbo(
        ops.head(terms.exit_year), entry, terms, tax_rate=v["tax_rate"], senior_rate=senior_rate,
        sub_rate=senior_rate + (v["sub_rate"] - v["senior_rate"]), revolver_rate=senior_rate + (v["revolver_rate"] - v["senior_rate"]),
        exit_multiple=exit_multiple,
    )
    return Evaluation(ops, dcf, entry, lbo, terms, int((tg < tg_raw).sum()))


def base_drivers(v: dict[str, float]) -> dict[str, np.ndarray]:
    return {k: np.array([v[k]]) for k in STOCHASTIC_KEYS}


# ----------------------------------------------------------------------------- deterministic


def dcf_result(ev: Evaluation, v: dict[str, float], ctx: CompanyContext, mid_year: bool) -> DcfResult:
    o, d, n = ev.ops, ev.dcf, int(v["projection_years"])
    years = [
        DcfYear(year=t + 1, revenue=o.revenue[0, t], growth=o.growth[0, t], ebitda=o.ebitda[0, t],
                ebitda_margin=o.ebitda[0, t] / o.revenue[0, t], d_and_a=o.d_and_a[0, t], ebit=o.ebit[0, t], taxes=o.taxes[0, t],
                nopat=o.nopat[0, t], capex=o.capex[0, t], delta_nwc=o.delta_nwc[0, t], ufcf=o.ufcf[0, t],
                discount_factor=d.discount_factors[0, t], pv_ufcf=d.pv_ufcf[0, t])
        for t in range(n)
    ]
    w, g = v["wacc"], min(v["terminal_growth"], v["wacc"] - MIN_WACC_SPREAD)
    fcf_t, tv_exit = o.ufcf[0, n - 1], d.tv_exit[0]
    return DcfResult(
        years=years, wacc=w, terminal_growth=g, exit_multiple=v["exit_multiple"], mid_year=mid_year,
        sum_pv_ufcf=d.sum_pv[0], tv_perpetuity=d.tv_perpetuity[0], tv_exit=tv_exit,
        pv_tv_perpetuity=d.pv_tv_perpetuity[0], pv_tv_exit=d.pv_tv_exit[0], ev_perpetuity=d.ev_perpetuity[0], ev_exit=d.ev_exit[0],
        net_debt=ctx.bridge.net_debt, minority_interest=ctx.bridge.minority_interest, non_operating_assets=ctx.bridge.non_operating_assets,
        equity_perpetuity=d.equity_perpetuity[0], equity_exit=d.equity_exit[0], price_perpetuity=d.price_perpetuity[0], price_exit=d.price_exit[0],
        upside_perpetuity=d.price_perpetuity[0] / ctx.price - 1, upside_exit=d.price_exit[0] / ctx.price - 1,
        tv_share_perpetuity=d.pv_tv_perpetuity[0] / d.ev_perpetuity[0] if d.ev_perpetuity[0] else 0.0,
        implied_multiple_from_perpetuity=d.tv_perpetuity[0] / o.ebitda[0, n - 1] if o.ebitda[0, n - 1] else 0.0,
        # Solve TV = FCF(1+g)/(w−g) for g (end-of-year basis).
        implied_growth_from_exit=(tv_exit * w - fcf_t) / (tv_exit + fcf_t) if tv_exit + fcf_t else 0.0,
    )


def lbo_result(ev: Evaluation) -> LboResult:
    e, a, t, o = ev.entry, ev.lbo, ev.terms, ev.ops
    ebitda = e.ltm_ebitda

    def su(label: str, amount: float, total: float) -> SourceUse:
        return SourceUse(label=label, amount=amount, pct=amount / total if total else 0.0, ebitda_multiple=amount / ebitda if ebitda > 0 else None)

    total = e.total_uses
    uses = [su("Purchase of equity", e.offer_equity, total), su("Refinance existing debt", e.existing_debt, total),
            su("Advisory & transaction fees", e.advisory_fees, total), su("Financing fees", e.financing_fees, total),
            su("Cash to balance sheet", e.min_cash, total)]
    sources = [su("Senior term loan", e.senior0, total), su("Subordinated notes", e.sub0, total),
               su("Existing cash", e.existing_cash, total), su("Sponsor equity", e.sponsor_equity, total)]
    schedule = [
        LboYear(year=y + 1, revenue=o.revenue[0, y], ebitda=o.ebitda[0, y], interest_senior=a.interest_senior[0, y],
                interest_sub=a.interest_sub[0, y], interest_revolver=a.interest_revolver[0, y], taxes=a.taxes[0, y],
                capex=o.capex[0, y], delta_nwc=o.delta_nwc[0, y], fcf_before_debt=a.fcf[0, y], mandatory_amortization=a.mandatory[0, y],
                revolver_draw=a.revolver_draw[0, y], revolver_repay=a.revolver_repay[0, y], cash_sweep=a.sweep[0, y],
                senior_end=a.senior[0, y], sub_end=a.sub[0, y], revolver_end=a.revolver[0, y], cash_end=a.cash[0, y],
                total_debt=a.senior[0, y] + a.sub[0, y] + a.revolver[0, y], net_debt=a.net_debt[0, y],
                net_leverage=_finite(a.net_leverage[0, y]), interest_coverage=_finite(a.coverage[0, y]),
                leverage_breach=bool(a.leverage_breach[0, y]), coverage_breach=bool(a.coverage_breach[0, y]))
        for y in range(t.exit_year)
    ]
    return LboResult(
        feasible=e.feasible, infeasible_reason=e.infeasible_reason, offer_price=e.offer_price, offer_premium=t.offer_premium,
        entry_equity_value=e.offer_equity, entry_ev=e.entry_ev, entry_multiple=_finite(e.entry_multiple), ltm_ebitda=ebitda,
        sources=sources, uses=uses, sponsor_equity=e.sponsor_equity, schedule=schedule, exit_year=t.exit_year,
        exit_multiple=float(a.exit_ev[0] / o.ebitda[0, t.exit_year - 1]) if o.ebitda[0, t.exit_year - 1] else 0.0,
        exit_ev=a.exit_ev[0], exit_net_debt=a.net_debt[0, -1], exit_equity=a.exit_equity[0],
        irr=_finite(a.irr[0]), moic=_finite(a.moic[0]), max_net_leverage=t.max_net_leverage, min_interest_coverage=t.min_interest_coverage,
    )


def _finite(x: float, cap: float = 1e6) -> float:
    """JSON cannot carry inf/NaN: map them to a large sentinel (or 0 for NaN) for display tables."""
    x = float(x)
    if np.isnan(x):
        return 0.0
    return max(-cap, min(cap, x))


# ----------------------------------------------------------------------------- Monte Carlo


@dataclass(frozen=True)
class SimulationOutput:
    result: MonteCarloResult
    price: np.ndarray
    lbo_offer_at_hurdle: np.ndarray | None


def simulate(
    ctx: CompanyContext, v: dict[str, float], dists: dict[str, Distribution], corr_spec: CorrelationSpec, settings: SimSettings
) -> SimulationOutput:
    start = time.perf_counter()
    keys = list(STOCHASTIC_KEYS)
    corr = build_correlation(corr_spec, keys)
    drivers = sample(dists, keys, corr, settings.n_sims, settings.seed)
    ev = evaluate(ctx, v, drivers, settings.mid_year)

    use_perp = settings.terminal_method == "perpetuity"
    price = ev.dcf.price_perpetuity if use_perp else ev.dcf.price_exit
    ent_value = ev.dcf.ev_perpetuity if use_perp else ev.dcf.ev_exit
    feasible = ev.entry.feasible
    irr, moic = ev.lbo.irr, ev.lbo.moic
    breaches = [
        CovenantBreachYear(year=y + 1, leverage=float(ev.lbo.leverage_breach[:, y].mean()), coverage=float(ev.lbo.coverage_breach[:, y].mean()),
                           any=float((ev.lbo.leverage_breach[:, y] | ev.lbo.coverage_breach[:, y]).mean()))
        for y in range(ev.terms.exit_year)
    ] if feasible else []
    notes = []
    if ev.clipped_terminal_growth:
        notes.append(f"Terminal growth was capped at WACC − 0.5pp in {ev.clipped_terminal_growth:,} simulations "
                     f"({ev.clipped_terminal_growth / settings.n_sims:.1%}).")
    if not feasible:
        notes.append(f"LBO not run: {ev.entry.infeasible_reason}")
    inputs = [
        InputSummary(key=k, label=SPECS[k].label, unit=SPECS[k].unit, base=v[k], mean=float(drivers[k].mean()),
                     p5=float(np.percentile(drivers[k], 5)), p95=float(np.percentile(drivers[k], 95)), distribution=dists[k])
        for k in keys
    ]
    elapsed = (time.perf_counter() - start) * 1000
    result = MonteCarloResult(
        n_sims=settings.n_sims, seed=settings.seed, elapsed_ms=round(elapsed, 1), terminal_method=settings.terminal_method,
        price=summarize(price), enterprise_value=summarize(ent_value), prob_price_above_current=float((price > ctx.price).mean()),
        irr=summarize(irr) if feasible else None, moic=summarize(moic) if feasible else None,
        prob_irr_above_hurdle=float((irr >= settings.hurdle_irr).mean()) if feasible else None,
        prob_loss=float((moic < 1).mean()) if feasible else None, hurdle_irr=settings.hurdle_irr,
        covenant_breach=breaches, convergence=convergence(price), inputs=inputs,
        correlation=CorrelationSpec(variables=keys, matrix=np.round(corr, 4).tolist()), notes=notes,
    )
    offer = offer_price_for_irr(ev.lbo.exit_equity, settings.hurdle_irr, ev.entry, ev.terms, ctx.bridge.shares) if feasible else None
    return SimulationOutput(result=result, price=price, lbo_offer_at_hurdle=offer)


# ----------------------------------------------------------------------------- sensitivity


def tornado(ctx: CompanyContext, v: dict[str, float], dists: dict[str, Distribution], settings: SimSettings) -> SensitivityResult:
    """Swing each driver from its P10 to its P90 with all others at base, in one batched evaluation."""
    keys = list(STOCHASTIC_KEYS)
    k = len(keys)
    drivers = {key: np.full(2 * k + 1, v[key]) for key in keys}  # last row = base case
    lows, highs = {}, {}
    for i, key in enumerate(keys):
        lows[key], highs[key] = quantile(dists[key], 0.10), quantile(dists[key], 0.90)
        drivers[key][2 * i], drivers[key][2 * i + 1] = lows[key], highs[key]
    ev = evaluate(ctx, v, drivers, settings.mid_year)
    price = ev.dcf.price_perpetuity if settings.terminal_method == "perpetuity" else ev.dcf.price_exit
    irr = ev.lbo.irr if ev.entry.feasible else None
    items = [
        TornadoItem(key=key, label=SPECS[key].label, unit=SPECS[key].unit, low_input=lows[key], high_input=highs[key],
                    price_low=float(price[2 * i]), price_high=float(price[2 * i + 1]),
                    irr_low=float(irr[2 * i]) if irr is not None else None, irr_high=float(irr[2 * i + 1]) if irr is not None else None,
                    price_swing=float(abs(price[2 * i + 1] - price[2 * i])))
        for i, key in enumerate(keys)
    ]
    items.sort(key=lambda it: it.price_swing, reverse=True)
    return SensitivityResult(base_price=float(price[-1]), base_irr=float(irr[-1]) if irr is not None else None, items=items)
