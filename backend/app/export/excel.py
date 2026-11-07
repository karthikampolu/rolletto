"""Excel workbook export.

Formatting follows banking convention: blue font = hard-coded input, black = formula, grey italic =
value pasted from the Rolletto engine. The DCF tab is fully formula-driven off the Assumptions tab,
so changing a blue input re-prices the company inside Excel; a check row compares it to the engine.
Monetary amounts are in millions of the reporting currency; per-share values are in units.
"""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.engine.assumptions import SPECS
from app.schemas.valuation import DistributionStats, ValuationResponse
from app.services.company import CompanyBundle

M = 1e6
NAVY = "0F1B2D"
BLUE = Font(name="Calibri", color="0000FF")
BLACK = Font(name="Calibri", color="000000")
ENGINE = Font(name="Calibri", color="7F7F7F", italic=True)
BOLD = Font(name="Calibri", bold=True)
TITLE = Font(name="Calibri", bold=True, size=14, color=NAVY)
HEADER_FONT = Font(name="Calibri", bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor=NAVY)
INPUT_FILL = PatternFill("solid", fgColor="FFF8E1")
TOP = Border(top=Side(style="thin", color="000000"))

FMT_MONEY = '#,##0.0;(#,##0.0);"–"'
FMT_PRICE = '#,##0.00;(#,##0.00)'
FMT_PCT = '0.0%;(0.0%)'
FMT_X = '0.0"x"'
FMT_FACTOR = '0.0000'
FMT_INT = '0'
UNIT_FMT = {"pct": FMT_PCT, "x": '0.00"x"', "num": '0.00', "years": FMT_INT}


def _header(ws: Worksheet, row: int, values: list[str], start_col: int = 1) -> None:
    for i, v in enumerate(values):
        c = ws.cell(row=row, column=start_col + i, value=v)
        c.font, c.fill = HEADER_FONT, HEADER_FILL
        c.alignment = Alignment(horizontal="center" if i else "left")


def _title(ws: Worksheet, text: str, sub: str) -> None:
    ws["A1"] = text
    ws["A1"].font = TITLE
    ws["A2"] = sub
    ws["A2"].font = Font(italic=True, color="595959")


def _widths(ws: Worksheet, widths: dict[str, float]) -> None:
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def _put(ws: Worksheet, ref: str, value: object, fmt: str | None = None, font: Font = BLACK) -> None:
    ws[ref] = value
    ws[ref].font = font
    if fmt:
        ws[ref].number_format = fmt


def build_workbook(resp: ValuationResponse, bundle: CompanyBundle) -> bytes:
    wb = Workbook()
    ccy = resp.currency
    unit_note = f"{ccy} millions unless stated; per-share values in {ccy}. Blue = input, black = formula, grey italic = engine output."
    refs = _assumptions_sheet(wb.active, resp, bundle, unit_note)
    _summary_sheet(wb.create_sheet("Summary", 0), resp, bundle, unit_note)
    _dcf_sheet(wb.create_sheet("DCF"), resp, refs, unit_note)
    _lbo_sheet(wb.create_sheet("LBO"), resp, unit_note)
    _mc_sheet(wb.create_sheet("Monte Carlo"), resp)
    _comps_sheet(wb.create_sheet("Comps"), resp)
    _historicals_sheet(wb.create_sheet("Historicals"), bundle)
    wb.active = 0
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _summary_sheet(ws: Worksheet, r: ValuationResponse, b: CompanyBundle, note: str) -> None:
    _title(ws, f"{b.profile.name} ({r.ticker}) — Rolletto valuation summary", note)
    mc, dcf, lbo = r.monte_carlo, r.dcf, r.lbo
    rows: list[tuple[str, object, str]] = [
        ("Current share price", r.current_price, FMT_PRICE),
        ("Market capitalisation", b.market.market_cap / M, FMT_MONEY),
        ("DCF price — perpetuity growth", dcf.price_perpetuity, FMT_PRICE),
        ("DCF price — exit multiple", dcf.price_exit, FMT_PRICE),
        ("Monte Carlo P10 price", mc.price.p10, FMT_PRICE),
        ("Monte Carlo median price", mc.price.p50, FMT_PRICE),
        ("Monte Carlo P90 price", mc.price.p90, FMT_PRICE),
        ("P(intrinsic value > current price)", mc.prob_price_above_current, FMT_PCT),
        ("LBO base-case IRR", lbo.irr if lbo.feasible else "n/a", FMT_PCT),
        ("LBO base-case MOIC", lbo.moic if lbo.feasible else "n/a", '0.00"x"'),
        (f"P(IRR ≥ {mc.hurdle_irr:.0%} hurdle)", mc.prob_irr_above_hurdle if mc.prob_irr_above_hurdle is not None else "n/a", FMT_PCT),
        ("P(sponsor loses money)", mc.prob_loss if mc.prob_loss is not None else "n/a", FMT_PCT),
        ("Simulations / seed", f"{mc.n_sims:,} / {mc.seed}", ""),
        ("Generated (UTC)", r.generated_at.strftime("%Y-%m-%d %H:%M"), ""),
    ]
    _header(ws, 4, ["Metric", "Value"])
    for i, (label, value, fmt) in enumerate(rows, start=5):
        ws.cell(row=i, column=1, value=label)
        c = ws.cell(row=i, column=2, value=value)
        c.font = ENGINE
        if fmt and not isinstance(value, str):
            c.number_format = fmt
    last = 5 + len(rows) + 1
    ws.cell(row=last, column=1, value="Educational purposes only. Not investment advice.").font = Font(bold=True, color="C00000")
    ws.freeze_panes = "A5"
    _widths(ws, {"A": 42, "B": 20})


