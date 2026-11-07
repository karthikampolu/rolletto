"""Correlated Monte Carlo sampling and summary statistics.

Sampling uses a Gaussian copula: draw independent standard normals Z (n × k), correlate them with
the Cholesky factor L of the correlation matrix (Z·Lᵀ), map to uniforms with Φ, then push each
column through its marginal's inverse CDF. Marginals are therefore exactly as specified while the
rank correlation follows the matrix. Everything is vectorised; there is no loop over simulations.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from app.core.errors import InvalidInputError
from app.engine.distributions import ppf
from app.schemas.assumptions import CorrelationSpec, Distribution
from app.schemas.valuation import ConvergencePoint, DistributionStats, HistogramBin

PSD_TOLERANCE = -1e-10
HISTOGRAM_BINS = 40


def nearest_correlation(m: np.ndarray) -> np.ndarray:
    """Project a symmetric matrix to a nearby valid correlation matrix (eigenvalue clipping + rescale)."""
    vals, vecs = np.linalg.eigh((m + m.T) / 2)
    fixed = vecs @ np.diag(np.maximum(vals, 1e-8)) @ vecs.T
    d = np.sqrt(np.diag(fixed))
    return fixed / np.outer(d, d)


def build_correlation(spec: CorrelationSpec, keys: list[str]) -> np.ndarray:
    """Expand ``spec`` to a full matrix over ``keys`` (unspecified pairs = 0) and validate it is PSD."""
    unknown = set(spec.variables) - set(keys)
    if unknown:
        raise InvalidInputError(f"Correlation refers to unknown drivers: {', '.join(sorted(unknown))}")
    full = np.eye(len(keys))
    idx = [keys.index(v) for v in spec.variables]
    sub = np.asarray(spec.matrix, dtype=float)
    full[np.ix_(idx, idx)] = sub
    min_eig = float(np.linalg.eigvalsh(full).min())
    if min_eig < PSD_TOLERANCE:
        suggestion = np.round(nearest_correlation(full), 3)
        raise InvalidInputError(
            "Correlation matrix is not positive semi-definite (these correlations cannot coexist).",
            details={"min_eigenvalue": min_eig, "variables": keys, "suggested_matrix": suggestion.tolist()},
            code="correlation_not_psd",
        )
    return full


def _factor(corr: np.ndarray) -> np.ndarray:
    """Cholesky factor; for singular-but-PSD matrices fall back to the symmetric square root."""
    try:
        return np.linalg.cholesky(corr)
    except np.linalg.LinAlgError:
        vals, vecs = np.linalg.eigh(corr)
        return vecs @ np.diag(np.sqrt(np.maximum(vals, 0.0)))


def sample(dists: dict[str, Distribution], keys: list[str], corr: np.ndarray, n: int, seed: int | None) -> dict[str, np.ndarray]:
    """Draw ``n`` correlated samples for each driver in ``keys``. Same seed ⇒ identical draws."""
    rng = np.random.default_rng(seed)
    z = rng.standard_normal((n, len(keys))) @ _factor(corr).T
    u = stats.norm.cdf(z)
    return {k: ppf(dists[k], u[:, j]) for j, k in enumerate(keys)}


def summarize(x: np.ndarray) -> DistributionStats:
    """Moments, percentiles and a histogram over the central 99% of the finite samples."""
    x = x[np.isfinite(x)]
    if x.size == 0:
        x = np.zeros(1)
    p = np.percentile(x, [0.5, 5, 10, 25, 50, 75, 90, 95, 99.5])
    lo, hi = p[0], p[-1]
    if hi <= lo:
        hi = lo + max(abs(lo) * 0.01, 1e-9)
    counts, edges = np.histogram(x, bins=HISTOGRAM_BINS, range=(lo, hi))
    return DistributionStats(
        mean=float(x.mean()), std=float(x.std()), min=float(x.min()), max=float(x.max()),
        p5=float(p[1]), p10=float(p[2]), p25=float(p[3]), p50=float(p[4]), p75=float(p[5]), p90=float(p[6]), p95=float(p[7]),
        histogram=[HistogramBin(start=float(edges[i]), end=float(edges[i + 1]), count=int(c)) for i, c in enumerate(counts)],
        outside_histogram=int(((x < lo) | (x > hi)).sum()),
    )


def convergence(x: np.ndarray, points: int = 60) -> list[ConvergencePoint]:
    """Running mean with a 95% confidence band at log-spaced sample counts."""
    x = x[np.isfinite(x)]
    if x.size < 2:
        return []
    csum = np.cumsum(x)
    csq = np.cumsum(x * x)
    ns = np.unique(np.geomspace(min(50, x.size), x.size, points).astype(int))
    mean = csum[ns - 1] / ns
    var = np.maximum(csq[ns - 1] / ns - mean**2, 0.0)
    half = 1.96 * np.sqrt(var / ns)
    return [ConvergencePoint(n=int(k), mean=float(m), lower=float(m - h), upper=float(m + h)) for k, m, h in zip(ns, mean, half)]
