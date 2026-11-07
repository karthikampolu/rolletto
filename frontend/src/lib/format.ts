/** Number formatting: currency symbols, compact money (incl. Indian lakh/crore), %, multiples. */
import type { Unit } from "@/lib/schemas";

const SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  HKD: "HK$",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF ",
  KRW: "₩",
  TWD: "NT$",
  SGD: "S$",
  BRL: "R$",
  SEK: "kr ",
  NOK: "kr ",
  DKK: "kr ",
  ZAR: "R ",
  MXN: "MX$",
  ILS: "₪",
};

export interface MoneyOptions {
  indian?: boolean;
  decimals?: number;
}

export function currencySymbol(code: string): string {
  return SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `;
}

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Compact money: $1.2B, ₹12,345.6 Cr, ₹2.5 L. */
export function money(v: number | null | undefined, ccy: string, opts: MoneyOptions = {}): string {
  if (!finite(v)) return "—";
  const { indian = false, decimals = 1 } = opts;
  const sym = currencySymbol(ccy);
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  const fmt = (x: number, d = decimals) => x.toLocaleString(indian ? "en-IN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (indian) {
    if (a >= 1e7) return `${sign}${sym}${fmt(a / 1e7)} Cr`;
    if (a >= 1e5) return `${sign}${sym}${fmt(a / 1e5)} L`;
    return `${sign}${sym}${fmt(a, 0)}`;
  }
  for (const [t, s] of [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (a >= t) return `${sign}${sym}${fmt(a / t)}${s}`;
  }
  return `${sign}${sym}${fmt(a, 0)}`;
}

/** Per-share price with two decimals. */
export function price(v: number | null | undefined, ccy: string, indian = false): string {
  if (!finite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  return `${sign}${currencySymbol(ccy)}${Math.abs(v).toLocaleString(indian ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v: number | null | undefined, decimals = 1, signed = false): string {
  if (!finite(v)) return "—";
  const s = (v * 100).toFixed(decimals);
  return `${signed && v > 0 ? "+" : ""}${s.replace("-", "−")}%`;
}

export function multiple(v: number | null | undefined, decimals = 1): string {
  if (!finite(v)) return "—";
  if (Math.abs(v) >= 1e5) return "n/m";
  return `${v.toFixed(decimals)}x`;
}

export function plain(v: number | null | undefined, decimals = 2): string {
  if (!finite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format an assumption value according to its unit. */
export function unitValue(v: number, unit: Unit | string, decimals?: number): string {
  switch (unit) {
    case "pct":
      return pct(v, decimals ?? 2);
    case "x":
      return multiple(v, decimals ?? 2);
    case "years":
      return `${Math.round(v)}y`;
    default:
      return plain(v, decimals ?? 2);
  }
}

/** For editable inputs: percentages are shown ×100. */
export const toDisplay = (v: number, unit: Unit | string) => (unit === "pct" ? v * 100 : v);
export const fromDisplay = (v: number, unit: Unit | string) => (unit === "pct" ? v / 100 : v);

/** Scale used by tables of statement values: millions, or crores for INR in Indian mode. */
export function tableScale(ccy: string, indian: boolean): { div: number; label: string } {
  if (indian && ccy === "INR") return { div: 1e7, label: "₹ crore" };
  return { div: 1e6, label: `${ccy} millions` };
}

export function tableNumber(v: number | null | undefined, div: number, decimals = 1, indian = false): string {
  if (!finite(v)) return "—";
  const x = v / div;
  const s = Math.abs(x).toLocaleString(indian ? "en-IN" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return x < 0 ? `(${s})` : s;
}
