"""Assumption, distribution and correlation schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

DistKind = Literal["normal", "truncnormal", "triangular", "uniform", "lognormal"]
Unit = Literal["pct", "x", "num", "years"]


class Distribution(BaseModel):
    """A univariate distribution for one stochastic driver.

    Parameters used per kind:
      * ``normal``: mean, std
      * ``truncnormal``: mean, std, low, high (bounds of the truncated support)
      * ``triangular``: low, mode, high
      * ``uniform``: low, high
      * ``lognormal``: mean, std of the variable itself (not of its log); requires mean > 0
    """

    kind: DistKind
    mean: float | None = None
    std: float | None = None
    low: float | None = None
    mode: float | None = None
    high: float | None = None

    @model_validator(mode="after")
    def _check_params(self) -> Distribution:
        def need(*names: str) -> None:
            missing = [n for n in names if getattr(self, n) is None]
            if missing:
                raise ValueError(f"{self.kind} distribution requires {', '.join(missing)}")

        if self.kind in ("normal", "truncnormal", "lognormal"):
            need("mean", "std")
            if self.std is not None and self.std <= 0:
                raise ValueError("std must be positive")
        if self.kind == "truncnormal":
            need("low", "high")
        if self.kind == "triangular":
            need("low", "mode", "high")
            if not (self.low <= self.mode <= self.high):  # type: ignore[operator]
                raise ValueError("triangular requires low <= mode <= high")
        if self.kind == "uniform":
            need("low", "high")
        if self.kind in ("truncnormal", "triangular", "uniform") and self.low >= self.high:  # type: ignore[operator]
            raise ValueError("low must be below high")
        if self.kind == "lognormal" and self.mean is not None and self.mean <= 0:
            raise ValueError("lognormal mean must be positive")
        return self


class Assumption(BaseModel):
    key: str
    label: str
    group: str
    value: float
    unit: Unit
    min: float
    max: float
    step: float
    source: str = Field(description="Where the default came from, e.g. '3y average' or 'Country default'")
    rationale: str
    description: str = Field(description="Plain-language explanation shown in the UI tooltip")
    stochastic: bool = False
    distribution: Distribution | None = None


class CorrelationSpec(BaseModel):
    """Correlation matrix between stochastic drivers, ordered as ``variables``."""

    variables: list[str]
    matrix: list[list[float]]

    @model_validator(mode="after")
    def _check_shape(self) -> CorrelationSpec:
        n = len(self.variables)
        if len(set(self.variables)) != n:
            raise ValueError("correlation variables must be unique")
        if len(self.matrix) != n or any(len(row) != n for row in self.matrix):
            raise ValueError("correlation matrix must be square and match the variable list")
        for i in range(n):
            if abs(self.matrix[i][i] - 1.0) > 1e-9:
                raise ValueError("correlation matrix diagonal must be 1")
            for j in range(n):
                if abs(self.matrix[i][j] - self.matrix[j][i]) > 1e-9:
                    raise ValueError("correlation matrix must be symmetric")
                if not -1.0 <= self.matrix[i][j] <= 1.0:
                    raise ValueError("correlations must lie in [-1, 1]")
        return self


class AssumptionSet(BaseModel):
    items: list[Assumption]
    correlation: CorrelationSpec
