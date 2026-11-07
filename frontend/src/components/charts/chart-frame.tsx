import * as React from "react";

import { cn } from "@/lib/utils";

interface ChartFrameProps {
  label: string;
  summary: string;
  height?: number;
  className?: string;
  children: React.ReactNode;
}

/** Wraps a chart with an accessible name and a text summary for screen readers. */
export function ChartFrame({ label, summary, height = 260, className, children }: ChartFrameProps) {
  return (
    <div role="img" aria-label={`${label}. ${summary}`} className={cn("relative w-full", className)} style={{ height }}>
      <div aria-hidden="true" className="h-full w-full">
        {children}
      </div>
    </div>
  );
}

export function TooltipCard({ title, rows }: { title?: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-xs shadow-token-md">
      {title && <div className="mb-1 font-medium text-fg">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-fg-subtle">
            {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Track an element's width for SVG charts that lay out text in pixels. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
