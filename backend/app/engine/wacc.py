"""Cost of capital: CAPM cost of equity, cost of debt, WACC."""

from __future__ import annotations

BLUME_WEIGHT = 0.67
BETA_FLOOR, BETA_CAP = 0.4, 2.5


def blume_adjust(raw_beta: float) -> float:
    """Blume (1975) adjustment pulling raw regression beta toward the market beta of 1:
    beta_adj = 0.67 * beta_raw + 0.33."""
    return BLUME_WEIGHT * raw_beta + (1 - BLUME_WEIGHT)


def cost_of_equity(risk_free: float, beta: float, equity_risk_premium: float) -> float:
    """CAPM: Ke = Rf + beta * ERP."""
    return risk_free + beta * equity_risk_premium


def wacc(cost_equity: float, pre_tax_cost_debt: float, tax_rate: float, debt_weight: float) -> float:
    """WACC = E/V * Ke + D/V * Kd * (1 - t), with ``debt_weight`` = D/V at the target structure."""
    return (1 - debt_weight) * cost_equity + debt_weight * pre_tax_cost_debt * (1 - tax_rate)
