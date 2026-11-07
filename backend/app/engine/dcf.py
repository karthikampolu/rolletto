"""Vectorised unlevered DCF.

Every function operates on NumPy arrays of shape ``(n,)`` for drivers and ``(n, T)`` for
projections, so the deterministic base case (n = 1) and the Monte Carlo (n = 10,000+) share one
code path. Scalars broadcast.

Conventions (also documented on the Methodology page):
  * Revenue growth fades linearly from the year-1 rate toward terminal growth:
    g_t = g_1 + (g_T∞ - g_1) * (t - 1) / T, for t = 1..T.
  * Capex % revenue fades linearly from its year-1 level to a steady-state level of k × D&A % by the
    final forecast year: c_t = c_1 + (k·d − c_1) · (t − 1) / (T − 1). The terminal-year FCF that feeds the
    perpetuity is therefore a steady state rather than a peak-investment year (Rosenbaum & Pearl).
  * Taxes are charged on positive EBIT only (no loss carry-forwards are modelled).
  * ΔNWC = NWC% × (Revenue_t − Revenue_{t−1}), i.e. working capital is held at a constant share of revenue.
  * Mid-year convention discounts year-t cash flow at (t − 0.5). The perpetuity-growth terminal value is
    then discounted at (T − 0.5) for consistency (its first flow also arrives mid-year); the exit-multiple
    terminal value is a point-in-time sale price and is discounted at T. Without mid-year, both use T.
  * Equity value = EV − net debt − minority interest + non-operating assets (long-term investments).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

ArrayLike = np.ndarray | float


@dataclass(frozen=True)
class OperatingProjection:
    revenue: np.ndarray  # (n, T)
    growth: np.ndarray
    ebitda: np.ndarray
    d_and_a: np.ndarray
    ebit: np.ndarray
    taxes: np.ndarray
    nopat: np.ndarray
    capex: np.ndarray
    delta_nwc: np.ndarray
    ufcf: np.ndarray

    def head(self, years: int) -> OperatingProjection:
        """Return the first ``years`` projection years."""
        return OperatingProjection(**{k: v[:, :years] for k, v in self.__dict__.items()})


@dataclass(frozen=True)
class BalanceSheetBridge:
    total_debt: float
    cash: float
    minority_interest: float
    non_operating_assets: float
    shares: float

    @property
    def net_debt(self) -> float:
        return self.total_debt - self.cash


@dataclass(frozen=True)
class DcfArrays:
    discount_factors: np.ndarray  # (n, T)
    pv_ufcf: np.ndarray  # (n, T)
    sum_pv: np.ndarray  # (n,)
    tv_perpetuity: np.ndarray
    tv_exit: np.ndarray
    pv_tv_perpetuity: np.ndarray
    pv_tv_exit: np.ndarray
    ev_perpetuity: np.ndarray
    ev_exit: np.ndarray
    equity_perpetuity: np.ndarray
    equity_exit: np.ndarray
    price_perpetuity: np.ndarray
    price_exit: np.ndarray


def _col(x: ArrayLike) -> np.ndarray:
    """Broadcast a scalar or (n,) array to a column (n, 1) for year-wise arithmetic."""
    return np.atleast_1d(np.asarray(x, dtype=float))[:, None]


def project_operations(
    *,
    revenue0: float,
    growth1: ArrayLike,
    terminal_growth: ArrayLike,
    ebitda_margin: ArrayLike,
    da_pct: ArrayLike,
    capex_pct: ArrayLike,
    nwc_pct: ArrayLike,
    tax_rate: ArrayLike,
    years: int,
    fade_years: int | None = None,
    terminal_capex_pct: ArrayLike | None = None,
) -> OperatingProjection:
    """Project revenue → EBITDA → EBIT → NOPAT → unlevered FCF for ``years`` years.

    Growth fades over ``fade_years`` (default ``years``, the DCF horizon); any years beyond it (needed
    when an LBO hold is longer than the DCF horizon) grow at terminal growth. Capex fades from
    ``capex_pct`` to ``terminal_capex_pct`` (default: no fade) over the same horizon and then stays there.
    """
    fade = fade_years or years
    t = np.arange(1, years + 1, dtype=float)[None, :]
    g1, gt = _col(growth1), _col(terminal_growth)
    growth = g1 + (gt - g1) * np.minimum(t - 1, fade) / fade
    revenue = revenue0 * np.cumprod(1 + growth, axis=1)
    ebitda = revenue * _col(ebitda_margin)
    d_and_a = revenue * _col(da_pct)
    ebit = ebitda - d_and_a
    taxes = np.maximum(ebit, 0.0) * _col(tax_rate)
    nopat = ebit - taxes
    c1 = _col(capex_pct)
    c_end = c1 if terminal_capex_pct is None else _col(terminal_capex_pct)
    capex_share = c1 + (c_end - c1) * (np.minimum(t - 1, fade - 1) / (fade - 1) if fade > 1 else 1.0)
    capex = revenue * capex_share
    prev_revenue = np.concatenate([np.full((revenue.shape[0], 1), revenue0), revenue[:, :-1]], axis=1)
    delta_nwc = _col(nwc_pct) * (revenue - prev_revenue)
    ufcf = nopat + d_and_a - capex - delta_nwc
    return OperatingProjection(revenue, growth, ebitda, d_and_a, ebit, taxes, nopat, capex, delta_nwc, ufcf)


def value_dcf(
    ops: OperatingProjection,
    *,
    wacc: ArrayLike,
    terminal_growth: ArrayLike,
    exit_multiple: ArrayLike,
    mid_year: bool,
    bridge: BalanceSheetBridge,
) -> DcfArrays:
    """Discount the projection and bridge EV to equity value per share under both terminal methods.

    Callers must ensure wacc > terminal_growth for every element.
    """
    n_years = ops.ufcf.shape[1]
    t = np.arange(1, n_years + 1, dtype=float)[None, :]
    w = _col(wacc)
    g = _col(terminal_growth)[:, 0]
    periods = t - 0.5 if mid_year else t
    discount_factors = (1 + w) ** -periods
    pv_ufcf = ops.ufcf * discount_factors
    sum_pv = pv_ufcf.sum(axis=1)

    w1 = w[:, 0]
    final_fcf = ops.ufcf[:, -1]
    tv_perpetuity = final_fcf * (1 + g) / (w1 - g)
    tv_exit = np.atleast_1d(np.asarray(exit_multiple, dtype=float)) * ops.ebitda[:, -1]
    pv_tv_perpetuity = tv_perpetuity / (1 + w1) ** (n_years - 0.5 if mid_year else n_years)
    pv_tv_exit = tv_exit / (1 + w1) ** n_years

    ev_perpetuity = sum_pv + pv_tv_perpetuity
    ev_exit = sum_pv + pv_tv_exit
    adjust = -bridge.net_debt - bridge.minority_interest + bridge.non_operating_assets
    equity_perpetuity = ev_perpetuity + adjust
    equity_exit = ev_exit + adjust
    return DcfArrays(
        discount_factors=np.broadcast_to(discount_factors, ops.ufcf.shape),
        pv_ufcf=pv_ufcf,
        sum_pv=sum_pv,
        tv_perpetuity=tv_perpetuity,
        tv_exit=tv_exit,
        pv_tv_perpetuity=pv_tv_perpetuity,
        pv_tv_exit=pv_tv_exit,
        ev_perpetuity=ev_perpetuity,
        ev_exit=ev_exit,
        equity_perpetuity=equity_perpetuity,
        equity_exit=equity_exit,
        price_perpetuity=equity_perpetuity / bridge.shares,
        price_exit=equity_exit / bridge.shares,
    )
