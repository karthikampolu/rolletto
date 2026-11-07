"""HTTP routes. Handlers are sync so FastAPI runs the blocking provider calls in its threadpool."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query, Request, Response

from app import __version__
from app.api.deps import get_service, limiter
from app.core.config import get_settings
from app.export.excel import build_workbook
from app.export.memo import build_memo
from app.schemas.common import ErrorResponse, HealthResponse
from app.schemas.company import CompanyResponse, SearchResult
from app.schemas.valuation import ValuationRequest, ValuationResponse
from app.services.company import CompanyService

settings = get_settings()
router = APIRouter(prefix="/api", responses={422: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})


@router.get("/health", response_model=HealthResponse, tags=["meta"])
def health(service: CompanyService = Depends(get_service)) -> HealthResponse:
    return HealthResponse(status="ok", version=__version__, provider=service.provider.name)


@router.get("/search", response_model=list[SearchResult], tags=["company"])
@limiter.limit(settings.rate_limit_default)
def search(request: Request, q: str = Query(min_length=1, max_length=60), service: CompanyService = Depends(get_service)) -> list[SearchResult]:
    return service.provider.search(q)


@router.get("/company/{ticker}", response_model=CompanyResponse, responses={404: {"model": ErrorResponse}}, tags=["company"])
@limiter.limit(settings.rate_limit_default)
def company(request: Request, ticker: str, service: CompanyService = Depends(get_service)) -> CompanyResponse:
    return service.company(ticker)


@router.post("/valuation", response_model=ValuationResponse, responses={404: {"model": ErrorResponse}}, tags=["valuation"])
@limiter.limit(settings.rate_limit_valuation)
def valuation(request: Request, body: ValuationRequest, service: CompanyService = Depends(get_service)) -> ValuationResponse:
    resp, _ = service.valuation(body)
    return resp


def _filename(ticker: str, ext: str) -> str:
    return f"Rolletto_{re.sub(r'[^A-Za-z0-9]+', '_', ticker)}.{ext}"


@router.post("/export/excel", tags=["export"], response_class=Response,
             responses={200: {"content": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}}}})
@limiter.limit(settings.rate_limit_export)
def export_excel(request: Request, body: ValuationRequest, service: CompanyService = Depends(get_service)) -> Response:
    resp, bundle = service.valuation(body)
    content = build_workbook(resp, bundle)
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{_filename(resp.ticker, "xlsx")}"'})


@router.post("/export/memo", tags=["export"], response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
@limiter.limit(settings.rate_limit_export)
def export_memo(request: Request, body: ValuationRequest, service: CompanyService = Depends(get_service)) -> Response:
    resp, bundle = service.valuation(body)
    content = build_memo(resp, bundle)
    return Response(content, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_filename(resp.ticker, "pdf")}"'})
