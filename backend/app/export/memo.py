"""One-page PDF valuation memo (ReportLab). Clearly labelled educational, not investment advice."""

from __future__ import annotations

import datetime as dt
import os
from io import BytesIO

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.currency import currency_symbol, format_money
from app.schemas.valuation import ValuationResponse
from app.services.company import CompanyBundle

INK = colors.HexColor("#0F1B2D")
MUTED = colors.HexColor("#5B6475")
ACCENT = colors.HexColor("#2F6BFF")
RULE = colors.HexColor("#D9DEE7")
BAR = {"market": colors.HexColor("#94A3B8"), "comps": colors.HexColor("#7C9CF5"), "dcf": colors.HexColor("#2F6BFF"), "lbo": colors.HexColor("#14B8A6")}

_FONT_CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]


def _register_fonts() -> tuple[str, str, bool]:
    """Register a Unicode TTF so symbols like ₹ render; fall back to Helvetica (no ₹ glyph)."""
    for regular, bold in _FONT_CANDIDATES:
        if os.path.exists(regular) and os.path.exists(bold):
            try:
                pdfmetrics.registerFont(TTFont("MemoSans", regular))
                pdfmetrics.registerFont(TTFont("MemoSans-Bold", bold))
                face = pdfmetrics.getFont("MemoSans").face
                has_rupee = 0x20B9 in getattr(face, "charToGlyph", {})
                return "MemoSans", "MemoSans-Bold", has_rupee
            except Exception:  # noqa: BLE001 - a broken font file just means trying the next one
                continue
    return "Helvetica", "Helvetica-Bold", False


def build_memo(resp: ValuationResponse, bundle: CompanyBundle) -> bytes:
    font, bold, unicode_ok = _register_fonts()
    ccy = resp.currency
    indian = ccy == "INR"

    def sym_ok(text: str) -> str:
        return text if unicode_ok or ccy != "INR" else text.replace("₹", "INR ")

    def money(v: float) -> str:
        return sym_ok(format_money(v, ccy, indian=indian))

    def price(v: float | None) -> str:
        return "n/a" if v is None else sym_ok(f"{currency_symbol(ccy)}{v:,.2f}")

    st = {
        "title": ParagraphStyle("t", fontName=bold, fontSize=16, leading=19, textColor=INK),
        "sub": ParagraphStyle("s", fontName=font, fontSize=8.5, leading=11, textColor=MUTED),
        "h": ParagraphStyle("h", fontName=bold, fontSize=10, leading=13, textColor=INK, spaceBefore=5, spaceAfter=2),
        "body": ParagraphStyle("b", fontName=font, fontSize=8.3, leading=11, textColor=INK),
        "warn": ParagraphStyle("w", fontName=bold, fontSize=7.8, leading=10, textColor=colors.HexColor("#B42318")),
    }
    p, mc, dcf, lbo = bundle.profile, resp.monte_carlo, resp.dcf, resp.lbo
    story = [
        Paragraph(f"{p.name} ({resp.ticker}) — Valuation memo", st["title"]),
        Paragraph(f"{p.sector or 'Sector n/a'} · {p.industry or 'Industry n/a'} · {p.country or ''} · Prepared "
                  f"{dt.date.today():%d %b %Y} with Rolletto · Figures in {ccy}", st["sub"]),
        Spacer(1, 3),
        Paragraph("EDUCATIONAL PURPOSES ONLY — NOT INVESTMENT ADVICE. Model output depends entirely on the stated assumptions "
                  "and on unofficial Yahoo Finance data.", st["warn"]),
        Paragraph("Company overview", st["h"]),
        Paragraph(_truncate(p.summary or "No business description available.", 520), st["body"]),
        Paragraph("Valuation summary", st["h"]),
    ]
    lbo_ok = lbo.feasible and mc.irr is not None
    rows = [
        ["Current price", price(resp.current_price), "Market cap", money(bundle.market.market_cap)],
        ["DCF (perpetuity)", f"{price(dcf.price_perpetuity)} ({dcf.upside_perpetuity:+.0%})",
         "DCF (exit multiple)", f"{price(dcf.price_exit)} ({dcf.upside_exit:+.0%})"],
        ["MC P10 / P50 / P90", f"{price(mc.price.p10)} / {price(mc.price.p50)} / {price(mc.price.p90)}",
         "P(value > price)", f"{mc.prob_price_above_current:.0%}"],
        ["WACC / terminal growth", f"{dcf.wacc:.1%} / {dcf.terminal_growth:.1%}", "Exit EV/EBITDA", f"{dcf.exit_multiple:.1f}x"],
        ["LBO IRR / MOIC (base)", f"{lbo.irr:.1%} / {lbo.moic:.2f}x" if lbo_ok else "n/a", f"P(IRR ≥ {mc.hurdle_irr:.0%})",
         f"{mc.prob_irr_above_hurdle:.0%}" if lbo_ok and mc.prob_irr_above_hurdle is not None else "n/a"],
    ]
    t = Table(rows, colWidths=[38 * mm, 52 * mm, 34 * mm, 52 * mm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), font, 8), ("FONT", (0, 0), (0, -1), bold, 8), ("FONT", (2, 0), (2, -1), bold, 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    story += [t, Paragraph("Football field", st["h"]), _football(resp, font, bold, sym_ok), Paragraph("Key risks", st["h"])]
    for r in _risks(resp, bundle):
        story.append(Paragraph(f"• {r}", st["body"]))
    story += [Paragraph("How to read this", st["h"]), Paragraph(_framing(resp), st["body"]), Spacer(1, 4),
              Paragraph("This memo was generated automatically for educational purposes. It is not a recommendation to buy or sell any "
                        "security, and it has not been reviewed by a licensed adviser.", st["sub"])]
    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=13 * mm, bottomMargin=12 * mm,
                      title=f"Rolletto memo — {resp.ticker}", author="Rolletto").build(story)
    return buf.getvalue()


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: text.rfind(" ", 0, limit)] + "…"


