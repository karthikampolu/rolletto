"use client";

import { LazyMotion, m } from "framer-motion";
import * as React from "react";

import { useElementWidth } from "@/components/charts/chart-frame";

const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export interface RangeRow {
  label: string;
  low: number;
  high: number;
  mid?: number | null;
  color: string;
  /** Tornado mode: colour the part below ``reference`` with ``lowColor``. */
  lowColor?: string;
  lowNote?: string;
  highNote?: string;
  note?: string | null;
}

interface RangeBarsProps {
  rows: RangeRow[];
  reference?: { value: number; label: string };
  format: (v: number) => string;
  label: string;
  rowHeight?: number;
  labelWidth?: number;
}

/** Horizontal range bars (football field, tornado) drawn in SVG with pixel-accurate labels. */
export function RangeBars({ rows, reference, format, label, rowHeight = 36, labelWidth = 200 }: RangeBarsProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 560;
  const lw = narrow ? 0 : labelWidth;
  const values = rows.flatMap((r) => [r.low, r.high]).concat(reference ? [reference.value] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.04 || Math.abs(max) * 0.1 || 1;
  const lo = min - pad;
  const hi = max + pad;
  // Reserve pixel gutters on both sides for the end-of-bar value labels so they never hit the row labels.
  const gutter = Math.min(rows.some((r) => r.lowNote || r.highNote) ? 128 : 64, width / 5);
  const plotW = Math.max(width - lw - 2 * gutter, 10);
  const x = (v: number) => lw + gutter + ((v - lo) / (hi - lo)) * plotW;
  const top = 26;
  const rh = narrow ? rowHeight + 16 : rowHeight;
  const height = top + rows.length * rh + 8;
  const summary = rows.map((r) => `${r.label}: ${format(r.low)} to ${format(r.high)}`).join("; ");

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${label}. ${summary}${reference ? `. ${reference.label}: ${format(reference.value)}` : ""}`}
      className="w-full"
    >
      {width > 0 && (
        <LazyMotion features={loadFeatures} strict>
          <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const v = lo + (hi - lo) * t;
              return (
                <g key={t}>
                  <line x1={x(v)} x2={x(v)} y1={top - 6} y2={height - 4} stroke="var(--grid)" />
                  <text x={x(v)} y={12} textAnchor="middle" className="num" fontSize={10} fill="var(--fg-subtle)">
                    {format(v)}
                  </text>
                </g>
              );
            })}
            {rows.map((r, i) => {
              const y = top + i * rh + (narrow ? 16 : 0);
              const barY = y + rh * 0.22;
              const barH = rh * (narrow ? 0.4 : 0.56);
              const split = reference && r.lowColor ? Math.min(Math.max(reference.value, r.low), r.high) : null;
              return (
                <g key={r.label}>
                  <text
                    x={narrow ? 0 : lw - 12}
                    y={narrow ? y + 4 : barY + barH / 2 + 4}
                    textAnchor={narrow ? "start" : "end"}
                    fontSize={12}
                    fill="var(--fg-muted)"
                  >
                    {r.label}
                  </text>
                  {split !== null ? (
                    <>
                      <m.rect
                        initial={{ width: 0 }}
                        animate={{ width: Math.max(x(split) - x(r.low), 0) }}
                        transition={{ duration: 0.5 }}
                        x={x(r.low)}
                        y={barY}
                        height={barH}
                        rx={3}
                        fill={r.lowColor}
                      />
                      <m.rect
                        initial={{ width: 0 }}
                        animate={{ width: Math.max(x(r.high) - x(split), 0) }}
                        transition={{ duration: 0.5 }}
                        x={x(split)}
                        y={barY}
                        height={barH}
                        rx={3}
                        fill={r.color}
                      />
                    </>
                  ) : (
                    <m.rect
                      initial={{ width: 0 }}
                      animate={{ width: Math.max(x(r.high) - x(r.low), 2) }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                      x={x(r.low)}
                      y={barY}
                      height={barH}
                      rx={3}
                      fill={r.color}
                      fillOpacity={0.88}
                    />
                  )}
                  {r.mid != null && <line x1={x(r.mid)} x2={x(r.mid)} y1={barY - 2} y2={barY + barH + 2} stroke="var(--fg)" strokeWidth={1.5} />}
                  <text x={x(r.low) - 6} y={barY + barH / 2 + 4} textAnchor="end" className="num" fontSize={10.5} fill="var(--fg-subtle)">
                    {r.lowNote ?? format(r.low)}
                  </text>
                  <text x={x(r.high) + 6} y={barY + barH / 2 + 4} textAnchor="start" className="num" fontSize={10.5} fill="var(--fg-subtle)">
                    {r.highNote ?? format(r.high)}
                  </text>
                </g>
              );
            })}
            {reference && (
              <g>
                <line
                  x1={x(reference.value)}
                  x2={x(reference.value)}
                  y1={top - 6}
                  y2={height - 2}
                  stroke="var(--marker)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <rect x={x(reference.value) - 2} y={top - 9} width={4} height={4} fill="var(--marker)" />
              </g>
            )}
          </svg>
        </LazyMotion>
      )}
      {reference && (
        <p aria-hidden="true" className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-marker" aria-hidden="true" />
          {reference.label}: <span className="num text-fg">{format(reference.value)}</span>
        </p>
      )}
    </div>
  );
}
