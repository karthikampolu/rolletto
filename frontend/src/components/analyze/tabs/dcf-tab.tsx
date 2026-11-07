"use client";

import { useFmt } from "@/components/analyze/format-context";
import { Panel, StatCard, StatementTable } from "@/components/analyze/tabs/shared";
import { Histogram } from "@/components/charts/histogram";
import { ProjectionChart } from "@/components/charts/line-charts";
import { C } from "@/components/charts/theme";
import { multiple, pct } from "@/lib/format";
import type { Company, Valuation } from "@/lib/schemas";

export function DcfTab({ v, company }: { v: Valuation; company: Company }) {
  const fmt = useFmt();
  const d = v.dcf;
  const hist = company.financials.years.slice(-3);
  const projRows = [
    ...hist
      .filter((y) => y.revenue && y.ebitda)
      .map((y) => ({
        label: `FY${String(y.fiscal_year).slice(-2)}`,
        revenue: y.revenue!,
        ebitda: y.ebitda!,
        margin: y.ebitda! / y.revenue!,
        historical: true,
      })),
    ...d.years.map((y) => ({ label: `Y${y.year}`, revenue: y.revenue, ebitda: y.ebitda, margin: y.ebitda_margin, historical: false })),
  ];
  const periods = d.years.map((y) => `Year ${y.year}`);
  const row = (
    label: string,
    pick: (y: (typeof d.years)[number]) => number,
    opts: { neg?: boolean; strong?: boolean; border?: boolean; pct?: boolean; raw?: boolean } = {},
  ) => ({
    label,
    strong: opts.strong,
    border: opts.border,
    muted: opts.pct || opts.raw,
    values: d.years.map((y) => (opts.pct ? pct(pick(y)) : opts.raw ? pick(y).toFixed(4) : fmt.table(opts.neg ? -pick(y) : pick(y)))),
  });
  const terminal = v.settings.terminal_method;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Price · perpetuity growth"
          value={fmt.price(d.price_perpetuity)}
          sub={pct(d.upside_perpetuity, 1, true)}
          tone={d.upside_perpetuity >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Price · exit multiple"
          value={fmt.price(d.price_exit)}
          sub={pct(d.upside_exit, 1, true)}
          tone={d.upside_exit >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Implied exit multiple" value={multiple(d.implied_multiple_from_perpetuity)} sub="from perpetuity TV / final EBITDA" />
        <StatCard label="Implied perpetual growth" value={pct(d.implied_growth_from_exit)} sub="from exit-multiple TV" />
      </div>

      <Panel
        title="Projection"
        description={`Unlevered free cash flow, ${fmt.scaleLabel}. ${d.mid_year ? "Mid-year" : "End-of-year"} discounting at WACC ${pct(d.wacc)}.`}
      >
        <StatementTable
          caption="Unlevered free cash flow projection"
          periods={periods}
          rows={[
            row("Revenue", (y) => y.revenue, { strong: true }),
            row("Growth", (y) => y.growth, { pct: true }),
            row("EBITDA", (y) => y.ebitda),
            row("EBITDA margin", (y) => y.ebitda_margin, { pct: true }),
            row("D&A", (y) => y.d_and_a, { neg: true }),
            row("EBIT", (y) => y.ebit),
            row("Taxes", (y) => y.taxes, { neg: true }),
            row("NOPAT", (y) => y.nopat),
            row("+ D&A", (y) => y.d_and_a),
            row("− Capex", (y) => y.capex, { neg: true }),
            row("− Δ NWC", (y) => y.delta_nwc, { neg: true }),
            row("Unlevered FCF", (y) => y.ufcf, { strong: true, border: true }),
            row("Discount factor", (y) => y.discount_factor, { raw: true }),
            row("PV of UFCF", (y) => y.pv_ufcf, { strong: true }),
          ]}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Revenue and EBITDA" description="Last three reported years and the projection.">
          <ProjectionChart rows={projRows} format={fmt.money} />
        </Panel>
        <Panel title="Enterprise to equity bridge" description={fmt.scaleLabel}>
          <StatementTable
            caption="Enterprise value to equity value bridge"
            periods={["Perpetuity", "Exit multiple"]}
            rows={[
              { label: "Σ PV of UFCF", values: [fmt.table(d.sum_pv_ufcf), fmt.table(d.sum_pv_ufcf)] },
              { label: "Terminal value", values: [fmt.table(d.tv_perpetuity), fmt.table(d.tv_exit)], muted: true },
              { label: "PV of terminal value", values: [fmt.table(d.pv_tv_perpetuity), fmt.table(d.pv_tv_exit)] },
              { label: "Enterprise value", values: [fmt.table(d.ev_perpetuity), fmt.table(d.ev_exit)], strong: true, border: true },
              { label: "− Net debt", values: [fmt.table(-d.net_debt), fmt.table(-d.net_debt)] },
              { label: "− Minority interest", values: [fmt.table(-d.minority_interest), fmt.table(-d.minority_interest)] },
              { label: "+ Non-operating assets", values: [fmt.table(d.non_operating_assets), fmt.table(d.non_operating_assets)] },
              { label: "Equity value", values: [fmt.table(d.equity_perpetuity), fmt.table(d.equity_exit)], strong: true, border: true },
              { label: "Per share", values: [fmt.price(d.price_perpetuity), fmt.price(d.price_exit)], strong: true },
            ]}
          />
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            Terminal value is {pct(d.tv_share_perpetuity, 0)} of EV under the perpetuity method. Growth g = {pct(d.terminal_growth)}, exit multiple{" "}
            {multiple(d.exit_multiple)}.
          </p>
        </Panel>
      </div>

      <Panel
        title="Distribution of DCF value per share"
        description={`${v.monte_carlo.n_sims.toLocaleString()} simulations, ${terminal === "perpetuity" ? "perpetuity-growth" : "exit-multiple"} terminal value. Shaded bars are above today's price.`}
      >
        <Histogram
          stats={v.monte_carlo.price}
          total={v.monte_carlo.n_sims}
          label="DCF value per share distribution"
          format={fmt.price}
          color={C.dcf}
          threshold={v.current_price}
          markers={[{ value: v.current_price, label: "Price", color: C.marker }]}
        />
      </Panel>
    </div>
  );
}