def _football(resp: ValuationResponse, font: str, bold: str, sym_ok) -> Drawing:  # noqa: ANN001
    bars = resp.football_field.bars
    width, label_w, row_h = 178 * mm, 58 * mm, 13
    height = row_h * len(bars) + 22
    d = Drawing(width, height)
    values = [x for b in bars for x in (b.low, b.high)] + [resp.current_price]
    lo, hi = min(values), max(values)
    pad = (hi - lo) * 0.08 or abs(hi) * 0.1 or 1
    lo, hi = lo - pad, hi + pad
    plot_w = width - label_w - 8

    def x(v: float) -> float:
        return label_w + (v - lo) / (hi - lo) * plot_w

    sym = currency_symbol(resp.currency)
    for i, b in enumerate(bars):
        y = height - 14 - (i + 1) * row_h
        d.add(String(0, y + 3, b.label, fontName=font, fontSize=7.2, fillColor=INK))
        d.add(Rect(x(b.low), y + 1, max(x(b.high) - x(b.low), 1.5), row_h - 4, fillColor=BAR[b.kind], strokeColor=None))
        d.add(String(x(b.low) - 2, y + 3, sym_ok(f"{sym}{b.low:,.0f}"), fontName=font, fontSize=6, fillColor=MUTED, textAnchor="end"))
        d.add(String(x(b.high) + 2, y + 3, sym_ok(f"{sym}{b.high:,.0f}"), fontName=font, fontSize=6, fillColor=MUTED))
    cx = x(resp.current_price)
    d.add(Line(cx, 6, cx, height - 12, strokeColor=colors.HexColor("#E11D48"), strokeWidth=0.9, strokeDashArray=[2, 2]))
    d.add(String(cx, height - 10, sym_ok(f"Current {sym}{resp.current_price:,.2f}"), fontName=bold, fontSize=6.8,
                 fillColor=colors.HexColor("#E11D48"), textAnchor="middle"))
    return d


def _risks(resp: ValuationResponse, b: CompanyBundle) -> list[str]:
    out: list[str] = []
    dcf, mc = resp.dcf, resp.monte_carlo
    if dcf.tv_share_perpetuity > 0.75:
        out.append(f"Terminal value is {dcf.tv_share_perpetuity:.0%} of EV: the valuation leans heavily on long-run assumptions.")
    top = resp.sensitivity.items[:2]
    if top:
        out.append("Most sensitive drivers: " + ", ".join(f"{t.label} (P10–P90 swing of {t.price_swing:,.2f} per share)" for t in top) + ".")
    spread = (mc.price.p90 - mc.price.p10) / mc.price.p50 if mc.price.p50 > 0 else 0
    if spread > 0.6:
        out.append(f"Wide outcome range: P10–P90 spans {spread:.0%} of the median value.")
    if resp.lbo.feasible and mc.covenant_breach:
        worst = max(mc.covenant_breach, key=lambda c: c.any)
        if worst.any > 0.1:
            out.append(f"Covenant breach probability peaks at {worst.any:.0%} in year {worst.year} of the LBO.")
    if b.market.fx_rate != 1.0:
        out.append(f"Currency: financials in {b.market.currency} but shares trade in {b.market.trading_currency}; FX moves affect returns.")
    for w in b.quality.warnings:
        if w.severity in ("warning", "error"):
            out.append(f"Data: {w.message}")
    return out[:6] or ["No model-specific red flags were detected; generic market, execution and data risks still apply."]


def _framing(resp: ValuationResponse) -> str:
    p = resp.monte_carlo.prob_price_above_current
    if p >= 0.65:
        view = "the current price sits in the lower part of the simulated value distribution — the stock screens as potentially undervalued"
    elif p <= 0.35:
        view = "the current price sits in the upper part of the simulated value distribution — the stock screens as potentially overvalued"
    else:
        view = "the current price is within the central range of simulated values — the stock screens as roughly fairly valued given model uncertainty"
    return (f"In {p:.0%} of {resp.monte_carlo.n_sims:,} simulations the intrinsic value exceeded the current price, so {view}. "
            "Treat this as a starting point for diligence: test the drivers in the tornado chart, compare against the trading comps, "
            "and form your own view of the business. Results change with every assumption.")
