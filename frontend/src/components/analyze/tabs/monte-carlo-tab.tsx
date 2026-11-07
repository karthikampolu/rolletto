"use client";

import { describeDistribution } from "@/components/analyze/distribution-editor";
import { useFmt } from "@/components/analyze/format-context";
import { DataTable, Panel, StatCard } from "@/components/analyze/tabs/shared";
import { Histogram } from "@/components/charts/histogram";
import { ConvergenceChart } from "@/components/charts/line-charts";
import { C } from "@/components/charts/theme";
import { multiple, pct, unitValue } from "@/lib/format";
import type { DistributionStats, Unit, Valuation } from "@/lib/schemas";

const SHORT: Record<string, string> = {
  revenue_growth: "Growth",
  ebitda_margin: "Margin",
  capex_pct_revenue: "Capex",
  wacc: "WACC",
  terminal_growth: "g",
  exit_multiple: "Exit x",
  senior_rate: "Rate",
};

export function MonteCarloTab({ v }: { v: Valuation }) {
  const fmt = useFmt();
  const mc = v.monte_carlo;
  type Row = { name: string; s: DistributionStats; f: (x: number) => string };
  const stats: Row[] = [
    { name: "Share price", s: mc.price, f: fmt.price },
    { name: "Enterprise value", s: mc.enterprise_value, f: fmt.money },
    ...(mc.irr ? [{ name: "LBO IRR", s: mc.irr, f: (x: number) => pct(x) }] : []),
    ...(mc.moic ? [{ name: "LBO MOIC", s: mc.moic, f: (x: number) => multiple(x, 2) }] : []),
  ];
  const corr = mc.correlation;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Simulations" value={mc.n_sims.toLocaleString()} sub={`seed ${mc.seed ?? "random"} · ${mc.elapsed_ms.toFixed(0)} ms`} />
        <StatCard label="Mean value / share" value={fmt.price(mc.price.mean)} sub={`σ ${fmt.price(mc.price.std)}`} />
        <StatCard label="P(value > price)" value={pct(mc.prob_price_above_current, 1)} sub={`vs ${fmt.price(v.current_price)}`} />
        <StatCard
          label="P(IRR ≥ hurdle)"
          value={mc.prob_irr_above_hurdle === null ? "n/a" : pct(mc.prob_irr_above_hurdle, 1)}
          sub={`hurdle ${pct(mc.hurdle_irr, 0)}`}
        />
      </div>

      <Panel title="Value per share" description="Histogram of simulated intrinsic value with P5 / P50 / P95 and the current share price.">
        <Histogram
          stats={mc.price}
          total={mc.n_sims}
          label="Simulated value per share"
          format={fmt.price}
          color={C.dcf}
          threshold={v.current_price}
          markers={[{ value: v.current_price, label: "Price", color: C.marker }]}
          height={320}
        />
        {mc.price.outside_histogram > 0 && (
          <p className="mt-2 text-2xs text-fg-subtle">
            {mc.price.outside_histogram.toLocaleString()} extreme draws beyond P0.5–P99.5 are counted in statistics but not drawn.
          </p>
        )}
      </Panel>

      <Panel title="Percentiles">
        <DataTable
          caption="Monte Carlo percentiles"
          rowKey={(r) => r.name}
          rows={stats}
          columns={[
            { key: "n", header: "Output", align: "left", cell: (r) => r.name },
            ...(["p5", "p10", "p25", "p50", "p75", "p90", "p95", "mean", "std"] as const).map((k) => ({
              key: k,
              header: k === "std" ? "Std dev" : k === "mean" ? "Mean" : k.toUpperCase(),
              cell: (r: Row) => r.f(r.s[k]),
            })),
          ]}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Convergence" description="Running mean of value per share with its 95% confidence band; a flat line means enough simulations.">
          <ConvergenceChart points={mc.convergence} format={fmt.price} />
        </Panel>
        <Panel title="Enterprise value" description="Simulated enterprise value.">
          <Histogram
            stats={mc.enterprise_value}
            total={mc.n_sims}
            label="Simulated enterprise value"
            format={fmt.money}
            color={C.comps}
            height={240}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Stochastic inputs" description="Distributions actually sampled (after re-centring on any overrides).">
          <DataTable
            caption="Stochastic input distributions"
            rowKey={(r) => r.key}
            rows={mc.inputs}
            columns={[
              { key: "l", header: "Driver", align: "left", cell: (r) => r.label },
              {
                key: "d",
                header: "Distribution",
                align: "left",
                cell: (r) => <span className="num text-xs text-fg-subtle">{describeDistribution(r.distribution, r.unit as Unit)}</span>,
              },
              { key: "b", header: "Base", cell: (r) => unitValue(r.base, r.unit) },
              { key: "m", header: "Mean", cell: (r) => unitValue(r.mean, r.unit) },
              { key: "p5", header: "P5", cell: (r) => unitValue(r.p5, r.unit) },
              { key: "p95", header: "P95", cell: (r) => unitValue(r.p95, r.unit) },
            ]}
          />
        </Panel>
        <Panel title="Correlation matrix" description="Gaussian copula; validated positive semi-definite before sampling.">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-max border-collapse text-2xs">
              <caption className="sr-only">Correlation matrix between stochastic drivers</caption>
              <thead>
                <tr>
                  <th scope="col" />
                  {corr.variables.map((k) => (
                    <th key={k} scope="col" className="px-1 pb-1 font-medium text-fg-subtle">
                      {SHORT[k] ?? k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corr.matrix.map((row, i) => (
                  <tr key={corr.variables[i]}>
                    <th scope="row" className="pr-2 text-left font-medium text-fg-subtle">
                      {SHORT[corr.variables[i]!] ?? corr.variables[i]}
                    </th>
                    {row.map((rho, j) => (
                      <td key={j} className="p-0.5">
                        <div
                          className="grid h-8 min-w-10 place-items-center rounded num text-fg"
                          style={{
                            background:
                              rho === 0
                                ? "var(--surface-2)"
                                : `color-mix(in srgb, ${rho > 0 ? "var(--series-dcf)" : "var(--negative)"} ${Math.round(Math.abs(rho) * 55)}%, var(--surface-2))`,
                          }}
                        >
                          {i === j ? "1" : rho.toFixed(2)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {mc.notes.length > 0 && (
        <Panel title="Simulation notes">
          <ul className="space-y-1 text-sm text-fg-muted">
            {mc.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
