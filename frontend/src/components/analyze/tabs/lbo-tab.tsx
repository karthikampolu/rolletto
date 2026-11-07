"use client";

import { Ban } from "lucide-react";

import { useFmt } from "@/components/analyze/format-context";
import { DataTable, EmptyState, Panel, StatCard, StatementTable } from "@/components/analyze/tabs/shared";
import { Histogram } from "@/components/charts/histogram";
import { CovenantChart } from "@/components/charts/line-charts";
import { C } from "@/components/charts/theme";
import { multiple, pct } from "@/lib/format";
import type { Valuation } from "@/lib/schemas";

type SU = Valuation["lbo"]["sources"][number];

export function LboTab({ v }: { v: Valuation }) {
  const fmt = useFmt();
  const l = v.lbo;
  const mc = v.monte_carlo;
  if (!l.feasible || !mc.irr || !mc.moic) {
    return (
      <EmptyState icon={Ban} title="An LBO isn’t feasible with these inputs">
        {l.infeasible_reason ?? "The transaction cannot be financed as specified."} Adjust leverage or entry assumptions in the panel to explore.
      </EmptyState>
    );
  }
  const suCols = (title: string) => [
    { key: "label", header: title, align: "left" as const, cell: (r: SU) => r.label },
    { key: "amt", header: fmt.scaleLabel, cell: (r: SU) => fmt.table(r.amount) },
    { key: "pct", header: "% total", cell: (r: SU) => pct(r.pct) },
    { key: "x", header: "x EBITDA", cell: (r: SU) => multiple(r.ebitda_multiple, 2) },
  ];
  const sched = l.schedule;
  const r = (
    label: string,
    pick: (y: (typeof sched)[number]) => number,
    o: { strong?: boolean; border?: boolean; ratio?: boolean; neg?: boolean } = {},
  ) => ({
    label,
    strong: o.strong,
    border: o.border,
    values: sched.map((y) => (o.ratio ? multiple(pick(y), 2) : fmt.table(o.neg ? -pick(y) : pick(y)))),
  });
  const breaches = sched.filter((y) => y.leverage_breach || y.coverage_breach);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Base-case IRR"
          value={pct(l.irr)}
          sub={`${pct(mc.prob_irr_above_hurdle, 0)} of simulations ≥ ${pct(mc.hurdle_irr, 0)} hurdle`}
          tone={l.irr >= mc.hurdle_irr ? "positive" : "negative"}
        />
        <StatCard
          label="MOIC"
          value={multiple(l.moic, 2)}
          sub={`P(loss) ${pct(mc.prob_loss, 1)}`}
          tone={(mc.prob_loss ?? 0) < 0.1 ? "positive" : "negative"}
        />
        <StatCard
          label="Entry"
          value={fmt.price(l.offer_price)}
          sub={`${pct(l.offer_premium, 0)} premium · ${multiple(l.entry_multiple)} LTM EBITDA`}
        />
        <StatCard
          label={`Exit · year ${l.exit_year}`}
          value={fmt.money(l.exit_equity)}
          sub={`EV ${fmt.money(l.exit_ev)} at ${multiple(l.exit_multiple)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sources" description={`Sponsor equity ${fmt.money(l.sponsor_equity)} (${pct(l.sources.at(-1)?.pct ?? 0, 0)} of total)`}>
          <DataTable caption="Sources of funds" columns={suCols("Source")} rows={l.sources} rowKey={(x) => x.label} />
        </Panel>
        <Panel title="Uses" description={`Entry EV ${fmt.money(l.entry_ev)}`}>
          <DataTable caption="Uses of funds" columns={suCols("Use")} rows={l.uses} rowKey={(x) => x.label} />
        </Panel>
      </div>

      <Panel
        title="Debt schedule"
        description={`${fmt.scaleLabel}. Interest on opening balances; cash sweep after mandatory amortisation. Covenants: net leverage ≤ ${multiple(l.max_net_leverage)}, coverage ≥ ${multiple(l.min_interest_coverage)}.`}
      >
        <StatementTable
          caption="LBO debt schedule"
          periods={sched.map((y) => `Year ${y.year}`)}
          rows={[
            r("EBITDA", (y) => y.ebitda, { strong: true }),
            r("Senior interest", (y) => y.interest_senior, { neg: true }),
            r("Subordinated interest", (y) => y.interest_sub, { neg: true }),
            r("Revolver interest", (y) => y.interest_revolver, { neg: true }),
            r("Taxes", (y) => y.taxes, { neg: true }),
            r("Capex", (y) => y.capex, { neg: true }),
            r("Δ NWC", (y) => y.delta_nwc, { neg: true }),
            r("Levered FCF", (y) => y.fcf_before_debt, { strong: true, border: true }),
            r("Mandatory amortisation", (y) => y.mandatory_amortization, { neg: true }),
            r("Revolver draw / (repay)", (y) => y.revolver_draw - y.revolver_repay),
            r("Cash sweep", (y) => y.cash_sweep, { neg: true }),
            r("Senior term loan", (y) => y.senior_end, { border: true }),
            r("Subordinated notes", (y) => y.sub_end),
            r("Revolver", (y) => y.revolver_end),
            r("Cash", (y) => y.cash_end),
            r("Net debt", (y) => y.net_debt, { strong: true }),
            r("Net debt / EBITDA", (y) => y.net_leverage, { ratio: true, border: true }),
            r("EBITDA / interest", (y) => y.interest_coverage, { ratio: true }),
          ]}
        />
        {breaches.length > 0 && (
          <p role="note" className="mt-3 text-xs text-negative">
            Base case breaches a covenant in year {breaches.map((b) => b.year).join(", ")}.
          </p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="IRR distribution" description={`Simulated sponsor IRR. Hurdle ${pct(mc.hurdle_irr, 0)}.`}>
          <Histogram
            stats={mc.irr}
            total={mc.n_sims}
            label="Sponsor IRR distribution"
            format={(x) => pct(x, 0)}
            color={C.lbo}
            threshold={mc.hurdle_irr}
            markers={[{ value: mc.hurdle_irr, label: "Hurdle", color: C.marker }]}
            height={240}
          />
        </Panel>
        <Panel title="MOIC distribution" description="Multiple of invested capital; below 1.0x the sponsor loses money.">
          <Histogram
            stats={mc.moic}
            total={mc.n_sims}
            label="Sponsor MOIC distribution"
            format={(x) => `${x.toFixed(1)}x`}
            color={C.lbo}
            threshold={1}
            markers={[{ value: 1, label: "1.0x", color: C.marker }]}
            height={240}
          />
        </Panel>
      </div>

      <Panel title="Covenant breach probability" description="Share of simulations failing each maintenance covenant, by year.">
        <CovenantChart data={mc.covenant_breach} />
      </Panel>
    </div>
  );
}
