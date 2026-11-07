"use client";

import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  DENSITIES,
  FONTS,
  MONOS,
  PALETTES,
  PANELS,
  PRESETS,
  RADII,
  readAppearance,
  syncDarkClass,
  type Appearance,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

const FONT_VAR: Record<string, string> = {
  inter: "var(--font-inter)",
  plex: "var(--font-plex)",
  grotesk: "var(--font-grotesk)",
  manrope: "var(--font-manrope)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-2xs font-semibold tracking-wider text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  fontPreview,
}: {
  label: string;
  value: T;
  options: readonly { id: T; name: string }[];
  onChange: (v: T) => void;
  fontPreview?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-flow-col gap-1 rounded-md border border-border bg-bg p-1"
      style={{ gridAutoColumns: "1fr" }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          style={fontPreview ? { fontFamily: FONT_VAR[o.id] } : undefined}
          className={cn(
            "min-h-8 cursor-pointer truncate rounded-sm px-2 text-xs transition-colors",
            value === o.id ? "bg-surface-3 font-medium text-fg shadow-token-sm" : "text-fg-subtle hover:text-fg",
          )}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

/** A miniature of the app rendered with the palette's real tokens (via data-palette on the card). */
function PaletteCard({ id, name, tagline, active, onSelect }: { id: string; name: string; tagline: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${name} theme: ${tagline}`}
      onClick={onSelect}
      data-palette={id}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-md border bg-bg p-2 text-left transition-shadow",
        active ? "border-accent ring-2 ring-accent/40" : "border-border-strong hover:border-accent",
      )}
    >
      <div className="rounded-sm border border-border bg-surface p-2">
        <div className="flex items-center justify-between">
          <span className="h-1.5 w-10 rounded-full bg-fg/80" />
          <span className="h-3 w-6 rounded-sm bg-accent" />
        </div>
        <div className="mt-2 flex h-8 items-end gap-0.5" aria-hidden="true">
          {[3, 5, 8, 12, 15, 13, 10, 7, 5, 3].map((h, i) => (
            <span key={i} className={cn("flex-1 rounded-t-[1px]", i >= 5 ? "bg-series-dcf" : "bg-surface-3")} style={{ height: `${h * 2}px` }} />
          ))}
          <span className="ml-1 h-full w-0.5 bg-marker" />
        </div>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          <span className="h-1 flex-1 rounded-full bg-series-lbo" />
          <span className="h-1 flex-1 rounded-full bg-series-comps" />
          <span className="h-1 flex-1 rounded-full bg-positive" />
          <span className="h-1 flex-1 rounded-full bg-negative" />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-fg">{name}</span>
          <span className="block truncate text-2xs text-fg-subtle">{tagline}</span>
        </span>
        {active && <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />}
      </div>
    </button>
  );
}

export function AppearanceMenu() {
  const [open, setOpen] = React.useState(false);
  const [a, setA] = React.useState<Appearance>(DEFAULT_APPEARANCE);

  // In "system" mode, follow OS light/dark changes live.
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", syncDarkClass);
    return () => mq.removeEventListener("change", syncDarkClass);
  }, []);

  // Build on the live <html> attributes, not render state, so rapid successive changes never drop one.
  const update = (patch: Partial<Appearance>) => {
    const next = { ...readAppearance(), ...patch };
    setA(next);
    applyAppearance(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setA(readAppearance());
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Appearance: theme, colours, typography and layout" title="Appearance">
          <Palette aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(80vh,720px)] w-[440px] space-y-5 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">Appearance</p>
            <p className="text-xs text-fg-subtle">Pick a theme, then fine-tune anything. Saved on this device.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => update(DEFAULT_APPEARANCE)} aria-label="Reset appearance to defaults">
            <RotateCcw aria-hidden="true" /> Reset
          </Button>
        </div>

        <Section title="Theme">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PALETTES.map((p) => {
              const preset = PRESETS.find((x) => x.palette === p.id)!;
              return (
                <PaletteCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  tagline={p.tagline}
                  active={a.palette === p.id}
                  onSelect={() => update({ palette: p.id, ...preset.settings })}
                />
              );
            })}
          </div>
          <p className="text-2xs text-fg-subtle">Choosing a theme also applies its recommended typography, corners and density.</p>
        </Section>

        <Section title="Mode">
          <div role="radiogroup" aria-label="Colour mode" className="grid grid-cols-3 gap-1 rounded-md border border-border bg-bg p-1">
            {(
              [
                { id: "light", name: "Light", Icon: Sun },
                { id: "dark", name: "Dark", Icon: Moon },
                { id: "system", name: "System", Icon: Monitor },
              ] as const
            ).map(({ id, name, Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={a.mode === id}
                onClick={() => update({ mode: id })}
                className={cn(
                  "flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm text-xs transition-colors",
                  a.mode === id ? "bg-surface-3 font-medium text-fg shadow-token-sm" : "text-fg-subtle hover:text-fg",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" /> {name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Typeface">
          <Choice label="Interface typeface" value={a.font} options={FONTS} onChange={(font) => update({ font })} fontPreview />
        </Section>

        <Section title="Numbers">
          <Choice label="Numeric typeface" value={a.mono} options={MONOS} onChange={(mono) => update({ mono })} />
        </Section>

        <div className="grid grid-cols-2 gap-4">
          <Section title="Corners">
            <Choice label="Corner style" value={a.radius} options={RADII} onChange={(radius) => update({ radius })} />
          </Section>
          <Section title="Assumptions panel">
            <Choice label="Assumptions panel side" value={a.panel} options={PANELS} onChange={(panel) => update({ panel })} />
          </Section>
        </div>

        <Section title="Density">
          <Choice label="Layout density" value={a.density} options={DENSITIES} onChange={(density) => update({ density })} />
        </Section>
      </PopoverContent>
    </Popover>
  );
}
