"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartFrame, TooltipCard } from "@/components/charts/chart-frame";
import { axisProps, C, gridProps } from "@/components/charts/theme";
import type { DistributionStats } from "@/lib/schemas";

interface Marker {
  value: number;
  label: string;
  color: string;
  dashed?: boolean;
}

interface HistogramProps {
  stats: DistributionStats;
  label: string;
  format: (v: number) => string;
  color?: string;
  /** Bins at or above this value use ``color``; bins below use a muted tone. */
  threshold?: number;
  markers?: Marker[];
  height?: number;
  total: number;
}

export function Histogram({ stats, label, format, color = C.dcf, threshold, markers = [], height = 280, total }: HistogramProps) {
  const data = stats.histogram.map((b) => ({ mid: (b.start + b.end) / 2, start: b.start, end: b.end, count: b.count }));
  const lo = stats.histogram[0]?.start ?? stats.min;
  const hi = stats.histogram.at(-1)?.end ?? stats.max;
  const pctMarkers: Marker[] = [
    { value: stats.p5, label: "P5", color: C.axis, dashed: true },
    { value: stats.p50, label: "P50", color: C.fg, dashed: true },
    { value: stats.p95, label: "P95", color: C.axis, dashed: true },
  ];
  const all = [...pctMarkers, ...markers].filter((m) => m.value >= lo && m.value <= hi);
  const summary = `Median ${format(stats.p50)}, 90% interval ${format(stats.p5)} to ${format(stats.p95)}, mean ${format(stats.mean)}.${markers
    .map((m) => ` ${m.label}: ${format(m.value)}.`)
    .join("")}`;

  return (
    <ChartFrame label={label} summary={summary} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 12, bottom: 4, left: 0 }} barCategoryGap={1}>
          <CartesianGrid {...gridProps} />
          {/* Bins are equal-width, so a hidden category axis positions the bars and an overlaid numeric
              axis spanning the same [lo, hi] carries the ticks and the exact-value reference lines. */}
          <XAxis xAxisId="bins" dataKey="mid" type="category" hide height={0} />
          <XAxis
            {...axisProps}
            xAxisId="value"
            dataKey="mid"
            type="number"
            domain={[lo, hi]}
            ticks={[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => lo + (hi - lo) * t)}
            tickFormatter={(v: number) => format(v)}
            allowDataOverflow
          />
          <YAxis {...axisProps} width={44} tickFormatter={(v: number) => `${((v / total) * 100).toFixed(0)}%`} />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TooltipCard
                  title={`${format(p.start)} – ${format(p.end)}`}
                  rows={[
                    { label: "Simulations", value: p.count.toLocaleString() },
                    { label: "Share", value: `${((p.count / total) * 100).toFixed(1)}%` },
                  ]}
                />
              );
            }}
          />
          <Bar xAxisId="bins" dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive animationDuration={500}>
            {data.map((d) => (
              <Cell key={d.mid} fill={threshold === undefined || d.mid >= threshold ? color : C.muted} />
            ))}
          </Bar>
          {all.map((m) => (
            <ReferenceLine
              key={m.label}
              xAxisId="value"
              x={m.value}
              stroke={m.color}
              strokeWidth={m.dashed ? 1 : 2}
              strokeDasharray={m.dashed ? "3 3" : undefined}
              label={{ value: m.label, position: "top", fill: m.color, fontSize: 10 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
