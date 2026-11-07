"""Inverse-CDF (percent-point) functions for the supported marginal distributions."""

from __future__ import annotations

import math

import numpy as np
from scipy import stats

from app.schemas.assumptions import Distribution

_EPS = 1e-12


def lognormal_params(mean: float, std: float) -> tuple[float, float]:
    """Convert the mean/std of a lognormal variable into (mu, sigma) of its logarithm."""
    sigma2 = math.log(1 + (std / mean) ** 2)
    return math.log(mean) - sigma2 / 2, math.sqrt(sigma2)


def ppf(dist: Distribution, u: np.ndarray) -> np.ndarray:
    """Map uniforms ``u`` in (0, 1) to samples of ``dist`` via its inverse CDF."""
    u = np.clip(u, _EPS, 1 - _EPS)
    k = dist.kind
    if k == "normal":
        return stats.norm.ppf(u, loc=dist.mean, scale=dist.std)
    if k == "truncnormal":
        a, b = (dist.low - dist.mean) / dist.std, (dist.high - dist.mean) / dist.std  # type: ignore[operator]
        return stats.truncnorm.ppf(u, a, b, loc=dist.mean, scale=dist.std)
    if k == "triangular":
        width = dist.high - dist.low  # type: ignore[operator]
        return stats.triang.ppf(u, (dist.mode - dist.low) / width, loc=dist.low, scale=width)  # type: ignore[operator]
    if k == "uniform":
        return dist.low + u * (dist.high - dist.low)  # type: ignore[operator]
    if k == "lognormal":
        mu, sigma = lognormal_params(dist.mean, dist.std)  # type: ignore[arg-type]
        return stats.lognorm.ppf(u, s=sigma, scale=math.exp(mu))
    raise ValueError(f"Unsupported distribution: {k}")


def quantile(dist: Distribution, q: float) -> float:
    return float(ppf(dist, np.array([q]))[0])
