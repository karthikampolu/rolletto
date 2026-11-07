"""Derive default assumptions from historicals and market data, and resolve user overrides.

Every default carries its source and rationale. Caps and floors keep a single unusual year from
producing an absurd projection; when a cap binds, the rationale says so.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

import numpy as np

from app.core.config import CountryDefaults
from app.core.errors import InvalidInputError
from app.engine.wacc import BETA_CAP, BETA_FLOOR, blume_adjust, cost_of_equity, wacc
from app.schemas.assumptions import Assumption, AssumptionSet, CorrelationSpec, Distribution
from app.schemas.company import Financials, MarketData

STOCHASTIC_KEYS = ("revenue_growth", "ebitda_margin", "capex_pct_revenue", "wacc", "terminal_growth", "exit_multiple", "senior_rate")

#: Default pairwise correlations between stochastic drivers (all others zero).
DEFAULT_CORRELATIONS: dict[tuple[str, str], float] = {
    ("revenue_growth", "ebitda_margin"): 0.30,     # operating leverage
    ("revenue_growth", "capex_pct_revenue"): 0.30,  # growth needs investment
    ("revenue_growth", "exit_multiple"): 0.50,      # markets pay up for growth
    ("ebitda_margin", "exit_multiple"): 0.25,
    ("wacc", "exit_multiple"): -0.40,               # higher discount rates compress multiples
    ("wacc", "senior_rate"): 0.60,                  # common rate environment
    ("wacc", "terminal_growth"): 0.20,              # inflation lifts both
}


@dataclass(frozen=True)
class _Spec:
    label: str
    group: str
    unit: str
    lo: float
    hi: float
    step: float
    description: str


SPECS: dict[str, _Spec] = {
    "revenue_growth": _Spec("Revenue growth (year 1)", "Operating", "pct", -0.30, 0.60, 0.005,
                            "Year-1 revenue growth. Growth fades linearly toward terminal growth over the projection."),
    "ebitda_margin": _Spec("EBITDA margin", "Operating", "pct", -0.20, 0.80, 0.005, "EBITDA as a share of revenue, held constant over the projection."),
    "da_pct_revenue": _Spec("D&A % revenue", "Operating", "pct", 0.0, 0.30, 0.0025, "Depreciation & amortisation as a share of revenue; reduces taxable EBIT."),
    "capex_pct_revenue": _Spec("Capex % revenue", "Operating", "pct", 0.0, 0.40, 0.0025, "Capital expenditure as a share of revenue."),
    "terminal_capex_to_da": _Spec("Terminal capex / D&A", "Operating", "x", 0.5, 3.0, 0.05,
                                  "Steady-state capex as a multiple of D&A; capex % revenue fades to this level by the final forecast year."),
    "nwc_pct_revenue": _Spec("NWC % revenue", "Operating", "pct", -0.30, 0.50, 0.005,
                             "Operating working capital as a share of revenue; ΔNWC = this × change in revenue."),
    "tax_rate": _Spec("Tax rate", "Operating", "pct", 0.0, 0.45, 0.005, "Cash tax rate applied to positive EBIT."),
    "projection_years": _Spec("Projection years", "Operating", "years", 5, 10, 1, "Explicit forecast horizon before the terminal value."),
    "risk_free": _Spec("Risk-free rate", "Cost of capital", "pct", 0.0, 0.15, 0.0025, "Local 10-year government bond yield."),
    "equity_risk_premium": _Spec("Equity risk premium", "Cost of capital", "pct", 0.02, 0.12, 0.0025, "Extra return investors demand for equities over the risk-free rate."),
    "beta": _Spec("Beta (adjusted)", "Cost of capital", "num", 0.2, 3.0, 0.01, "Blume-adjusted beta: 0.67 × raw beta + 0.33."),
    "cost_of_debt": _Spec("Pre-tax cost of debt", "Cost of capital", "pct", 0.0, 0.20, 0.0025, "Interest expense / average total debt."),
    "debt_weight": _Spec("Target debt / capital", "Cost of capital", "pct", 0.0, 0.80, 0.01, "Debt weight D/(D+E) in the target capital structure."),
    "wacc": _Spec("WACC", "Cost of capital", "pct", 0.03, 0.25, 0.0025, "Weighted average cost of capital used to discount unlevered FCF."),
    "terminal_growth": _Spec("Terminal growth", "Cost of capital", "pct", -0.02, 0.08, 0.0025, "Perpetual nominal growth after the forecast; must stay below WACC."),
    "exit_multiple": _Spec("Exit EV/EBITDA", "Cost of capital", "x", 2.0, 40.0, 0.25, "Multiple of final-year EBITDA used for the exit-multiple terminal value and LBO exit."),
    "offer_premium": _Spec("Offer premium", "LBO entry", "pct", 0.0, 1.0, 0.01, "Premium to the current share price paid by the sponsor."),
    "advisory_fee_pct": _Spec("Advisory fees % EV", "LBO entry", "pct", 0.0, 0.05, 0.0025, "M&A advisory, legal and other transaction costs."),
    "financing_fee_pct": _Spec("Financing fees % debt", "LBO entry", "pct", 0.0, 0.05, 0.0025, "Arrangement and underwriting fees on new debt."),
    "min_cash_pct_revenue": _Spec("Minimum cash % revenue", "LBO entry", "pct", 0.0, 0.15, 0.005, "Operating cash kept on balance sheet; not available for debt paydown."),
    "senior_leverage": _Spec("Senior debt / EBITDA", "LBO debt", "x", 0.0, 7.0, 0.25, "Senior secured term loan sized as a multiple of LTM EBITDA."),
    "senior_rate": _Spec("Senior interest rate", "LBO debt", "pct", 0.0, 0.20, 0.0025, "All-in cash interest rate on the term loan."),
    "senior_amortization": _Spec("Senior amortisation % p.a.", "LBO debt", "pct", 0.0, 0.25, 0.01, "Mandatory annual repayment as % of original principal."),
    "sub_leverage": _Spec("Subordinated debt / EBITDA", "LBO debt", "x", 0.0, 4.0, 0.25, "High-yield / subordinated bullet note sized on LTM EBITDA."),
    "sub_rate": _Spec("Subordinated interest rate", "LBO debt", "pct", 0.0, 0.25, 0.0025, "Cash coupon on the subordinated note."),
    "revolver_size": _Spec("Revolver / EBITDA", "LBO debt", "x", 0.0, 2.0, 0.25, "Undrawn revolving facility available to fund shortfalls."),
    "revolver_rate": _Spec("Revolver interest rate", "LBO debt", "pct", 0.0, 0.20, 0.0025, "Interest on drawn revolver balances."),
    "cash_sweep": _Spec("Cash sweep", "LBO debt", "pct", 0.0, 1.0, 0.05, "Share of excess cash used to prepay senior debt each year."),
    "exit_year": _Spec("Exit year", "LBO exit & covenants", "years", 3, 7, 1, "Holding period before the sponsor sells."),
    "max_net_leverage": _Spec("Covenant: max net debt / EBITDA", "LBO exit & covenants", "x", 1.0, 10.0, 0.25, "Maintenance covenant tested annually."),
    "min_interest_coverage": _Spec("Covenant: min EBITDA / interest", "LBO exit & covenants", "x", 1.0, 6.0, 0.25, "Maintenance covenant tested annually."),
}

WACC_COMPONENTS = ("risk_free", "equity_risk_premium", "beta", "cost_of_debt", "debt_weight", "tax_rate")


@dataclass(frozen=True)
class _Derived:
    value: float
    source: str
    rationale: str
    dist: Distribution | None = None


def _clamp(x: float, lo: float, hi: float) -> tuple[float, bool]:
    c = max(lo, min(hi, x))
    return c, c != x


def _ratios(fin: Financials, num: str, den: str = "revenue", last: int = 3) -> list[float]:
    out = []
    for y in fin.years[-last:]:
        n, d = getattr(y, num), getattr(y, den)
        if n is not None and d:
            out.append(n / d)
    return out


def _growth_stats(fin: Financials) -> tuple[float | None, float | None, int]:
    ys = [y for y in fin.years if y.revenue and y.revenue > 0]
    if len(ys) < 2:
        return None, None, len(ys)
    span = ys[-1].fiscal_year - ys[0].fiscal_year or 1
    cagr = (ys[-1].revenue / ys[0].revenue) ** (1 / span) - 1
    yoy = [b.revenue / a.revenue - 1 for a, b in zip(ys, ys[1:])]
    return cagr, (statistics.pstdev(yoy) if len(yoy) >= 2 else None), len(ys)


def derive_defaults(fin: Financials, market: MarketData, country_name: str, country: CountryDefaults) -> AssumptionSet:
    """Build the full default ``AssumptionSet`` with sources, rationales and distributions."""
    d: dict[str, _Derived] = {}
    latest = fin.years[-1]

    # --- operating ------------------------------------------------------------------------
    cagr, g_sd, n_rev = _growth_stats(fin)
    if cagr is None:
        g, note = 0.03, "Fewer than 2 years of revenue; 3% placeholder."
    else:
        g, capped = _clamp(cagr, -0.05, 0.25)
        note = f"{n_rev - 1}-year revenue CAGR of {cagr:.1%}" + (", capped to [-5%, 25%]." if capped else ".")
    sd = min(max(g_sd or 0.0, 0.02), 0.08)
    d["revenue_growth"] = _Derived(g, "Historical CAGR", note,
                                   Distribution(kind="truncnormal", mean=g, std=sd, low=max(g - 3 * sd, -0.30), high=min(g + 3 * sd, 0.60)))

    margins = _ratios(fin, "ebitda")
    m_raw = statistics.fmean(margins) if margins else 0.15
    m, capped = _clamp(m_raw, -0.10, 0.60)
    m_sd = min(max(statistics.pstdev(margins) if len(margins) > 1 else 0.0, 0.015), 0.06)
    d["ebitda_margin"] = _Derived(m, f"{len(margins)}-year average" if margins else "Placeholder",
                                  f"Average EBITDA margin {m_raw:.1%}" + (", capped to [-10%, 60%]." if capped else "."),
                                  Distribution(kind="truncnormal", mean=m, std=m_sd, low=max(m - 3 * m_sd, -0.20), high=min(m + 3 * m_sd, 0.80)))

    da = _ratios(fin, "d_and_a")
    da_v = statistics.fmean(da) if da else 0.03
    d["da_pct_revenue"] = _Derived(da_v, f"{len(da)}-year average" if da else "Placeholder",
                                   f"Average D&A at {da_v:.1%} of revenue." if da else "D&A not reported; 3% of revenue placeholder.")

    cx = _ratios(fin, "capex")
    cx_v = statistics.fmean(cx) if cx else da_v
    d["capex_pct_revenue"] = _Derived(cx_v, f"{len(cx)}-year average" if cx else "Set equal to D&A",
                                      f"Average capex at {cx_v:.1%} of revenue." if cx else "Capex not reported; set to D&A (maintenance level).",
                                      Distribution(kind="triangular", low=cx_v * 0.75, mode=cx_v, high=cx_v * 1.30 + 1e-4))

    cx_da = [y.capex / y.d_and_a for y in fin.years[-3:] if y.capex is not None and y.d_and_a]
    k_raw = statistics.fmean(cx_da) if cx_da else 1.0
    k, capped = _clamp(k_raw, 1.0, 1.5)
    d["terminal_capex_to_da"] = _Derived(k, f"{len(cx_da)}-year capex / D&A" if cx_da else "Steady state",
                                         f"Historical capex ran at {k_raw:.2f}x D&A" + (", bounded to [1.0x, 1.5x] for the steady state." if capped else ".")
                                         if cx_da else "Capex or D&A not reported; steady-state capex equal to D&A.")

    nwc_hist = _ratios(fin, "net_working_capital")
    if nwc_hist:
        nwc, capped = _clamp(statistics.median(nwc_hist), -0.20, 0.40)
        d["nwc_pct_revenue"] = _Derived(nwc, f"{len(nwc_hist)}-year median", f"Median operating NWC at {nwc:.1%} of revenue"
                                        + (" (capped)." if capped else "."))
    else:
        d["nwc_pct_revenue"] = _Derived(0.0, "Not reported", "Working capital not reported; incremental NWC assumed zero.")

    eff = [y.tax_expense / y.pretax_income for y in fin.years[-3:] if y.tax_expense is not None and y.pretax_income and y.pretax_income > 0]
    eff_v = statistics.fmean(eff) if eff else None
    if eff_v is not None and 0.05 <= eff_v <= 0.40:
        tax, _ = _clamp(eff_v, 0.0, 0.35)
        d["tax_rate"] = _Derived(tax, f"{len(eff)}-year effective rate", f"Average effective tax rate {eff_v:.1%}, capped at 35%.")
    else:
        d["tax_rate"] = _Derived(country.tax_rate, "Statutory rate", f"Effective rate unusable ({'n/a' if eff_v is None else f'{eff_v:.1%}'}); "
                                 f"{country_name} statutory rate used.")

    d["projection_years"] = _Derived(5, "Convention", "Five-year explicit forecast is standard for mature companies.")

    # --- cost of capital ------------------------------------------------------------------
    d["risk_free"] = _Derived(country.risk_free, "Country default", f"{country_name} 10-year government bond yield (configurable).")
    d["equity_risk_premium"] = _Derived(country.equity_risk_premium, "Country default", f"{country_name} equity risk premium incl. country risk.")
    if market.beta is not None:
        b, capped = _clamp(blume_adjust(market.beta), BETA_FLOOR, BETA_CAP)
        d["beta"] = _Derived(b, "Provider beta, Blume-adjusted", f"Raw beta {market.beta:.2f} → 0.67×β + 0.33 = {blume_adjust(market.beta):.2f}"
                             + (f", bounded to [{BETA_FLOOR}, {BETA_CAP}]." if capped else "."))
    else:
        d["beta"] = _Derived(1.0, "Fallback", "Beta unavailable; market beta of 1.0 assumed.")

    debt = market.total_debt if market.total_debt is not None else (latest.total_debt or 0.0)
    rf = country.risk_free
    avg_debt = statistics.fmean([y.total_debt for y in fin.years[-2:] if y.total_debt]) if any(y.total_debt for y in fin.years[-2:]) else 0.0
    if latest.interest_expense and avg_debt > 0:
        kd_raw = latest.interest_expense / avg_debt
        kd, capped = _clamp(kd_raw, rf + 0.01, 0.15)
        d["cost_of_debt"] = _Derived(kd, "Interest / average debt", f"FY{latest.fiscal_year} interest {kd_raw:.2%} of average debt"
                                     + (", bounded to [Rf + 1%, 15%]." if capped else "."))
    else:
        d["cost_of_debt"] = _Derived(rf + 0.02, "Rf + 2%", "Interest or debt not reported; risk-free plus 2% used.")

    wd, capped = _clamp(debt / (debt + market.market_cap) if debt + market.market_cap > 0 else 0.0, 0.0, 0.60)
    d["debt_weight"] = _Derived(wd, "Current market structure", f"Market D/(D+E) = {wd:.1%}" + (", capped at 60%." if capped else "."))

    ke = cost_of_equity(d["risk_free"].value, d["beta"].value, d["equity_risk_premium"].value)
    w = wacc(ke, d["cost_of_debt"].value, d["tax_rate"].value, wd)
    d["wacc"] = _Derived(w, "CAPM-based WACC", f"Ke {ke:.2%} (Rf + β×ERP), Kd after tax {d['cost_of_debt'].value * (1 - d['tax_rate'].value):.2%}, D/V {wd:.0%}.",
                         Distribution(kind="truncnormal", mean=w, std=0.01, low=max(w - 0.03, 0.03), high=w + 0.03))

    tg = min(country.terminal_growth, w - 0.02)
    d["terminal_growth"] = _Derived(tg, "Country long-run growth", f"{country_name} long-run nominal growth"
                                    + (", reduced to WACC − 2%." if tg < country.terminal_growth else "."),
                                    Distribution(kind="triangular", low=tg - 0.01, mode=tg, high=tg + 0.005))

    if latest.ebitda and latest.ebitda > 0 and market.enterprise_value:
        em_raw = market.enterprise_value / latest.ebitda
        em, capped = _clamp(em_raw, 4.0, 25.0)
        em_note = f"Current EV/EBITDA {em_raw:.1f}x" + (", bounded to [4x, 25x]." if capped else ".")
    else:
        em, em_note = 10.0, "EBITDA not positive; 10x placeholder."
    d["exit_multiple"] = _Derived(em, "Current trading multiple", em_note, Distribution(kind="lognormal", mean=em, std=em * 0.15))

    # --- LBO --------------------------------------------------------------------------------
    d["offer_premium"] = _Derived(0.25, "Market convention", "Typical 20–30% control premium for public-to-private deals.")
    d["advisory_fee_pct"] = _Derived(0.02, "Market convention", "≈2% of EV for advisory, legal and diligence.")
    d["financing_fee_pct"] = _Derived(0.025, "Market convention", "≈2–3% of debt raised.")
    d["min_cash_pct_revenue"] = _Derived(0.02, "Market convention", "2% of revenue kept as operating cash.")

    entry_ev_multiple = (market.market_cap * 1.25 + debt - (market.cash or 0.0)) / latest.ebitda if latest.ebitda and latest.ebitda > 0 else 0.0
    max_total = max(0.0, min(5.0, 0.6 * entry_ev_multiple))
    senior = min(3.5, max_total * 0.7)
    sub = max(0.0, max_total - senior)
    lev_note = f"Total leverage capped at min(5.0x, 60% of entry EV/EBITDA ≈ {entry_ev_multiple:.1f}x)."
    d["senior_leverage"] = _Derived(round(senior * 4) / 4, "Leverage capacity", lev_note)
    d["sub_leverage"] = _Derived(round(sub * 4) / 4, "Leverage capacity", lev_note)
    sr = rf + country.senior_spread
    d["senior_rate"] = _Derived(sr, "Rf + senior spread", f"Rf {rf:.2%} + {country.senior_spread:.2%} senior secured spread.",
                                Distribution(kind="uniform", low=max(sr - 0.01, 0.0), high=sr + 0.015))
    d["sub_rate"] = _Derived(sr + country.sub_spread, "Senior + sub spread", f"Senior rate + {country.sub_spread:.2%} for subordination; moves with the senior rate.")
    d["revolver_rate"] = _Derived(max(sr - 0.0025, 0.0), "Senior − 0.25%", "Revolver priced slightly inside the term loan; moves with the senior rate.")
    d["senior_amortization"] = _Derived(0.05, "Market convention", "5% of original principal per year (amortising term loan).")
    d["revolver_size"] = _Derived(0.5, "Market convention", "Revolver commitment of 0.5x EBITDA, undrawn at close.")
    d["cash_sweep"] = _Derived(0.75, "Market convention", "75% of excess cash flow sweeps the senior loan.")
    d["exit_year"] = _Derived(5, "Market convention", "Five-year hold.")
    d["max_net_leverage"] = _Derived(6.0, "Market convention", "Typical maintenance covenant for a sponsor-backed loan.")
    d["min_interest_coverage"] = _Derived(2.0, "Market convention", "Typical minimum EBITDA / cash interest.")

    items = [
        Assumption(key=k, label=s.label, group=s.group, value=float(d[k].value), unit=s.unit, min=s.lo, max=s.hi, step=s.step,  # type: ignore[arg-type]
                   source=d[k].source, rationale=d[k].rationale, description=s.description, stochastic=k in STOCHASTIC_KEYS, distribution=d[k].dist)
        for k, s in SPECS.items()
    ]
    return AssumptionSet(items=items, correlation=default_correlation())


def default_correlation() -> CorrelationSpec:
    keys = list(STOCHASTIC_KEYS)
    m = np.eye(len(keys))
    for (a, b), rho in DEFAULT_CORRELATIONS.items():
        i, j = keys.index(a), keys.index(b)
        m[i, j] = m[j, i] = rho
    return CorrelationSpec(variables=keys, matrix=m.tolist())


def shift_distribution(dist: Distribution, old_center: float, new_center: float) -> Distribution:
    """Re-centre a default distribution on an overridden base value, preserving its shape."""
    delta = new_center - old_center
    if dist.kind == "lognormal":
        ratio = new_center / old_center if old_center > 0 and new_center > 0 else 1.0
        return dist.model_copy(update={"mean": new_center, "std": (dist.std or 0.0) * ratio})
    upd = {k: getattr(dist, k) + delta for k in ("mean", "low", "mode", "high") if getattr(dist, k) is not None}
    return dist.model_copy(update=upd)


@dataclass(frozen=True)
class ResolvedAssumptions:
    values: dict[str, float]
    distributions: dict[str, Distribution]


def resolve(defaults: AssumptionSet, overrides: dict[str, float], distributions: dict[str, Distribution]) -> ResolvedAssumptions:
    """Apply user overrides, recompute WACC when its components change, and re-centre distributions."""
    unknown = set(overrides) - set(SPECS)
    if unknown:
        raise InvalidInputError(f"Unknown assumption keys: {', '.join(sorted(unknown))}", details={"keys": sorted(unknown)})
    unknown_d = set(distributions) - set(STOCHASTIC_KEYS)
    if unknown_d:
        raise InvalidInputError(f"Distributions are only supported for: {', '.join(STOCHASTIC_KEYS)}", details={"keys": sorted(unknown_d)})

    base = {a.key: a.value for a in defaults.items}
    values = {**base, **overrides}
    for key, v in overrides.items():
        s = SPECS[key]
        if not s.lo <= v <= s.hi:
            raise InvalidInputError(f"{s.label} must be between {s.lo} and {s.hi}.", details={"key": key, "value": v})

    if "wacc" not in overrides and any(k in overrides for k in WACC_COMPONENTS):
        ke = cost_of_equity(values["risk_free"], values["beta"], values["equity_risk_premium"])
        values["wacc"] = wacc(ke, values["cost_of_debt"], values["tax_rate"], values["debt_weight"])
    # The sub-debt and revolver rates are defined as spreads over the senior rate unless set explicitly.
    if "senior_rate" in overrides:
        for k in ("sub_rate", "revolver_rate"):
            if k not in overrides:
                values[k] = base[k] + (values["senior_rate"] - base["senior_rate"])
    for k in ("projection_years", "exit_year"):
        values[k] = float(round(values[k]))

    if values["terminal_growth"] >= values["wacc"] - 0.005:
        raise InvalidInputError("Terminal growth must be at least 0.5pp below WACC.",
                                details={"wacc": values["wacc"], "terminal_growth": values["terminal_growth"]})

    dists: dict[str, Distribution] = {}
    by_key = {a.key: a for a in defaults.items}
    for key in STOCHASTIC_KEYS:
        if key in distributions:
            dists[key] = distributions[key]
        else:
            default = by_key[key].distribution
            assert default is not None
            dists[key] = shift_distribution(default, base[key], values[key]) if values[key] != base[key] else default
    return ResolvedAssumptions(values=values, distributions=dists)
