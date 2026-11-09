"""yfinance implementation of ``DataProvider`` with caching, retries and timeouts.

yfinance is an unofficial scraper of Yahoo Finance: fields come and go, requests are rate
limited, and some listings (notably Indian small caps) have sparse statements. Everything here
is defensive and anything missing is returned as ``None`` for the data-quality layer to flag.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any, TypeVar

import pandas as pd
import yfinance as yf
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

from app.core.cache import TTLStore
from app.core.config import Settings
from app.core.errors import TickerNotFoundError, UpstreamError
from app.data.normalize import NormalizationReport, RawStatements, normalize_statements
from app.data.peers import curated_peers
from app.data.provider import PeerSnapshot
from app.schemas.company import CompanyProfile, Financials, MarketData, PricePoint, SearchResult

logger = logging.getLogger(__name__)
T = TypeVar("T")

#: Yahoo quotes some exchanges in minor units (pence, cents, agorot).
MINOR_UNITS: dict[str, tuple[str, float]] = {"GBp": ("GBP", 0.01), "GBX": ("GBP", 0.01), "ZAc": ("ZAR", 0.01), "ILA": ("ILS", 0.01)}

EQUITY_QUOTE_TYPES = {"EQUITY"}


def _num(value: Any) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _major_unit(ccy: str | None) -> tuple[str, float]:
    if not ccy:
        return "USD", 1.0
    return MINOR_UNITS.get(ccy, (ccy.upper(), 1.0))


class YFinanceProvider:
    name = "yfinance"

    def __init__(self, settings: Settings, cache: TTLStore) -> None:
        self._settings = settings
        self._cache = cache
        self._pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="yf")

    # ------------------------------------------------------------------ plumbing

    def _call(self, label: str, fn: Callable[[], T]) -> T:
        """Run a yfinance call with a hard timeout and exponential-backoff retries."""

        @retry(
            stop=stop_after_attempt(self._settings.provider_retries),
            wait=wait_exponential(multiplier=0.5, max=4),
            retry=retry_if_not_exception_type(TickerNotFoundError),
            reraise=True,
        )
        def attempt() -> T:
            future = self._pool.submit(fn)
            try:
                return future.result(timeout=self._settings.provider_timeout_s)
            except FutureTimeout as exc:
                raise UpstreamError(f"Timed out fetching {label} from Yahoo Finance.") from exc
            except Exception as exc:  # yfinance raises a zoo of exception types
                # A 404 is definitive: fail fast instead of retrying with backoff.
                if "404" in str(exc) or "Not Found" in str(exc):
                    raise TickerNotFoundError(f"Ticker not found: {label}") from exc
                raise

        try:
            return attempt()
        except (TickerNotFoundError, UpstreamError):
            raise
        except Exception as exc:
            logger.warning("yfinance %s failed: %s", label, exc)
            raise UpstreamError(f"Yahoo Finance is unavailable or rate-limited ({label}). Try again shortly.") from exc

    def _info(self, ticker: str) -> dict[str, Any]:
        def load() -> dict[str, Any]:
            try:
                info = self._call(f"{ticker} info", lambda: yf.Ticker(ticker).info) or {}
            except TickerNotFoundError as exc:
                self._raise_not_found_or_blocked(ticker, f"info call failed: {exc.__cause__ or exc}")
            has_price = any(_num(info.get(k)) for k in ("currentPrice", "regularMarketPrice", "previousClose"))
            if not has_price or not (info.get("longName") or info.get("shortName")):
                self._raise_not_found_or_blocked(ticker, f"info had no price/name (keys: {sorted(info)[:12]})")
            return info

        return self._cache.get_or_set("info", ticker, self._settings.cache_ttl_market_s, load)

    def _has_prices(self, ticker: str) -> bool:
        """True if Yahoo's chart endpoint returns recent prices for ``ticker`` (a lighter, separate API)."""
        try:
            hist = self._pool.submit(lambda: yf.Ticker(ticker).history(period="5d")).result(timeout=self._settings.provider_timeout_s)
            return hist is not None and not hist.empty
        except Exception as exc:  # noqa: BLE001 - any failure here means "no evidence of prices"
            logger.warning("yfinance chart probe for %s failed: %s", ticker, exc)
            return False

    def _raise_not_found_or_blocked(self, ticker: str, reason: str) -> None:
        """An empty quote can mean a bad ticker *or* Yahoo refusing this server. Tell them apart.

        If the ticker (or a known-good reference ticker) has chart prices, the symbol exists or Yahoo is
        reachable, so the empty quote is Yahoo blocking the quote endpoint for this server's IP address.
        """
        logger.warning("Quote for %s unavailable: %s", ticker, reason)
        if self._has_prices(ticker):
            raise UpstreamError(
                "Yahoo Finance is refusing company data to this server right now (common on shared cloud hosts). Try again later.",
                code="upstream_blocked",
                details={"ticker": ticker},
            )
        reachable = self._cache.get_or_set("probe", "AAPL", 600, lambda: self._has_prices("AAPL"))
        if not reachable:
            raise UpstreamError(
                "Yahoo Finance is not responding to this server (it may be rate-limited). Try again later.",
                code="upstream_blocked",
            )
        raise TickerNotFoundError(f"No listed company found for ticker '{ticker}'.", details={"ticker": ticker})

    # ------------------------------------------------------------------ DataProvider

    def search(self, query: str) -> list[SearchResult]:
        q = query.strip()
        if not q:
            return []

        def load() -> list[SearchResult]:
            quotes = self._call(f"search '{q}'", lambda: yf.Search(q, max_results=10, news_count=0, lists_count=0).quotes)
            results = []
            for item in quotes or []:
                if item.get("quoteType") not in EQUITY_QUOTE_TYPES or not item.get("symbol"):
                    continue
                results.append(SearchResult(
                    symbol=item["symbol"],
                    name=item.get("longname") or item.get("shortname") or item["symbol"],
                    exchange=item.get("exchDisp") or item.get("exchange"),
                    quote_type=item.get("quoteType"),
                ))
            return results[:8]

        return self._cache.get_or_set("search", q.lower(), self._settings.cache_ttl_market_s, load)

    def get_profile(self, ticker: str) -> CompanyProfile:
        info = self._info(ticker)
        trading_ccy, _ = _major_unit(info.get("currency"))
        reporting_ccy = (info.get("financialCurrency") or trading_ccy).upper()
        return CompanyProfile(
            ticker=ticker,
            name=info.get("longName") or info.get("shortName") or ticker,
            sector=info.get("sector"),
            industry=info.get("industry"),
            industry_key=info.get("industryKey"),
            sector_key=info.get("sectorKey"),
            country=info.get("country"),
            exchange=info.get("fullExchangeName") or info.get("exchange"),
            website=info.get("website"),
            summary=info.get("longBusinessSummary"),
            quote_type=info.get("quoteType"),
            currency=reporting_ccy,
            trading_currency=trading_ccy,
        )

    def get_financials(self, ticker: str) -> tuple[Financials, NormalizationReport]:
        profile = self.get_profile(ticker)

        def load() -> tuple[Financials, NormalizationReport]:
            def fetch() -> RawStatements:
                t = yf.Ticker(ticker)
                return RawStatements(income=t.income_stmt, balance=t.balance_sheet, cashflow=t.cashflow)

            raw = self._call(f"{ticker} financials", fetch)
            return normalize_statements(raw, profile.currency)

        return self._cache.get_or_set("financials", ticker, self._settings.cache_ttl_financials_s, load)

    def get_price_history(self, ticker: str, period: str = "1y") -> list[PricePoint]:
        info = self._info(ticker)
        _, scale = _major_unit(info.get("currency"))

        def load() -> list[PricePoint]:
            hist: pd.DataFrame = self._call(f"{ticker} history", lambda: yf.Ticker(ticker).history(period=period, auto_adjust=False))
            if hist is None or hist.empty or "Close" not in hist:
                return []
            closes = hist["Close"].dropna()
            return [PricePoint(date=idx.date(), close=float(v) * scale) for idx, v in closes.items()]

        return self._cache.get_or_set("history", f"{ticker}:{period}", self._settings.cache_ttl_market_s, load)

    def _fx(self, from_ccy: str, to_ccy: str) -> float:
        if from_ccy == to_ccy:
            return 1.0

        def load() -> float:
            pair = f"{from_ccy}{to_ccy}=X"
            hist = self._call(f"fx {pair}", lambda: yf.Ticker(pair).history(period="5d"))
            if hist is None or hist.empty:
                raise UpstreamError(f"FX rate {from_ccy}->{to_ccy} unavailable.")
            return float(hist["Close"].dropna().iloc[-1])

        return self._cache.get_or_set("fx", f"{from_ccy}{to_ccy}", self._settings.cache_ttl_market_s, load)

    def get_market_data(self, ticker: str) -> MarketData:
        info = self._info(ticker)
        trading_ccy, scale = _major_unit(info.get("currency"))
        reporting_ccy = (info.get("financialCurrency") or trading_ccy).upper()
        fx = self._fx(trading_ccy, reporting_ccy)

        price_t = next(v for v in (_num(info.get(k)) for k in ("currentPrice", "regularMarketPrice", "previousClose")) if v) * scale
        mcap_t = _num(info.get("marketCap"))
        # Market cap / price gives a share count consistent with the quoted line (handles ADR ratios
        # and multiple share classes); fall back to the reported share count.
        shares = mcap_t / price_t if mcap_t and price_t else _num(info.get("sharesOutstanding")) or 0.0
        if mcap_t is None:
            mcap_t = shares * price_t

        def conv(key: str) -> float | None:
            v = _num(info.get(key))
            return v * scale * fx if v is not None else None

        debt = _num(info.get("totalDebt"))
        cash = _num(info.get("totalCash"))
        market_cap = mcap_t * fx
        return MarketData(
            currency=reporting_ccy,
            price=price_t * fx,
            shares_outstanding=shares,
            market_cap=market_cap,
            beta=_num(info.get("beta")),
            total_debt=debt,
            cash=cash,
            enterprise_value=market_cap + (debt or 0.0) - (cash or 0.0),
            fifty_two_week_low=conv("fiftyTwoWeekLow"),
            fifty_two_week_high=conv("fiftyTwoWeekHigh"),
            dividend_per_share=conv("dividendRate"),
            book_value_per_share=_num(info.get("bookValue")) if fx == 1.0 else None,
            return_on_equity=_num(info.get("returnOnEquity")),
            trailing_eps=conv("trailingEps"),
            fx_rate=fx,
            trading_currency=trading_ccy,
            price_in_trading_currency=price_t,
        )

    def get_peer_candidates(self, ticker: str, profile: CompanyProfile) -> list[str]:
        """Curated peers for Indian listings; otherwise Yahoo's industry leaders followed by sector leaders.

        Sector leaders are included because Yahoo's industry lists can be dominated by much smaller
        companies (e.g. "consumer electronics" for Apple); the service ranks candidates by size.
        """
        curated = curated_peers(profile)
        if curated:
            return [p for p in curated if p != ticker]
        candidates: list[str] = []
        for kind, key in (("industry", profile.industry_key), ("sector", profile.sector_key)):
            if key:
                candidates += self._leaders(kind, key)
        return [p for p in dict.fromkeys(candidates) if p != ticker]

    def _leaders(self, kind: str, key: str) -> list[str]:
        def load() -> list[str]:
            def fetch() -> list[str]:
                top = (yf.Industry(key) if kind == "industry" else yf.Sector(key)).top_companies
                return [] if top is None or top.empty else [str(s) for s in top.index[:12]]

            try:
                return self._call(f"{kind} {key}", fetch)
            except UpstreamError:
                return []

        return self._cache.get_or_set("peers", f"{kind}:{key}", self._settings.cache_ttl_financials_s, load)

    def get_peer_snapshot(self, ticker: str) -> PeerSnapshot | None:
        try:
            info = self._info(ticker)
        except (TickerNotFoundError, UpstreamError):
            return None
        return PeerSnapshot(
            ticker=ticker,
            name=info.get("shortName") or info.get("longName") or ticker,
            currency=info.get("financialCurrency") or info.get("currency"),
            market_cap=_num(info.get("marketCap")),
            enterprise_value=_num(info.get("enterpriseValue")),
            ebitda=_num(info.get("ebitda")),
            revenue=_num(info.get("totalRevenue")),
            trailing_pe=_num(info.get("trailingPE")),
        )
