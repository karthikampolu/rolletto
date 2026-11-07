"""Currency symbols and number formatting shared by the Excel and PDF exports."""

from __future__ import annotations

import math

CURRENCY_SYMBOLS: dict[str, str] = {
    "USD": "$", "INR": "₹", "EUR": "€", "GBP": "£", "JPY": "¥", "CNY": "¥", "HKD": "HK$",
    "CAD": "C$", "AUD": "A$", "CHF": "CHF ", "KRW": "₩", "TWD": "NT$", "SGD": "S$", "BRL": "R$",
    "SEK": "kr ", "NOK": "kr ", "DKK": "kr ", "ZAR": "R ", "MXN": "MX$", "ILS": "₪",
}


def currency_symbol(code: str | None) -> str:
    if not code:
        return ""
    return CURRENCY_SYMBOLS.get(code.upper(), f"{code.upper()} ")


def indian_group(value: float, decimals: int = 1) -> str:
    """Group digits the Indian way: 12,34,567.8."""
    whole, _, frac = f"{abs(value):.{decimals}f}".partition(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    out = ",".join(groups + [tail]) if groups else tail
    return f"{'-' if value < 0 else ''}{out}{'.' + frac if frac else ''}"


def format_money(value: float | None, currency: str | None, *, indian: bool = False, decimals: int = 1) -> str:
    """Format a monetary amount compactly, e.g. ``$1.2B`` or (Indian) ``₹1,234.5 Cr``."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "—"
    sym = currency_symbol(currency)
    sign = "-" if value < 0 else ""
    v = abs(value)
    if indian:
        if v >= 1e7:
            return f"{sign}{sym}{indian_group(v / 1e7, decimals)} Cr"
        if v >= 1e5:
            return f"{sign}{sym}{indian_group(v / 1e5, decimals)} L"
        return f"{sign}{sym}{v:,.2f}"
    for threshold, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if v >= threshold:
            return f"{sign}{sym}{v / threshold:,.{decimals}f}{suffix}"
    return f"{sign}{sym}{v:,.2f}"


def format_price(value: float | None, currency: str | None) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "—"
    return f"{'-' if value < 0 else ''}{currency_symbol(currency)}{abs(value):,.2f}"
