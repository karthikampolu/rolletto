"""Vectorised leveraged-buyout model.

The entry (price, sources & uses, opening debt) is deterministic: it depends only on today's price
and LTM EBITDA. Operations, exit multiple and interest rates may be stochastic arrays of shape (n,).
The debt schedule loops over *years* (at most 7); every year is computed for all simulations at once.

Conventions (also on the Methodology page):
  * Interest is charged on opening balances, which avoids the circular reference of average-balance interest.
  * Taxes = max(EBIT − interest, 0) × tax rate.
  * Levered FCF = EBITDA − interest − taxes − capex − ΔNWC.
  * Order of cash application each year: mandatory senior amortisation → revolver repayment →
    cash sweep of the remaining excess (× sweep %) against senior debt. The subordinated note is a
    bullet repaid at exit. Shortfalls are funded by the revolver up to its commitment; anything
    beyond that runs cash below the minimum balance.
  * Exit equity = max(exit EV − net debt, 0) (limited liability); MOIC = exit equity / sponsor equity;
    IRR = MOIC^(1/N) − 1, exact because there are no interim distributions to the sponsor.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.engine.dcf import ArrayLike, OperatingProjection


@dataclass(frozen=True)
class LboTerms:
    offer_premium: float
    advisory_fee_pct: float
    financing_fee_pct: float
    min_cash_pct_revenue: float
    senior_leverage: float
    sub_leverage: float
    senior_amortization: float
    revolver_size: float
    cash_sweep: float
    exit_year: int
    max_net_leverage: float
    min_interest_coverage: float


@dataclass(frozen=True)
class LboEntry:
    ltm_ebitda: float
    offer_price: float
    offer_equity: float
    entry_ev: float
    entry_multiple: float
    senior0: float
    sub0: float
    revolver_capacity: float
    advisory_fees: float
    financing_fees: float
    min_cash: float
    existing_debt: float
    existing_cash: float
    sponsor_equity: float
    feasible: bool
    infeasible_reason: str | None

    @property
    def total_uses(self) -> float:
        return self.offer_equity + self.existing_debt + self.advisory_fees + self.financing_fees + self.min_cash


@dataclass(frozen=True)
class LboArrays:
    """Per-year arrays have shape (n, N); exit metrics have shape (n,)."""

    interest_senior: np.ndarray
    interest_sub: np.ndarray
    interest_revolver: np.ndarray
    taxes: np.ndarray
    fcf: np.ndarray
    mandatory: np.ndarray
    revolver_draw: np.ndarray
    revolver_repay: np.ndarray
    sweep: np.ndarray
    senior: np.ndarray
    sub: np.ndarray
    revolver: np.ndarray
    cash: np.ndarray
    net_debt: np.ndarray
    net_leverage: np.ndarray
    coverage: np.ndarray
    leverage_breach: np.ndarray
    coverage_breach: np.ndarray
    exit_ev: np.ndarray
    exit_equity: np.ndarray
    moic: np.ndarray
    irr: np.ndarray


def build_entry(
    *, price: float, shares: float, total_debt: float, cash: float, revenue0: float, ltm_ebitda: float, terms: LboTerms
) -> LboEntry:
    """Sources & uses. Uses: equity purchase, debt refinancing, fees, minimum cash.
    Sources: senior + subordinated debt, existing balance-sheet cash, sponsor equity (the plug)."""
    offer_price = price * (1 + terms.offer_premium)
    offer_equity = offer_price * shares
    entry_ev = offer_equity + total_debt - cash
    senior0 = max(terms.senior_leverage * ltm_ebitda, 0.0)
    sub0 = max(terms.sub_leverage * ltm_ebitda, 0.0)
    advisory = terms.advisory_fee_pct * entry_ev
    financing = terms.financing_fee_pct * (senior0 + sub0)
    min_cash = terms.min_cash_pct_revenue * revenue0
    uses = offer_equity + total_debt + advisory + financing + min_cash
    sponsor = uses - senior0 - sub0 - cash

    reason = None
    if ltm_ebitda <= 0:
        reason = "LTM EBITDA is not positive, so debt cannot be sized on leverage multiples."
    elif sponsor <= 0:
        reason = "The debt package plus existing cash exceeds the purchase price; reduce leverage."
    return LboEntry(
        ltm_ebitda=ltm_ebitda,
        offer_price=offer_price,
        offer_equity=offer_equity,
        entry_ev=entry_ev,
        entry_multiple=entry_ev / ltm_ebitda if ltm_ebitda > 0 else float("nan"),
        senior0=senior0,
        sub0=sub0,
        revolver_capacity=max(terms.revolver_size * ltm_ebitda, 0.0),
        advisory_fees=advisory,
        financing_fees=financing,
        min_cash=min_cash,
        existing_debt=total_debt,
        existing_cash=cash,
        sponsor_equity=sponsor,
        feasible=reason is None,
        infeasible_reason=reason,
    )


def _safe_ratio(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    """num / den, +inf where den <= 0.

    Leverage with non-positive EBITDA becomes +inf (always a breach); coverage with zero interest
    becomes +inf (never a breach) and with negative EBITDA is negative (always a breach)."""
    out = np.full(np.broadcast(num, den).shape, np.inf)
    np.divide(num, den, out=out, where=den > 0)
    return out


def run_lbo(
    ops: OperatingProjection,
    entry: LboEntry,
    terms: LboTerms,
    *,
    tax_rate: ArrayLike,
    senior_rate: ArrayLike,
    sub_rate: ArrayLike,
    revolver_rate: ArrayLike,
    exit_multiple: ArrayLike,
) -> LboArrays:
    """Run the annual debt schedule and exit for every simulation. ``ops`` must cover ``exit_year`` years."""
    n_years = terms.exit_year
    n = ops.ebitda.shape[0]
    rs, rsub, rr = (np.broadcast_to(np.asarray(x, dtype=float), (n,)) for x in (senior_rate, sub_rate, revolver_rate))
    tax = np.broadcast_to(np.asarray(tax_rate, dtype=float), (n,))

    senior = np.full(n, entry.senior0)
    sub = np.full(n, entry.sub0)
    revolver = np.zeros(n)
    cash = np.full(n, entry.min_cash)
    out = {k: np.zeros((n, n_years)) for k in (
        "interest_senior", "interest_sub", "interest_revolver", "taxes", "fcf", "mandatory", "revolver_draw",
        "revolver_repay", "sweep", "senior", "sub", "revolver", "cash", "net_debt", "net_leverage", "coverage")}

    for y in range(n_years):
        ebitda = ops.ebitda[:, y]
        i_s, i_sub, i_r = senior * rs, sub * rsub, revolver * rr
        interest = i_s + i_sub + i_r
        taxes = np.maximum(ops.ebit[:, y] - interest, 0.0) * tax
        fcf = ebitda - interest - taxes - ops.capex[:, y] - ops.delta_nwc[:, y]

        mandatory = np.minimum(senior, terms.senior_amortization * entry.senior0)
        excess = cash + fcf - entry.min_cash - mandatory
        draw = np.where(excess < 0, np.minimum(-excess, entry.revolver_capacity - revolver), 0.0)
        excess = excess + draw
        repay = np.where(excess > 0, np.minimum(revolver, excess), 0.0)
        excess = excess - repay
        sweep = np.where(excess > 0, np.minimum(senior - mandatory, terms.cash_sweep * excess), 0.0)
        excess = excess - sweep

        senior = senior - mandatory - sweep
        revolver = revolver + draw - repay
        cash = entry.min_cash + excess
        net_debt = senior + sub + revolver - cash

        for key, val in (("interest_senior", i_s), ("interest_sub", i_sub), ("interest_revolver", i_r), ("taxes", taxes),
                         ("fcf", fcf), ("mandatory", mandatory), ("revolver_draw", draw), ("revolver_repay", repay),
                         ("sweep", sweep), ("senior", senior), ("sub", sub), ("revolver", revolver), ("cash", cash),
                         ("net_debt", net_debt), ("net_leverage", _safe_ratio(net_debt, ebitda)),
                         ("coverage", _safe_ratio(ebitda, interest))):
            out[key][:, y] = val

    exit_ev = np.broadcast_to(np.asarray(exit_multiple, dtype=float), (n,)) * ops.ebitda[:, n_years - 1]
    exit_equity = np.maximum(exit_ev - out["net_debt"][:, -1], 0.0)
    if entry.feasible:
        moic = exit_equity / entry.sponsor_equity
        irr = np.where(moic > 0, moic ** (1.0 / n_years) - 1.0, -1.0)
    else:
        moic = np.full(n, np.nan)
        irr = np.full(n, np.nan)
    return LboArrays(
        **out,
        leverage_breach=out["net_leverage"] > terms.max_net_leverage,
        coverage_breach=out["coverage"] < terms.min_interest_coverage,
        exit_ev=exit_ev,
        exit_equity=exit_equity,
        moic=moic,
        irr=irr,
    )


def offer_price_for_irr(proceeds: np.ndarray, target_irr: float, entry: LboEntry, terms: LboTerms, shares: float) -> np.ndarray:
    """Maximum offer price per share at which a sponsor earns ``target_irr`` given exit ``proceeds``.

    Holding the debt package fixed, sponsor equity is linear in the offer equity value E:
        equity0 = E·(1 + adv%) + debt·adv% − cash·adv% + existing debt + fin fees + min cash − new debt − cash
    so E = (proceeds / (1 + h)^N − const) / (1 + adv%).
    """
    adv = terms.advisory_fee_pct
    const = (
        (entry.existing_debt - entry.existing_cash) * adv
        + entry.existing_debt + entry.financing_fees + entry.min_cash
        - entry.senior0 - entry.sub0 - entry.existing_cash
    )
    required_equity = proceeds / (1 + target_irr) ** terms.exit_year
    offer_equity = (required_equity - const) / (1 + adv)
    return offer_equity / shares
