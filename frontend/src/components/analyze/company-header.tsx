"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { useFmt } from "@/components/analyze/format-context";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { multiple, pct } from "@/lib/format";
import type { Company } from "@/lib/schemas";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .replace(/\b(inc|ltd|limited|corp|corporation|plc|co|the|company)\b\.?/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function DataQualityBadge({ quality }: { quality: Company["data_quality"] }) {
  const tone = quality.grade === "good" ? "positive" : quality.grade === "fair" ? "warning" : "negative";
  const Icon = quality.grade === "good" ? CheckCircle2 : AlertTriangle;
  const issues = quality.warnings.filter((w) => w.severity !== "info");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer rounded-full" aria-label={`Data quality ${quality.grade}. Show details`}>
          <Badge tone={tone}>
            <Icon className="size-3" aria-hidden="true" />
            Data {quality.grade}
            {issues.length > 0 && <span className="num">· {issues.length}</span>}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <p className="text-sm font-medium text-fg">Data quality: {quality.grade}</p>
        <p className="mt-1 text-xs text-fg-subtle">
          {quality.years_available} fiscal year(s) of statements. Rolletto never fills gaps silently — every fallback is listed here.
        </p>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {quality.warnings.length === 0 && <li className="text-xs text-fg-muted">No issues detected.</li>}
          {quality.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className="flex gap-2 text-xs leading-relaxed">
              {w.severity === "info" ? (
                <Info className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              ) : (
                <AlertTriangle
                  className={cn("mt-0.5 size-3.5 shrink-0", w.severity === "error" ? "text-negative" : "text-warning")}
                  aria-hidden="true"
                />
              )}
              <span className="text-fg-muted">
                <span className="sr-only">{w.severity}: </span>
                {w.message}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--positive)" : score >= 55 ? "var(--accent)" : score >= 35 ? "var(--warning)" : "var(--negative)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="num" fontSize={size * 0.3} fill="var(--fg)">
        {Math.round(score)}
      </text>
    </svg>
  );
}

/** One-year price sparkline as a plain SVG path (keeps the charting library off the first paint). */
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const w = 112;
  const h = 40;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`);
  const color = up ? "var(--positive)" : "var(--negative)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={`M0,${h} L${pts.join(" L")} L${w},${h} Z`} fill={color} fillOpacity={0.12} />
      <path d={`M${pts.join(" L")}`} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function CompanyHeader({ company, actions }: { company: Company; actions?: React.ReactNode }) {
  const fmt = useFmt();
  const { profile, market, suitability, financials } = company;
  const latest = financials.years.at(-1);
  const history = company.price_history;
  const first = history[0]?.close;
  const change = first ? market.price / first - 1 : null;
  const evEbitda = market.enterprise_value && latest?.ebitda && latest.ebitda > 0 ? market.enterprise_value / latest.ebitda : null;

  return (
    <section aria-label="Company summary" className="border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-lg border border-border-strong bg-surface-2 text-sm font-semibold tracking-wide text-fg"
          >
            {initials(profile.name) || profile.ticker.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{profile.name}</h1>
              <span className="num text-sm text-fg-subtle">{profile.ticker}</span>
              <DataQualityBadge quality={company.data_quality} />
              {company.classification.is_financial && <Badge tone="accent">Financial company</Badge>}
            </div>
            <p className="mt-1 truncate text-xs text-fg-subtle">
              {[profile.sector, profile.industry, profile.exchange, profile.country].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:ml-auto lg:flex lg:items-center lg:gap-8">
          <div>
            <dt className="text-2xs tracking-wider text-fg-subtle uppercase">Price</dt>
            <dd className="num text-base font-medium whitespace-nowrap text-fg xl:text-lg">
              {fmt.price(market.price)}
              {change !== null && (
                <span className={cn("ml-2 text-xs", change >= 0 ? "text-positive" : "text-negative")}>{pct(change, 1, true)} 1y</span>
              )}
            </dd>
            {market.fx_rate !== 1 && (
              <dd className="num text-2xs text-fg-subtle">
                {market.trading_currency} {market.price_in_trading_currency.toFixed(2)} converted
              </dd>
            )}
          </div>
          <div>
            <dt className="text-2xs tracking-wider text-fg-subtle uppercase">Market cap</dt>
            <dd className="num text-base font-medium whitespace-nowrap text-fg xl:text-lg">{fmt.money(market.market_cap)}</dd>
          </div>
          <div>
            <dt className="text-2xs tracking-wider text-fg-subtle uppercase">EV / EBITDA</dt>
            <dd className="num text-base font-medium whitespace-nowrap text-fg xl:text-lg">{multiple(evEbitda)}</dd>
          </div>
          {suitability ? (
            <div>
              <dt className="text-2xs tracking-wider text-fg-subtle uppercase">LBO suitability</dt>
              <dd className="flex items-center gap-2 text-sm font-medium text-fg">
                <ScoreRing score={suitability.score} size={28} />
                {suitability.grade}
                <span className="sr-only">({Math.round(suitability.score)} of 100)</span>
              </dd>
            </div>
          ) : null}
        </dl>
        {history.length > 10 && (
          <div className="hidden xl:block" aria-hidden="true">
            <Sparkline values={history.map((h) => h.close)} up={change === null || change >= 0} />
          </div>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-2">{actions}</div>}
      </div>
    </section>
  );
}