def _assumptions_sheet(ws: Worksheet, r: ValuationResponse, b: CompanyBundle, note: str) -> dict[str, str]:
    """Write inputs; return a map of key -> absolute cell reference for formulas."""
    ws.title = "Assumptions"
    _title(ws, "Assumptions", note)
    _header(ws, 4, ["Input", "Value", "Unit", "Group"])
    refs: dict[str, str] = {}
    ctx_rows = [
        ("revenue0", f"LTM revenue (FY{b.financials.years[-1].fiscal_year})", b.financials.years[-1].revenue / M, FMT_MONEY, "Company"),
        ("net_debt", "Net debt", r.dcf.net_debt / M, FMT_MONEY, "Company"),
        ("minority", "Minority interest", r.dcf.minority_interest / M, FMT_MONEY, "Company"),
        ("non_op", "Non-operating assets", r.dcf.non_operating_assets / M, FMT_MONEY, "Company"),
        ("shares", "Shares outstanding (millions)", b.market.shares_outstanding / M, '#,##0.00', "Company"),
        ("price", "Current share price", r.current_price, FMT_PRICE, "Company"),
        ("mid_year", "Mid-year convention (1 = on)", 1 if r.settings.mid_year else 0, FMT_INT, "Settings"),
    ]
    row = 5
    for key, label, value, fmt, group in ctx_rows:
        ws.cell(row=row, column=1, value=label)
        c = ws.cell(row=row, column=2, value=value)
        c.font, c.fill, c.number_format = BLUE, INPUT_FILL, fmt
        ws.cell(row=row, column=4, value=group)
        refs[key] = f"Assumptions!$B${row}"
        row += 1
    for key, spec in SPECS.items():
        value = r.assumptions_used[key]
        ws.cell(row=row, column=1, value=spec.label)
        c = ws.cell(row=row, column=2, value=value)
        c.font, c.fill, c.number_format = BLUE, INPUT_FILL, UNIT_FMT[spec.unit]
        ws.cell(row=row, column=3, value={"pct": "%", "x": "x", "num": "", "years": "years"}[spec.unit])
        ws.cell(row=row, column=4, value=spec.group)
        refs[key] = f"Assumptions!$B${row}"
        row += 1
    ws.freeze_panes = "A5"
    _widths(ws, {"A": 38, "B": 16, "C": 8, "D": 22})
    return refs


