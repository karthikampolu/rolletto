"use client";

import { Dice5 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromDisplay, toDisplay, unitValue } from "@/lib/format";
import type { DistKind, Distribution, Unit } from "@/lib/schemas";

const KIND_LABEL: Record<DistKind, string> = {
  normal: "Normal",
  truncnormal: "Truncated normal",
  triangular: "Triangular",
  uniform: "Uniform",
  lognormal: "Lognormal",
};

const PARAMS: Record<DistKind, (keyof Distribution)[]> = {
  normal: ["mean", "std"],
  truncnormal: ["mean", "std", "low", "high"],
  triangular: ["low", "mode", "high"],
  uniform: ["low", "high"],
  lognormal: ["mean", "std"],
};

const PARAM_LABEL: Record<string, string> = { mean: "Mean", std: "Std dev", low: "Low", mode: "Mode", high: "High" };

export function describeDistribution(d: Distribution, unit: Unit): string {
  const f = (v: number | null | undefined) => (v == null ? "—" : unitValue(v, unit));
  switch (d.kind) {
    case "normal":
    case "lognormal":
      return `${KIND_LABEL[d.kind]} ${f(d.mean)} ± ${f(d.std)}`;
    case "truncnormal":
      return `Trunc. normal ${f(d.mean)} ± ${f(d.std)}`;
    case "triangular":
      return `Triangular ${f(d.low)} / ${f(d.mode)} / ${f(d.high)}`;
    case "uniform":
      return `Uniform ${f(d.low)} – ${f(d.high)}`;
  }
}

function validate(d: Distribution): string | null {
  const need = PARAMS[d.kind];
  if (need.some((k) => d[k] == null || !Number.isFinite(d[k] as number))) return "Fill in every parameter.";
  if ((d.std ?? 1) <= 0) return "Standard deviation must be positive.";
  if (d.low != null && d.high != null && d.low >= d.high) return "Low must be below high.";
  if (d.kind === "triangular" && !(d.low! <= d.mode! && d.mode! <= d.high!)) return "Mode must lie between low and high.";
  if (d.kind === "lognormal" && (d.mean ?? 0) <= 0) return "Lognormal mean must be positive.";
  if (d.kind === "truncnormal" && !(d.low! < d.mean! && d.mean! < d.high!)) return "Mean should lie inside the bounds.";
  return null;
}

/** Convert an existing distribution to a new kind, keeping its centre and spread. */
function convert(d: Distribution, kind: DistKind): Distribution {
  const mean = d.mean ?? d.mode ?? ((d.low ?? 0) + (d.high ?? 0)) / 2;
  const spread = d.std ?? ((d.high ?? mean) - (d.low ?? mean)) / 4;
  const std = spread > 0 ? spread : Math.abs(mean) * 0.1 || 0.01;
  switch (kind) {
    case "normal":
    case "lognormal":
      return { kind, mean, std };
    case "truncnormal":
      return { kind, mean, std, low: mean - 3 * std, high: mean + 3 * std };
    case "triangular":
      return { kind, low: mean - 2 * std, mode: mean, high: mean + 2 * std };
    case "uniform":
      return { kind, low: mean - 1.7 * std, high: mean + 1.7 * std };
  }
}

interface Props {
  label: string;
  unit: Unit;
  value: Distribution;
  isCustom: boolean;
  onApply: (d: Distribution) => void;
  onReset: () => void;
}

export function DistributionEditor({ label, unit, value, isCustom, onApply, onReset }: Props) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Distribution>(value);
  const [text, setText] = React.useState<Record<string, string>>({});
  const error = validate(draft);

  const openWith = (o: boolean) => {
    if (o) {
      setDraft(value);
      setText({});
    }
    setOpen(o);
  };

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-full cursor-pointer items-center gap-1.5 truncate rounded text-2xs text-fg-subtle transition-colors hover:text-accent"
          aria-label={`Edit distribution for ${label}: ${describeDistribution(value, unit)}`}
        >
          <Dice5 className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate num">{describeDistribution(value, unit)}</span>
          {isCustom && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="custom" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="text-sm font-medium text-fg">{label} distribution</p>
        <p className="mt-1 text-xs text-fg-subtle">Each simulation draws this driver from the distribution below (correlated with the others).</p>
        <div className="mt-3 space-y-3">
          <Select value={draft.kind} onValueChange={(k) => setDraft(convert(draft, k as DistKind))}>
            <SelectTrigger aria-label="Distribution type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as DistKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            {PARAMS[draft.kind].map((p) => {
              const raw = draft[p];
              const shown = text[p] ?? (raw == null ? "" : String(+toDisplay(raw as number, unit).toFixed(4)));
              return (
                <label key={p} className="block">
                  <span className="text-2xs text-fg-subtle">
                    {PARAM_LABEL[p]}
                    {unit === "pct" ? " (%)" : unit === "x" ? " (x)" : ""}
                  </span>
                  <input
                    inputMode="decimal"
                    value={shown}
                    onChange={(e) => {
                      setText((t) => ({ ...t, [p]: e.target.value }));
                      const n = Number(e.target.value);
                      setDraft((d) => ({ ...d, [p]: e.target.value.trim() === "" || !Number.isFinite(n) ? null : fromDisplay(n, unit) }));
                    }}
                    className="mt-1 h-8 w-full rounded-md border border-border bg-bg-elevated px-2 num text-sm text-fg outline-none focus-visible:border-accent"
                  />
                </label>
              );
            })}
          </div>
          {error && (
            <p role="alert" className="text-xs text-negative">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!isCustom}
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            >
              Reset to default
            </Button>
            <Button
              size="sm"
              disabled={!!error}
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
