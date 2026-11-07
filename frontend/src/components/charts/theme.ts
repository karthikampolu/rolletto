/** Chart theme: everything references the CSS design tokens so charts follow light/dark mode. */
export const C = {
  dcf: "var(--series-dcf)",
  lbo: "var(--series-lbo)",
  comps: "var(--series-comps)",
  market: "var(--series-market)",
  marker: "var(--marker)",
  positive: "var(--positive)",
  negative: "var(--negative)",
  warning: "var(--warning)",
  grid: "var(--grid)",
  axis: "var(--fg-subtle)",
  muted: "var(--surface-3)",
  fg: "var(--fg)",
} as const;

export const axisProps = {
  stroke: C.axis,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--fg-subtle)" },
} as const;

export const gridProps = { stroke: C.grid, vertical: false } as const;