def _dcf_sheet(ws: Worksheet, r: ValuationResponse, a: dict[str, str], note: str) -> None:
    _title(ws, "Discounted cash flow (live formulas)", note)
    n = len(r.dcf.years)
    cols = [get_column_letter(3 + i) for i in range(n)]  # C.. for years 1..n; B = year 0
    _header(ws, 4, ["", "LTM"] + [f"Year {i + 1}" for i in range(n)])
    labels = ["Year", "Revenue growth", "Revenue", "EBITDA", "D&A", "EBIT", "Taxes", "NOPAT", "Capex", "Δ NWC", "Unlevered FCF",
              "Discount period", "Discount factor", "PV of UFCF"]
    for i, lab in enumerate(labels):
        ws.cell(row=5 + i, column=1, value=lab).font = BOLD if lab in ("Revenue", "Unlevered FCF") else BLACK
    _put(ws, "B5", 0, FMT_INT)
    _put(ws, "B7", f"={a['revenue0']}", FMT_MONEY)
    N = a["projection_years"]
    for i, c in enumerate(cols):
        p = "B" if i == 0 else cols[i - 1]
        g1, tg, cx1 = a["revenue_growth"], a["terminal_growth"], a["capex_pct_revenue"]
        formulas = {
            5: (f"={p}5+1", FMT_INT),
            6: (f"={g1}+({tg}-{g1})*({c}5-1)/{N}", FMT_PCT),
            7: (f"={p}7*(1+{c}6)", FMT_MONEY),
            8: (f"={c}7*{a['ebitda_margin']}", FMT_MONEY),
            9: (f"={c}7*{a['da_pct_revenue']}", FMT_MONEY),
            10: (f"={c}8-{c}9", FMT_MONEY),
            11: (f"=MAX({c}10,0)*{a['tax_rate']}", FMT_MONEY),
            12: (f"={c}10-{c}11", FMT_MONEY),
            13: (f"={c}7*({cx1}+({a['terminal_capex_to_da']}*{a['da_pct_revenue']}-{cx1})*({c}5-1)/MAX({N}-1,1))", FMT_MONEY),
            14: (f"={a['nwc_pct_revenue']}*({c}7-{p}7)", FMT_MONEY),
            15: (f"={c}12+{c}9-{c}13-{c}14", FMT_MONEY),
            16: (f"={c}5-0.5*{a['mid_year']}", '0.0'),
            17: (f"=1/(1+{a['wacc']})^{c}16", FMT_FACTOR),
            18: (f"={c}15*{c}17", FMT_MONEY),
        }
        for row, (f, fmt) in formulas.items():
            _put(ws, f"{c}{row}", f, fmt)
    for c in ["B"] + cols:
        ws[f"{c}15"].border = TOP
    last = cols[-1]
    w, g, mult = a["wacc"], a["terminal_growth"], a["exit_multiple"]
    rows = [
        ("Sum of PV of UFCF", f"=SUM(C18:{last}18)", FMT_MONEY, f"=SUM(C18:{last}18)", FMT_MONEY),
        ("Terminal value", f"={last}15*(1+{g})/({w}-{g})", FMT_MONEY, f"={mult}*{last}8", FMT_MONEY),
        ("PV of terminal value", f"=B22/(1+{w})^({N}-0.5*{a['mid_year']})", FMT_MONEY, f"=C22/(1+{w})^{N}", FMT_MONEY),
        ("Enterprise value", "=B21+B23", FMT_MONEY, "=C21+C23", FMT_MONEY),
        ("Less: net debt", f"=-{a['net_debt']}", FMT_MONEY, f"=-{a['net_debt']}", FMT_MONEY),
        ("Less: minority interest", f"=-{a['minority']}", FMT_MONEY, f"=-{a['minority']}", FMT_MONEY),
        ("Plus: non-operating assets", f"={a['non_op']}", FMT_MONEY, f"={a['non_op']}", FMT_MONEY),
        ("Equity value", "=SUM(B24:B27)", FMT_MONEY, "=SUM(C24:C27)", FMT_MONEY),
        ("Implied share price", f"=B28/{a['shares']}", FMT_PRICE, f"=C28/{a['shares']}", FMT_PRICE),
        ("Upside / (downside)", f"=B29/{a['price']}-1", FMT_PCT, f"=C29/{a['price']}-1", FMT_PCT),
        ("TV as % of EV", "=B23/B24", FMT_PCT, "=C23/C24", FMT_PCT),
    ]
    _header(ws, 20, ["Valuation", "Perpetuity growth", "Exit multiple"])
    for i, (lab, f1, fmt1, f2, fmt2) in enumerate(rows, start=21):
        ws.cell(row=i, column=1, value=lab).font = BOLD if lab in ("Enterprise value", "Equity value", "Implied share price") else BLACK
        _put(ws, f"B{i}", f1, fmt1)
        _put(ws, f"C{i}", f2, fmt2)
    chk = 21 + len(rows) + 1
    ws.cell(row=chk, column=1, value="Engine share price (check)")
    _put(ws, f"B{chk}", r.dcf.price_perpetuity, FMT_PRICE, ENGINE)
    _put(ws, f"C{chk}", r.dcf.price_exit, FMT_PRICE, ENGINE)
    ws.cell(row=chk + 1, column=1, value="Difference (should be ~0)")
    _put(ws, f"B{chk + 1}", f"=B29-B{chk}", FMT_PRICE)
    _put(ws, f"C{chk + 1}", f"=C29-C{chk}", FMT_PRICE)
    ws.freeze_panes = "B5"
    _widths(ws, {"A": 30, "B": 18, **{c: 14 for c in cols}})


