"""The ``DataProvider`` interface. All market data enters the app through an implementation of it,
so yfinance can be replaced by a paid API without touching the engine, exports or routes.

Implementations are responsible for mapping their native field names onto the normalised
schemas (see ``app.data.normalize`` for the yfinance mapping) and must never invent values:
anything unavailable is returned as ``None``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.data.normalize import NormalizationReport
from app.schemas.company import CompanyProfile, Financials, MarketData, PricePoint, SearchResult


@dataclass(frozen=True)
class PeerSnapshot:
    """Trailing multiples inputs for one peer, in the peer's own currency (ratios are currency-free)."""

    ticker: str
    name: str
    currency: str | None
    market_cap: float | None
    enterprise_value: float | None
    ebitda: float | None
    revenue: float | None
    trailing_pe: float | None


class DataProvider(Protocol):
    name: str

    def search(self, query: str) -> list[SearchResult]:
        """Return up to ~8 equity matches for a free-text query or partial ticker."""
        ...

    def get_profile(self, ticker: str) -> CompanyProfile:
        """Return company metadata. Raises ``TickerNotFoundError`` for unknown tickers."""
        ...

    def get_financials(self, ticker: str) -> tuple[Financials, NormalizationReport]:
        """Return up to 5 years of normalised annual statements plus notes on any fallbacks used."""
        ...

    def get_price_history(self, ticker: str, period: str = "1y") -> list[PricePoint]:
        """Return daily closes for ``period`` (e.g. '1y'), in the trading currency."""
        ...

    def get_market_data(self, ticker: str) -> MarketData:
        """Return price, shares, market cap, beta, debt and cash, converted to the reporting currency."""
        ...

    def get_peer_candidates(self, ticker: str, profile: CompanyProfile) -> list[str]:
        """Return candidate peer tickers in the same industry, most relevant first."""
        ...

    def get_peer_snapshot(self, ticker: str) -> PeerSnapshot | None:
        """Return trailing multiple inputs for a peer, or ``None`` if the ticker is unusable."""
        ...
