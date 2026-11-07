"use client";

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartFrame, TooltipCard } from "@/components/charts/chart-frame";
import { axisProps, C, gridProps } from "@/components/charts/theme";
import { pct } from "@/lib/format";
import type { Valuation } from "@/lib/schemas";

const legendStyle = { fontSize: 11, color: "var(--fg-muted)", paddingTop: 8 };

export function ConvergenceChart({ points, format }: { points: Valuation["monte_carlo"]["convergence"]; format: (v: number) => string }) {
  const data = points.map((p) => ({ n: p.n, mean: p.mean, band: [p.lower, p.upper] as [number, number] }));
  const last = points.at(-1);
  return (
    <ChartFrame
      label="Convergence of the mean share price"
      summary={
        last
          ? `After ${last.n.toLocaleString()} simulations the mean is ${format(last.mean)} with a 95% band of ${format(last.lower)} to ${format(last.upper)}.`
          : "No data."
      }
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            {...axisProps}
            dataKey="n"
            type="number"
            scale="log"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
          />
          <YAxis {...axisProps} width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => format(v)} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TooltipCard
                  title={`${p.n.toLocaleString()} simulations`}
                  rows={[
                    { label: "Running mean", value: format(p.mean), color: C.dcf },
                    { label: "95% band", value: `${format(p.band[0])} – ${format(p.band[1])}` },
                  ]}
                />
              );
            }}
          />
          <Area dataKey="band" stroke="none" fill={C.dcf} fillOpacity={0.15} isAnimationActive={false} />
          <Line dataKey="mean" stroke={C.dcf} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CovenantChart({ data }: { data: Valuation["monte_carlo"]["covenant_breach"] }) {
  const rows = data.map((d) => ({ year: `Y${d.year}`, leverage: d.leverage, coverage: d.coverage, any: d.any }));
  const worst = data.reduce((a, b) => (b.any > a.any ? b : a), data[0]);
  return (
    <ChartFrame
      label="Covenant breach probability by year"
      summary={worst ? `Highest breach probability is ${pct(worst.any)} in year ${worst.year}.` : "No covenant data."}
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="year" />
          <YAxis
            {...axisProps}
            width={44}
            domain={[0, (max: number) => Math.max(0.1, Math.min(1, max * 1.2))]}
            tickFormatter={(v: number) => pct(v, 0)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={String(label)}
                  rows={payload.map((p) => ({ label: String(p.name), value: pct(Number(p.value)), color: String(p.color) }))}
                />
              ) : null
            }
          />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          <Bar name="Leverage" dataKey="leverage" fill={C.warning} radius={[2, 2, 0, 0]} />
          <Bar name="Coverage" dataKey="coverage" fill={C.comps} radius={[2, 2, 0, 0]} />
          <Bar name="Either" dataKey="any" fill={C.negative} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

interface ProjectionRow {
  label: string;
  revenue: number;
  ebitda: number;
  margin: number;
  fcf?: number;
  historical: boolean;
}

export function ProjectionChart({ rows, format }: { rows: ProjectionRow[]; format: (v: number) => string }) {
  const lastHist = rows.filter((r) => r.historical).at(-1)?.label;
  return (
    <ChartFrame
      label="Revenue, EBITDA and margin, historical and projected"
      summary={rows.map((r) => `${r.label}: revenue ${format(r.revenue)}, EBITDA margin ${pct(r.margin)}`).join("; ")}
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="label" />
          <YAxis {...axisProps} yAxisId="v" width={64} tickFormatter={(v: number) => format(v)} />
          <YAxis {...axisProps} yAxisId="m" orientation="right" width={44} tickFormatter={(v: number) => pct(v, 0)} />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={String(label)}
                  rows={payload.map((p) => ({
                    label: String(p.name),
                    value: p.dataKey === "margin" ? pct(Number(p.value)) : format(Number(p.value)),
                    color: String(p.color),
                  }))}
                />
              ) : null
            }
          />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          {lastHist && (
            <ReferenceLine
              yAxisId="v"
              x={lastHist}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
              label={{ value: "LTM", position: "top", fontSize: 10, fill: "var(--fg-subtle)" }}
            />
          )}
          <Bar yAxisId="v" name="Revenue" dataKey="revenue" fill={C.dcf} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
          <Bar yAxisId="v" name="EBITDA" dataKey="ebitda" fill={C.lbo} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
          <Line yAxisId="m" name="EBITDA margin" dataKey="margin" stroke={C.warning} strokeWidth={2} dot={{ r: 2.5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