def _lbo_sheet(ws: Worksheet, r: ValuationResponse, note: str) -> None:
    lbo = r.lbo
    _title(ws, "Leveraged buyout (base case)", note)
    if not lbo.feasible:
        ws["A4"] = f"LBO not feasible: {lbo.infeasible_reason}"
        return
    _header(ws, 4, ["Uses", "Amount", "% total", "x EBITDA"])
    row = 5
    for item in lbo.uses:
        ws.cell(row=row, column=1, value=item.label)
        _put(ws, f"B{row}", item.amount / M, FMT_MONEY, ENGINE)
        _put(ws, f"C{row}", item.pct, FMT_PCT, ENGINE)
        _put(ws, f"D{row}", item.ebitda_multiple, FMT_X, ENGINE)
        row += 1
    ws.cell(row=row, column=1, value="Total uses").font = BOLD
    _put(ws, f"B{row}", f"=SUM(B5:B{row - 1})", FMT_MONEY)
    _header(ws, 4, ["Sources", "Amount", "% total", "x EBITDA"], start_col=6)
    srow = 5
    for item in lbo.sources:
        ws.cell(row=srow, column=6, value=item.label)
        _put(ws, f"G{srow}", item.amount / M, FMT_MONEY, ENGINE)
        _put(ws, f"H{srow}", item.pct, FMT_PCT, ENGINE)
        _put(ws, f"I{srow}", item.ebitda_multiple, FMT_X, ENGINE)
        srow += 1
    ws.cell(row=srow, column=6, value="Total sources").font = BOLD
    _put(ws, f"G{srow}", f"=SUM(G5:G{srow - 1})", FMT_MONEY)

    start = max(row, srow) + 2
    years = lbo.schedule
    _header(ws, start, ["Debt schedule"] + [f"Year {y.year}" for y in years])
    fields = [
        ("Revenue", "revenue", FMT_MONEY), ("EBITDA", "ebitda", FMT_MONEY), ("Senior interest", "interest_senior", FMT_MONEY),
        ("Subordinated interest", "interest_sub", FMT_MONEY), ("Revolver interest", "interest_revolver", FMT_MONEY), ("Taxes", "taxes", FMT_MONEY),
        ("Capex", "capex", FMT_MONEY), ("Δ NWC", "delta_nwc", FMT_MONEY), ("Levered FCF", "fcf_before_debt", FMT_MONEY),
        ("Mandatory amortisation", "mandatory_amortization", FMT_MONEY), ("Revolver draw / (repay)", None, FMT_MONEY),
        ("Cash sweep", "cash_sweep", FMT_MONEY), ("Senior term loan (end)", "senior_end", FMT_MONEY), ("Subordinated notes (end)", "sub_end", FMT_MONEY),
        ("Revolver (end)", "revolver_end", FMT_MONEY), ("Cash (end)", "cash_end", FMT_MONEY), ("Net debt", "net_debt", FMT_MONEY),
        ("Net debt / EBITDA", "net_leverage", '0.00"x"'), ("EBITDA / interest", "interest_coverage", '0.00"x"'),
        ("Covenant breach", None, ""),
    ]
    for i, (label, attr, fmt) in enumerate(fields, start=start + 1):
        ws.cell(row=i, column=1, value=label).font = BOLD if label in ("EBITDA", "Levered FCF", "Net debt") else BLACK
        for j, y in enumerate(years):
            if label == "Revolver draw / (repay)":
                value: object = (y.revolver_draw - y.revolver_repay) / M
            elif label == "Covenant breach":
                value = "Leverage" if y.leverage_breach else ("Coverage" if y.coverage_breach else "—")
            else:
                raw = getattr(y, attr)
                value = raw if fmt == '0.00"x"' else raw / M
            c = ws.cell(row=i, column=2 + j, value=value)
            c.font = ENGINE
            if fmt:
                c.number_format = fmt
    ret = start + len(fields) + 2
    _header(ws, ret, ["Returns", "Value"])
    for i, (label, value, fmt) in enumerate([
        ("Entry EV / LTM EBITDA", lbo.entry_multiple, FMT_X), ("Offer price per share", lbo.offer_price, FMT_PRICE),
        ("Exit year", lbo.exit_year, FMT_INT), ("Exit EV", lbo.exit_ev / M, FMT_MONEY), ("Exit net debt", lbo.exit_net_debt / M, FMT_MONEY),
        ("Exit equity", lbo.exit_equity / M, FMT_MONEY), ("Sponsor equity", lbo.sponsor_equity / M, FMT_MONEY),
        ("MOIC", lbo.moic, '0.00"x"'), ("IRR", lbo.irr, FMT_PCT),
    ], start=ret + 1):
        ws.cell(row=i, column=1, value=label)
        _put(ws, f"B{i}", value, fmt, ENGINE)
    ws.freeze_panes = "B5"
    _widths(ws, {"A": 30, "B": 14, "C": 14, "D": 14, "E": 14, "F": 26, "G": 14, "H": 14, "I": 14})


