"""LBO suitability score (0–100) from six transparent sub-scores.

Each sub-score maps one historical metric linearly between a "bad" and a "good" threshold; the
total is the weight-averaged score over the sub-scores that could be computed (weights of missing
metrics are redistributed). Thresholds reflect what leveraged-finance lenders typically look for.
"""

from __future__ import annotations

import statistics

from app.schemas.company import Financials, MarketData, Suitability, SuitabilityComponent


def _linear(value: float, bad: float, good: float) -> float:
    """Map ``value`` to 0..100, 0 at ``bad`` and 100 at ``good`` (either direction), clamped."""
    if good == bad:
        return 100.0
    return max(0.0, min(100.0, (value - bad) / (good - bad) * 100.0))


def _cv(values: list[float]) -> float | None:
    if len(values) < 3:
        return None
    mean = statistics.fmean(values)
    if mean <= 0:
        return None
    return statistics.pstdev(values) / mean


def score_suitability(fin: Financials, market: MarketData) -> Suitability:
    ys = [y for y in fin.years if y.revenue and y.revenue > 0]
    comps: list[SuitabilityComponent] = []

    def add(key: str, label: str, weight: float, metric: float | None, metric_label: str, score: float | None, reasoning: str) -> None:
        comps.append(SuitabilityComponent(key=key, label=label, weight=weight, score=score, metric=metric, metric_label=metric_label, reasoning=reasoning))

    # 1. Cash-flow stability: coefficient of variation of operating cash flow.
    ocf = [y.operating_cash_flow for y in ys if y.operating_cash_flow is not None]
    cv = _cv(ocf)
    if cv is None:
        add("cash_flow_stability", "Cash-flow stability", 0.20, None, "OCF coefficient of variation", None,
            "Needs at least 3 years of positive operating cash flow.")
    else:
        add("cash_flow_stability", "Cash-flow stability", 0.20, cv, "OCF coefficient of variation", _linear(cv, 0.5, 0.1),
            f"Operating cash flow varies by {cv:.0%} of its mean year to year; lenders want ≲10–15%.")

    # 2. FCF conversion: (OCF − capex) / EBITDA, averaged.
    conv = [(y.operating_cash_flow - y.capex) / y.ebitda for y in ys
            if y.operating_cash_flow is not None and y.capex is not None and y.ebitda and y.ebitda > 0]
    if not conv:
        add("fcf_conversion", "FCF conversion", 0.20, None, "FCF / EBITDA", None, "Requires OCF, capex and positive EBITDA.")
    else:
        c = statistics.fmean(conv)
        add("fcf_conversion", "FCF conversion", 0.20, c, "FCF / EBITDA", _linear(c, 0.15, 0.6),
            f"Converts {c:.0%} of EBITDA into free cash flow on average; ≥60% services debt comfortably.")

    # 3. Current leverage: net debt / EBITDA (lower leaves more debt capacity).
    latest = ys[-1] if ys else None
    if latest is None or not latest.ebitda or latest.ebitda <= 0:
        add("current_leverage", "Current leverage", 0.15, None, "Net debt / EBITDA", None, "EBITDA is not positive.")
    else:
        debt = market.total_debt if market.total_debt is not None else (latest.total_debt or 0.0)
        cash = market.cash if market.cash is not None else (latest.cash or 0.0)
        lev = (debt - cash) / latest.ebitda
        add("current_leverage", "Current leverage", 0.15, lev, "Net debt / EBITDA", _linear(lev, 4.0, 0.5),
            f"Already carries {lev:.1f}x net debt/EBITDA; headroom shrinks above ~3x.")

    # 4. Margin stability: std dev of EBITDA margin (percentage points).
    margins = [y.ebitda / y.revenue for y in ys if y.ebitda is not None]
    if len(margins) < 3:
        add("margin_stability", "Margin stability", 0.15, None, "EBITDA margin std dev", None, "Needs 3+ years of EBITDA.")
    else:
        sd = statistics.pstdev(margins)
        add("margin_stability", "Margin stability", 0.15, sd, "EBITDA margin std dev", _linear(sd, 0.08, 0.01),
            f"EBITDA margin moved ±{sd * 100:.1f}pp around {statistics.fmean(margins):.1%}; stable margins protect covenants.")

    # 5. Capex intensity: capex / revenue.
    capex = [y.capex / y.revenue for y in ys if y.capex is not None]
    if not capex:
        add("capex_intensity", "Capex intensity", 0.15, None, "Capex / revenue", None, "Capex not reported.")
    else:
        ci = statistics.fmean(capex)
        add("capex_intensity", "Capex intensity", 0.15, ci, "Capex / revenue", _linear(ci, 0.15, 0.03),
            f"Spends {ci:.1%} of revenue on capex; asset-light businesses free more cash for debt paydown.")

    # 6. Growth profile: revenue CAGR — steady single/low-double digit growth is ideal; decline or hyper-growth less so.
    if len(ys) < 2:
        add("growth_profile", "Growth profile", 0.15, None, "Revenue CAGR", None, "Needs 2+ years of revenue.")
    else:
        cagr = (ys[-1].revenue / ys[0].revenue) ** (1 / (ys[-1].fiscal_year - ys[0].fiscal_year or 1)) - 1
        score = _linear(cagr, -0.05, 0.03) if cagr < 0.03 else (100.0 if cagr <= 0.15 else _linear(cagr, 0.40, 0.15))
        add("growth_profile", "Growth profile", 0.15, cagr, "Revenue CAGR", score,
            f"Revenue grew at {cagr:.1%} a year; 3–15% is the sweet spot for predictable deleveraging.")

    scored = [c for c in comps if c.score is not None]
    total_w = sum(c.weight for c in scored)
    total = sum(c.score * c.weight for c in scored) / total_w if total_w else 0.0  # type: ignore[operator]
    grade = "Strong" if total >= 75 else "Moderate" if total >= 55 else "Weak" if total >= 35 else "Poor"
    best = max(scored, key=lambda c: c.score) if scored else None  # type: ignore[arg-type, return-value]
    worst = min(scored, key=lambda c: c.score) if scored else None  # type: ignore[arg-type, return-value]
    summary = (f"{grade} LBO candidate ({total:.0f}/100). Strongest: {best.label.lower()}; weakest: {worst.label.lower()}."
               if best and worst else "Insufficient data to score LBO suitability.")
    return Suitability(score=round(total, 1), grade=grade, summary=summary, components=comps)
