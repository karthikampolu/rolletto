"use client";

import { AlertTriangle } from "lucide-react";

import { ScoreRing } from "@/components/analyze/company-header";
import { useFmt } from "@/components/analyze/format-context";
import { Panel, StatCard } from "@/components/analyze/tabs/shared";
import { RangeBars } from "@/components/charts/range-bars";
import { C } from "@/components/charts/theme";
import { multiple, pct } from "@/lib/format";
import type { Company, Valuation } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const BAR_COLOR = { market: C.market, comps: C.comps, dcf: C.dcf, lbo: C.lbo } as const;

function verdict(p: number) {
  if (p >= 0.65) return { text: "Screens undervalued", tone: "positive" as const };
  if (p <= 0.35) return { text: "Screens overvalued", tone: "negative" as const };
  return { text: "Within fair-value range", tone: "neutral" as const };
}

export function OverviewTab({ v, company }: { v: Valuation; company: Company }) {
  const fmt = useFmt();
  const mc = v.monte_carlo;
  const upside = mc.price.p50 / v.current_price - 1;
  const ver = verdict(mc.prob_price_above_current);
  const latest = company.financials.years.at(-1);
  const s = company.suitability;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Intrinsic value (median)"
          value={fmt.price(mc.price.p50)}
          sub={`${pct(upside, 1, true)} vs ${fmt.price(v.current_price)}`}
          tone={upside >= 0 ? "positive" : "negative"}
        >
          <p className="mt-2 num text-2xs text-fg-subtle">
            P10–P90 {fmt.price(mc.price.p10)} – {fmt.price(mc.price.p90)}
          </p>
        </StatCard>
        <StatCard label="P(value > price)" value={pct(mc.prob_price_above_current, 0)} sub={ver.text} tone={ver.tone}>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${mc.prob_price_above_current * 100}%` }} />
          </div>
        </StatCard>
        <StatCard
          label="DCF base case"
          value={fmt.price(v.settings.terminal_method === "perpetuity" ? v.dcf.price_perpetuity : v.dcf.price_exit)}
          sub={`Perpetuity ${fmt.price(v.dcf.price_perpetuity)} · Exit ${fmt.price(v.dcf.price_exit)}`}
        >
          <p className="mt-2 num text-2xs text-fg-subtle">
            WACC {pct(v.dcf.wacc)} · g {pct(v.dcf.terminal_growth)} · {multiple(v.dcf.exit_multiple)}
          </p>
        </StatCard>
        {v.lbo.feasible && mc.prob_irr_above_hurdle !== null ? (
          <StatCard
            label="LBO base-case IRR"
            value={pct(v.lbo.irr)}
            sub={`${multiple(v.lbo.moic, 2)} MOIC · ${pct(mc.prob_irr_above_hurdle, 0)} clear ${pct(mc.hurdle_irr, 0)}`}
            tone={v.lbo.irr >= mc.hurdle_irr ? "positive" : "negative"}
          >
            <p className="mt-2 num text-2xs text-fg-subtle">
              P(loss) {pct(mc.prob_loss, 1)} · entry {multiple(v.lbo.entry_multiple)}
            </p>
          </StatCard>
        ) : (
          <StatCard label="LBO" value="n/a" sub={v.lbo.infeasible_reason ?? "Not feasible"} />
        )}
      </div>

      <Panel title="Football field" description="Implied value per share by method. Bars span the range; ticks mark the midpoint.">
        <RangeBars
          label="Football field"
          format={fmt.price}
          reference={{ value: v.current_price, label: "Current price" }}
          rows={v.football_field.bars.map((b) => ({
            label: b.label.replace("Trading comps · ", "Comps · "),
            low: b.low,
            high: b.high,
            mid: b.mid,
            color: BAR_COLOR[b.kind],
          }))}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {s && (
          <Panel title="LBO suitability" description={s.summary}>
            <div className="flex items-center gap-4">
              <ScoreRing score={s.score} size={64} />
              <ul className="flex-1 space-y-2.5">
                {s.components.map((c) => (
                  <li key={c.key}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-fg-muted">{c.label}</span>
                      <span className="num text-fg">{c.score === null || c.score === undefined ? "n/a" : Math.round(c.score)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          (c.score ?? 0) >= 55 ? "bg-positive" : (c.score ?? 0) >= 35 ? "bg-warning" : "bg-negative",
                        )}
                        style={{ width: `${c.score ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">{c.reasoning}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        )}
        <Panel title="Key statistics" description={`Latest fiscal year FY${latest?.fiscal_year ?? "—"}, ${fmt.ccy}`}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            {[
              ["Revenue", fmt.money(latest?.revenue)],
              ["EBITDA", fmt.money(latest?.ebitda)],
              ["EBITDA margin", pct(latest?.ebitda && latest.revenue ? latest.ebitda / latest.revenue : null)],
              ["Net income", fmt.money(latest?.net_income)],
              ["Enterprise value", fmt.money(company.market.enterprise_value)],
              ["Net debt", fmt.money(v.dcf.net_debt)],
              ["Beta (raw)", company.market.beta?.toFixed(2) ?? "—"],
              ["52-week range", `${fmt.price(company.market.fifty_two_week_low)} – ${fmt.price(company.market.fifty_two_week_high)}`],
              ["TV share of EV", pct(v.dcf.tv_share_perpetuity, 0)],
              ["Simulation time", `${mc.elapsed_ms.toFixed(0)} ms · ${mc.n_sims.toLocaleString()} runs`],
            ].map(([k, val]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-2xs text-fg-subtle">{k}</dt>
                <dd className="num text-fg">{val}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {v.warnings.length > 0 && (
        <Panel title="Model notes and data warnings">
          <ul className="space-y-2">
            {v.warnings.map((w) => (
              <li key={w} className="flex gap-2 text-sm text-fg-muted">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
