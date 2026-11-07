"""Schemas shared across endpoints."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["info", "warning", "error"]


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class QualityWarning(BaseModel):
    code: str
    severity: Severity
    message: str


class DataQuality(BaseModel):
    """Summary of data problems found while cleaning a company's financials."""

    grade: Literal["good", "fair", "poor"]
    years_available: int
    usable_for_dcf: bool = Field(description="False when the data is too broken to project cash flows from")
    warnings: list[QualityWarning]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    provider: str