def _stats_rows(ws: Worksheet, row: int, label: str, s: DistributionStats, fmt: str) -> None:
    ws.cell(row=row, column=1, value=label).font = BOLD
    for j, v in enumerate([s.mean, s.std, s.p5, s.p10, s.p25, s.p50, s.p75, s.p90, s.p95], start=2):
        _put(ws, f"{get_column_letter(j)}{row}", v, fmt, ENGINE)


def _mc_sheet(ws: Worksheet, r: ValuationResponse) -> None:
    mc = r.monte_carlo
    _title(ws, "Monte Carlo statistics", f"{mc.n_sims:,} correlated simulations · seed {mc.seed} · {mc.terminal_method.replace('_', ' ')} terminal value")
    _header(ws, 4, ["Output", "Mean", "Std dev", "P5", "P10", "P25", "P50", "P75", "P90", "P95"])
    _stats_rows(ws, 5, "Share price", mc.price, FMT_PRICE)
    stat_keys = ("mean", "std", "p5", "p10", "p25", "p50", "p75", "p90", "p95")
    ent = mc.enterprise_value.model_copy(update={k: getattr(mc.enterprise_value, k) / M for k in stat_keys})
    _stats_rows(ws, 6, "Enterprise value (m)", ent, FMT_MONEY)
    if mc.irr and mc.moic:
        _stats_rows(ws, 7, "LBO IRR", mc.irr, FMT_PCT)
        _stats_rows(ws, 8, "LBO MOIC", mc.moic, '0.00"x"')
    _header(ws, 10, ["Probability", "Value"])
    probs = [("P(price > current)", mc.prob_price_above_current), (f"P(IRR ≥ {mc.hurdle_irr:.0%})", mc.prob_irr_above_hurdle), ("P(MOIC < 1x)", mc.prob_loss)]
    for i, (lab, p) in enumerate(probs, start=11):
        ws.cell(row=i, column=1, value=lab)
        _put(ws, f"B{i}", p if p is not None else "n/a", FMT_PCT, ENGINE)
    _header(ws, 15, ["Stochastic input", "Distribution", "Base", "Sample mean", "P5", "P95"])
    for i, inp in enumerate(mc.inputs, start=16):
        fmt = UNIT_FMT.get(inp.unit, '0.00')
        ws.cell(row=i, column=1, value=inp.label)
        ws.cell(row=i, column=2, value=inp.distribution.kind)
        for col, v in zip("CDEF", (inp.base, inp.mean, inp.p5, inp.p95)):
            _put(ws, f"{col}{i}", v, fmt, ENGINE)
    row = 16 + len(mc.inputs) + 1
    if mc.covenant_breach:
        _header(ws, row, ["Covenant breach probability", "Leverage", "Coverage", "Either"])
        for i, cb in enumerate(mc.covenant_breach, start=row + 1):
            ws.cell(row=i, column=1, value=f"Year {cb.year}")
            for col, v in zip("BCD", (cb.leverage, cb.coverage, cb.any)):
                _put(ws, f"{col}{i}", v, FMT_PCT, ENGINE)
        row += len(mc.covenant_breach) + 2
    _header(ws, row, ["Price histogram: bin start", "Bin end", "Count"])
    for i, b in enumerate(mc.price.histogram, start=row + 1):
        _put(ws, f"A{i}", b.start, FMT_PRICE, ENGINE)
        _put(ws, f"B{i}", b.end, FMT_PRICE, ENGINE)
        _put(ws, f"C{i}", b.count, FMT_INT, ENGINE)
    ws.freeze_panes = "B5"
    _widths(ws, {"A": 32, **{get_column_letter(c): 13 for c in range(2, 11)}})


