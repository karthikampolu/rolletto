"use client";

import { RotateCcw, Shuffle } from "lucide-react";

import { AssumptionControl } from "@/components/analyze/assumption-control";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AssumptionSet, Distribution, SimSettings } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const GROUP_ORDER = ["Operating", "Cost of capital", "LBO entry", "LBO debt", "LBO exit & covenants"];
const SIM_COUNTS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];

interface Props {
  assumptions: AssumptionSet;
  overrides: Record<string, number>;
  distributions: Record<string, Distribution>;
  usedDistributions: Record<string, Distribution>;
  settings: SimSettings;
  onOverride: (key: string, value: number | null) => void;
  onDistribution: (key: string, d: Distribution | null) => void;
  onSettings: (s: Partial<SimSettings>) => void;
  onResetAll: () => void;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col rounded-md border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded px-2 py-1 text-xs transition-colors",
            value === o.value ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AssumptionPanel(props: Props) {
  const { assumptions, overrides, distributions, usedDistributions, settings, onOverride, onDistribution, onSettings, onResetAll } = props;
  const groups = GROUP_ORDER.map((g) => ({ name: g, items: assumptions.items.filter((a) => a.group === g) })).filter((g) => g.items.length);
  const changed = Object.keys(overrides).length + Object.keys(distributions).length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <h2 className="text-sm font-semibold text-fg">Assumptions</h2>
        <Button variant="ghost" size="sm" disabled={!changed} onClick={onResetAll} aria-label="Reset all assumptions to defaults">
          <RotateCcw aria-hidden="true" />
          Reset{changed ? ` (${changed})` : ""}
        </Button>
      </div>
      <Accordion type="multiple" defaultValue={["Simulation", "Operating", "Cost of capital"]}>
        <AccordionItem value="Simulation">
          <AccordionTrigger>Simulation</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-2xs text-fg-subtle">Simulations</span>
                <Select value={String(settings.n_sims)} onValueChange={(v) => onSettings({ n_sims: Number(v) })}>
                  <SelectTrigger className="mt-1 h-8 text-[13px]" aria-label="Number of simulations">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIM_COUNTS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block">
                <span className="text-2xs text-fg-subtle">Random seed</span>
                <div className="mt-1 flex h-8 items-center rounded-md border border-border bg-bg-elevated focus-within:border-accent">
                  <input
                    inputMode="numeric"
                    aria-label="Random seed"
                    value={settings.seed ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value === "" || (Number.isInteger(n) && n >= 0 && n < 2 ** 32))
                        onSettings({ seed: e.target.value === "" ? null : n });
                    }}
                    className="h-full w-full min-w-0 bg-transparent px-2 num text-[13px] text-fg outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Randomise seed"
                    title="Randomise seed"
                    onClick={() => onSettings({ seed: Math.floor(Math.random() * 1_000_000) })}
                    className="cursor-pointer px-2 text-fg-subtle hover:text-fg"
                  >
                    <Shuffle className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </label>
            </div>
            <label className="block">
              <span className="flex items-center justify-between text-2xs text-fg-subtle">
                <span>Hurdle IRR</span>
                <span className="num text-fg">{(settings.hurdle_irr * 100).toFixed(0)}%</span>
              </span>
              <input
                type="range"
                min={5}
                max={40}
                step={1}
                aria-label="Hurdle IRR"
                value={settings.hurdle_irr * 100}
                onChange={(e) => onSettings({ hurdle_irr: Number(e.target.value) / 100 })}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
            <div>
              <span className="text-2xs text-fg-subtle">Terminal value for distributions</span>
              <div className="mt-1">
                <Segmented
                  label="Terminal value method"
                  value={settings.terminal_method}
                  onChange={(v) => onSettings({ terminal_method: v })}
                  options={[
                    { value: "perpetuity", label: "Perpetuity growth" },
                    { value: "exit_multiple", label: "Exit multiple" },
                  ]}
                />
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 text-[13px] text-fg-muted">
              Mid-year convention
              <Switch checked={settings.mid_year} onCheckedChange={(c) => onSettings({ mid_year: c })} aria-label="Mid-year discounting convention" />
            </label>
          </AccordionContent>
        </AccordionItem>
        {groups.map((g) => (
          <AccordionItem key={g.name} value={g.name}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                {g.name}
                {g.items.some((a) => a.key in overrides || a.key in distributions) && (
                  <span className="size-1.5 rounded-full bg-accent" aria-label="has changes" />
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="divide-y divide-border/60 pb-2">
              {g.items.map((a) => (
                <AssumptionControl
                  key={a.key}
                  item={a}
                  value={overrides[a.key] ?? a.value}
                  onChange={(v) => onOverride(a.key, v)}
                  distribution={distributions[a.key] ?? usedDistributions[a.key] ?? a.distribution ?? undefined}
                  customDistribution={a.key in distributions}
                  onDistribution={(d) => onDistribution(a.key, d)}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
