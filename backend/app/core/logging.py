"""Logging setup and a request-logging middleware."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("rolletto.request")


def configure_logging(level: str) -> None:
    logging.basicConfig(level=level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # yfinance logs every missing field at WARNING; we surface those through data_quality instead.
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Logs method, path, status and latency for every request, tagged with a request id."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["x-request-id"] = request_id
        logger.info("%s %s %s %.0fms id=%s", request.method, request.url.path, response.status_code, elapsed_ms, request_id)
        return response