def _comps_sheet(ws: Worksheet, r: ValuationResponse) -> None:
    _title(ws, "Trading comparables", r.comps.source)
    _header(ws, 4, ["Ticker", "Name", "EV / EBITDA", "EV / Revenue", "P / E", "Included"])
    for i, p in enumerate(r.comps.peers, start=5):
        ws.cell(row=i, column=1, value=p.ticker)
        ws.cell(row=i, column=2, value=p.name)
        for col, v in zip("CDE", (p.ev_ebitda, p.ev_revenue, p.pe)):
            _put(ws, f"{col}{i}", v if v is not None else "n/m", FMT_X, ENGINE)
        ws.cell(row=i, column=6, value="Yes" if p.included else "No")
    row = 5 + len(r.comps.peers) + 1
    _header(ws, row, ["Multiple", "Peers", "P25", "Median", "P75", "Implied price P25", "Implied price median", "Implied price P75"])
    for i, m in enumerate(r.comps.ranges, start=row + 1):
        ws.cell(row=i, column=1, value=m.label)
        ws.cell(row=i, column=2, value=m.count)
        for col, v, fmt in zip("CDEFGH", (m.low, m.median, m.high, m.implied_price_low, m.implied_price_mid, m.implied_price_high),
                               (FMT_X, FMT_X, FMT_X, FMT_PRICE, FMT_PRICE, FMT_PRICE)):
            _put(ws, f"{col}{i}", v if v is not None else "n/m", fmt, ENGINE)
    ws.freeze_panes = "A5"
    _widths(ws, {"A": 16, "B": 34, "C": 13, "D": 13, "E": 13, "F": 18, "G": 20, "H": 18})


def _historicals_sheet(ws: Worksheet, b: CompanyBundle) -> None:
    _title(ws, "Historical financials (cleaned)", f"{b.financials.currency} millions · source: {b.profile.exchange or 'Yahoo Finance'} via yfinance")
    years = b.financials.years
    _header(ws, 4, ["Line item"] + [f"FY{y.fiscal_year}" for y in years])
    fields = ["revenue", "gross_profit", "ebitda", "ebit", "d_and_a", "interest_expense", "pretax_income", "tax_expense", "net_income",
              "operating_cash_flow", "capex", "free_cash_flow", "dividends_paid", "total_debt", "cash", "total_equity", "minority_interest",
              "total_assets", "net_working_capital"]
    for i, f in enumerate(fields, start=5):
        ws.cell(row=i, column=1, value=f.replace("_", " ").replace("d and a", "D&A").capitalize())
        for j, y in enumerate(years, start=2):
            v = getattr(y, f)
            _put(ws, f"{get_column_letter(j)}{i}", v / M if v is not None else "n/a", FMT_MONEY, BLUE)
    ws.freeze_panes = "B5"
    _widths(ws, {"A": 26, **{get_column_letter(c): 14 for c in range(2, 2 + len(years))}})
