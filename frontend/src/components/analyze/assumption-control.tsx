"use client";

import { Info, RotateCcw } from "lucide-react";
import * as React from "react";

import { DistributionEditor } from "@/components/analyze/distribution-editor";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fromDisplay, toDisplay, unitValue } from "@/lib/format";
import type { Assumption, Distribution } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface Props {
  item: Assumption;
  value: number;
  onChange: (v: number | null) => void;
  distribution?: Distribution;
  customDistribution: boolean;
  onDistribution: (d: Distribution | null) => void;
}

const SUFFIX: Record<string, string> = { pct: "%", x: "x", years: "y", num: "" };

function decimalsFor(step: number, unit: string) {
  const s = unit === "pct" ? step * 100 : step;
  return Math.max(0, Math.min(3, Math.ceil(-Math.log10(s))));
}

export function AssumptionControl({ item, value, onChange, distribution, customDistribution, onDistribution }: Props) {
  const id = React.useId();
  const dec = decimalsFor(item.step, item.unit);
  const display = toDisplay(value, item.unit);
  const [text, setText] = React.useState<string | null>(null);
  const overridden = Math.abs(value - item.value) > 1e-12;

  const commit = (raw: string) => {
    setText(null);
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return;
    const v = Math.min(item.max, Math.max(item.min, fromDisplay(n, item.unit)));
    onChange(Math.abs(v - item.value) < 1e-12 ? null : v);
  };

  return (
    <div className="group py-2.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className={cn("min-w-0 flex-1 truncate text-[13px] text-fg-muted", overridden && "text-fg")}>
          {item.label}
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="cursor-help rounded text-fg-subtle hover:text-fg" aria-label={`About ${item.label}`}>
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-80">
            <p className="text-fg">{item.description}</p>
            <p className="mt-2">
              <span className="font-medium text-fg">Default {unitValue(item.value, item.unit)}</span> — {item.source}.
            </p>
            <p className="mt-1">{item.rationale}</p>
          </TooltipContent>
        </Tooltip>
        <div
          className={cn(
            "flex h-7 w-[88px] items-center rounded-md border bg-bg-elevated pr-2 focus-within:border-accent",
            overridden ? "border-accent/60" : "border-border",
          )}
        >
          <input
            id={id}
            inputMode="decimal"
            value={text ?? display.toFixed(dec)}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setText(null);
            }}
            className="h-full w-full min-w-0 bg-transparent px-2 text-right num text-[13px] text-fg outline-none"
          />
          <span className="text-2xs text-fg-subtle">{SUFFIX[item.unit]}</span>
        </div>
      </div>
      <Slider
        className="mt-2"
        aria-label={item.label}
        min={toDisplay(item.min, item.unit)}
        max={toDisplay(item.max, item.unit)}
        step={toDisplay(item.step, item.unit)}
        value={[display]}
        onValueChange={([d]) => {
          const v = fromDisplay(d!, item.unit);
          onChange(Math.abs(v - item.value) < 1e-12 ? null : v);
        }}
      />
      <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2">
        {item.stochastic && distribution ? (
          <DistributionEditor
            label={item.label}
            unit={item.unit}
            value={distribution}
            isCustom={customDistribution}
            onApply={(d) => onDistribution(d)}
            onReset={() => onDistribution(null)}
          />
        ) : (
          <span className="truncate text-2xs text-fg-subtle">{item.source}</span>
        )}
        {overridden && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex shrink-0 cursor-pointer items-center gap-1 text-2xs text-accent hover:underline"
            aria-label={`Reset ${item.label} to default ${unitValue(item.value, item.unit)}`}
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            {unitValue(item.value, item.unit)}
          </button>
        )}
      </div>
    </div>
  );
}
