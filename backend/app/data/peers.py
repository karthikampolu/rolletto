"""Curated peer sets for markets where Yahoo's industry endpoint is US-centric.

Yahoo's ``Industry.top_companies`` returns mostly US listings, which makes a poor comps set for an
Indian company. For NSE/BSE listings we therefore use hand-picked large-cap peers per industry.
Users can always add or remove peers in the UI.
"""

from __future__ import annotations

from app.schemas.company import CompanyProfile

INDIA_PEERS: dict[str, tuple[str, ...]] = {
    "information technology services": ("TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS"),
    "oil & gas refining & marketing": ("RELIANCE.NS", "IOC.NS", "BPCL.NS", "HINDPETRO.NS"),
    "oil & gas integrated": ("RELIANCE.NS", "ONGC.NS", "IOC.NS", "BPCL.NS"),
    "household & personal products": ("HINDUNILVR.NS", "DABUR.NS", "GODREJCP.NS", "MARICO.NS", "COLPAL.NS"),
    "packaged foods": ("NESTLEIND.NS", "BRITANNIA.NS", "TATACONSUM.NS", "HINDUNILVR.NS"),
    "auto manufacturers": ("MARUTI.NS", "TATAMOTORS.NS", "M&M.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS", "HEROMOTOCO.NS"),
    "drug manufacturers - specialty & generic": ("SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "LUPIN.NS"),
    "telecom services": ("BHARTIARTL.NS", "IDEA.NS", "TATACOMM.NS"),
    "steel": ("TATASTEEL.NS", "JSWSTEEL.NS", "SAIL.NS", "JINDALSTEL.NS"),
    "building materials": ("ULTRACEMCO.NS", "SHREECEM.NS", "AMBUJACEM.NS", "ACC.NS", "DALBHARAT.NS"),
    "specialty chemicals": ("PIDILITIND.NS", "SRF.NS", "AARTIIND.NS", "DEEPAKNTR.NS"),
    "tobacco": ("ITC.NS", "GODFRYPHLP.NS", "VSTIND.NS"),
    "utilities - independent power producers": ("NTPC.NS", "TATAPOWER.NS", "ADANIPOWER.NS", "JSWENERGY.NS"),
    "utilities - regulated electric": ("POWERGRID.NS", "NTPC.NS", "TATAPOWER.NS"),
    "engineering & construction": ("LT.NS", "IRB.NS", "NCC.NS", "KEC.NS"),
    "luxury goods": ("TITAN.NS", "KALYANKJIL.NS", "SENCO.NS"),
    "specialty retail": ("TRENT.NS", "DMART.NS", "TITAN.NS"),
    "paint": ("ASIANPAINT.NS", "BERGEPAINT.NS", "KANSAINER.NS"),
}


def curated_peers(profile: CompanyProfile) -> list[str]:
    """Return curated peers for Indian listings, or an empty list to defer to the provider."""
    if not profile.ticker.endswith((".NS", ".BO")) or not profile.industry:
        return []
    return list(INDIA_PEERS.get(profile.industry.lower(), ()))
