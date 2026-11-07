"""Monte Carlo sampling, correlation handling, statistics and performance."""

import time

import numpy as np
import pytest

from app.core.errors import InvalidInputError
from app.engine.assumptions import STOCHASTIC_KEYS, default_correlation
from app.engine.distributions import ppf, quantile
from app.engine.montecarlo import build_correlation, convergence, sample, summarize
from app.engine.valuation import simulate, tornado
from app.schemas.assumptions import CorrelationSpec, Distribution
from app.schemas.valuation import SimSettings
from tests.fixtures.acme import ACME_CONTEXT, ACME_VALUES

DISTS = {
    "revenue_growth": Distribution(kind="truncnormal", mean=0.08, std=0.03, low=-0.02, high=0.18),
    "ebitda_margin": Distribution(kind="normal", mean=0.20, std=0.02),
    "capex_pct_revenue": Distribution(kind="triangular", low=0.04, mode=0.05, high=0.065),
    "wacc": Distribution(kind="truncnormal", mean=0.10, std=0.01, low=0.07, high=0.13),
    "terminal_growth": Distribution(kind="triangular", low=0.02, mode=0.03, high=0.035),
    "exit_multiple": Distribution(kind="lognormal", mean=8.0, std=1.2),
    "senior_rate": Distribution(kind="uniform", low=0.07, high=0.095),
}
KEYS = list(STOCHASTIC_KEYS)


def _settings(**kw):
    return SimSettings(**{"n_sims": 10_000, "seed": 7, "mid_year": False, **kw})


@pytest.mark.parametrize(("dist", "mean", "std"), [
    (Distribution(kind="normal", mean=1.0, std=0.5), 1.0, 0.5),
    (Distribution(kind="uniform", low=0.0, high=1.0), 0.5, (1 / 12) ** 0.5),
    (Distribution(kind="triangular", low=0.0, mode=0.5, high=1.0), 0.5, (1 / 24) ** 0.5),
    (Distribution(kind="lognormal", mean=8.0, std=1.2), 8.0, 1.2),
])
def test_marginals_have_the_requested_moments(dist, mean, std):
    x = ppf(dist, np.random.default_rng(1).random(400_000))
    assert x.mean() == pytest.approx(mean, rel=0.01)
    assert x.std() == pytest.approx(std, rel=0.02)


def test_truncated_normal_respects_bounds():
    d = Distribution(kind="truncnormal", mean=0.0, std=1.0, low=-0.5, high=2.0)
    x = ppf(d, np.random.default_rng(2).random(100_000))
    assert x.min() >= -0.5 and x.max() <= 2.0


def test_correlation_is_recovered():
    corr = build_correlation(default_correlation(), KEYS)
    s = sample(DISTS, KEYS, corr, 100_000, seed=3)
    i, j = KEYS.index("revenue_growth"), KEYS.index("exit_multiple")
    # Spearman rank correlation is preserved by monotone marginal transforms.
    from scipy.stats import spearmanr

    rho_s = spearmanr(s["revenue_growth"], s["exit_multiple"]).statistic
    expected = 6 / np.pi * np.arcsin(corr[i, j] / 2)  # Gaussian-copula Pearson -> Spearman
    assert rho_s == pytest.approx(expected, abs=0.01)


def test_non_psd_correlation_is_rejected_with_suggestion():
    spec = CorrelationSpec(variables=["revenue_growth", "ebitda_margin", "wacc"],
                           matrix=[[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]])
    with pytest.raises(InvalidInputError) as exc:
        build_correlation(spec, KEYS)
    assert exc.value.code == "correlation_not_psd"
    suggested = np.array(exc.value.details["suggested_matrix"])
    assert np.linalg.eigvalsh(suggested).min() > -1e-6


def test_default_correlation_is_psd():
    corr = build_correlation(default_correlation(), KEYS)
    assert np.linalg.eigvalsh(corr).min() > 0


def test_same_seed_reproduces_and_different_seed_differs():
    a = simulate(ACME_CONTEXT, ACME_VALUES, DISTS, default_correlation(), _settings())
    b = simulate(ACME_CONTEXT, ACME_VALUES, DISTS, default_correlation(), _settings())
    c = simulate(ACME_CONTEXT, ACME_VALUES, DISTS, default_correlation(), _settings(seed=8))
    np.testing.assert_array_equal(a.price, b.price)
    assert a.result.price.p50 == b.result.price.p50
    assert not np.array_equal(a.price, c.price)


def test_ten_thousand_simulations_under_two_seconds():
    simulate(ACME_CONTEXT, ACME_VALUES, DISTS, default_correlation(), _settings(n_sims=1_000))  # warm-up
    start = time.perf_counter()
    out = simulate(ACME_CONTEXT, ACME_VALUES, DISTS, default_correlation(), _settings())
    assert time.perf_counter() - start < 2.0
    assert out.result.n_sims == 10_000


def test_outputs_are_coherent():
    r = simulate(ACME_CONTEXT, ACME_VALUES, DISTS, default_correlation(), _settings()).result
    p = r.price
    assert p.p5 <= p.p25 <= p.p50 <= p.p75 <= p.p95
    assert sum(b.count for b in p.histogram) + p.outside_histogram == 10_000
    assert 0 <= r.prob_price_above_current <= 1
    assert r.irr is not None and r.prob_irr_above_hurdle is not None and r.prob_loss is not None
    assert len(r.covenant_breach) == 5 and all(0 <= c.any <= 1 for c in r.covenant_breach)
    # Median price should sit near the deterministic Acme value (15.73) given roughly centred inputs.
    assert 13.0 < p.p50 < 18.5


def test_summarize_and_convergence():
    x = np.random.default_rng(0).normal(10, 2, 20_000)
    s = summarize(x)
    assert s.mean == pytest.approx(10, abs=0.05) and s.p50 == pytest.approx(10, abs=0.05)
    pts = convergence(x)
    assert pts[-1].n == 20_000
    assert pts[-1].mean == pytest.approx(x.mean())
    assert pts[-1].upper - pts[-1].lower < pts[0].upper - pts[0].lower  # band narrows


def test_tornado_swings_each_driver_p10_to_p90():
    s = tornado(ACME_CONTEXT, ACME_VALUES, DISTS, _settings())
    assert s.base_price == pytest.approx(15.734972, abs=1e-6)
    assert {i.key for i in s.items} == set(KEYS)
    swings = [i.price_swing for i in s.items]
    assert swings == sorted(swings, reverse=True)
    wacc = next(i for i in s.items if i.key == "wacc")
    assert wacc.low_input == pytest.approx(quantile(DISTS["wacc"], 0.10))
    assert wacc.price_low > s.base_price > wacc.price_high
