"""Classify companies whose economics make an unlevered DCF or LBO inappropriate.

For banks, insurers, NBFCs and broker-dealers, debt is raw material rather than financing, so
"unlevered free cash flow" and "EBITDA" are not meaningful; REITs are valued on distributions and
NAV and cannot carry LBO leverage on top of their own. These get a P/B–ROE and dividend-discount
valuation instead. Asset managers and exchanges are fee businesses and stay on the standard path.
"""

from __future__ import annotations

from app.schemas.company import Classification, CompanyProfile

_RULES: tuple[tuple[str, str, str], ...] = (
    ("bank", "bank", "Banks fund themselves with deposits and debt as operating inputs"),
    ("insurance", "insurer", "Insurers' float and reserves make free cash flow ill-defined"),
    ("credit services", "nbfc", "Lenders (NBFCs / credit services) treat debt as raw material"),
    ("mortgage finance", "nbfc", "Mortgage lenders treat debt as raw material"),
    ("reit", "reit", "REITs are valued on distributions and NAV and already run on property-level leverage"),
    ("capital markets", "capital_markets", "Broker-dealers' balance sheets are trading inventory funded with debt"),
)


def classify(profile: CompanyProfile) -> Classification:
    industry = (profile.industry or "").lower()
    sector = (profile.sector or "").lower()
    for keyword, kind, why in _RULES:
        if keyword in industry:
            return Classification(
                kind=kind,  # type: ignore[arg-type]
                is_financial=True,
                reason=f"{profile.industry}: {why}. DCF and LBO are not applied; see the P/B–ROE and dividend-discount view instead.",
            )
    if sector == "real estate" and "reit" in industry:
        return Classification(kind="reit", is_financial=True, reason="REIT: valued on distributions and NAV.")
    return Classification(kind="operating", is_financial=False, reason="Operating company: DCF and LBO apply.")
