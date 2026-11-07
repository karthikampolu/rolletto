"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, WifiOff } from "lucide-react";
import Link from "next/link";

import { Histogram } from "@/components/charts/histogram";
import { C } from "@/components/charts/theme";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { multiple, pct, price } from "@/lib/format";

const SAMPLE = "KO";

/** A real, live valuation (small simulation count so it loads fast). */
export function LiveSample() {
  const q = useQuery({
    queryKey: ["sample-valuation", SAMPLE],
    queryFn: ({ signal }) =>
      api.valuation(
        {
          ticker: SAMPLE,
          overrides: {},
          distributions: {},
          settings: { n_sims: 3000, seed: 7, hurdle_irr: 0.2, terminal_method: "perpetuity", mid_year: true },
        },
        signal,
      ),
    staleTime: 30 * 60_000,
    retry: false,
  });

  if (q.isPending) {
    return (
      <Card className="p-6" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="mt-6 h-56" />
        <p className="sr-only" role="status">
          Running a live sample valuation…
        </p>
      </Card>
    );
  }
  if (q.isError) {
    return (
      <Card className="flex flex-col items-center p-10 text-center">
        <WifiOff className="size-6 text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-fg">Live sample unavailable</p>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">
          The valuation API isn’t reachable right now. Start the backend to see a live Coca-Cola valuation here.
        </p>
      </Card>
    );
  }
  const v = q.data;
  const ccy = v.currency;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="num text-sm font-semibold text-fg">{v.ticker}</span>
          <span className="text-sm text-fg-muted">The Coca-Cola Company</span>
          <Badge tone="positive">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden="true" /> Live
          </Badge>
        </div>
        <Link href={`/analyze/${SAMPLE}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          Open full analysis <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          ["Median value", price(v.monte_carlo.price.p50, ccy)],
          ["Current price", price(v.current_price, ccy)],
          ["P(value > price)", pct(v.monte_carlo.prob_price_above_current, 0)],
          ["WACC · exit", `${pct(v.dcf.wacc)} · ${multiple(v.dcf.exit_multiple)}`],
        ].map(([k, val]) => (
          <div key={k} className="bg-surface px-6 py-4">
            <dt className="text-2xs tracking-wider text-fg-subtle uppercase">{k}</dt>
            <dd className="mt-1 num text-lg font-medium text-fg">{val}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 pt-4 pb-2 sm:px-6">
        <Histogram
          stats={v.monte_carlo.price}
          total={v.monte_carlo.n_sims}
          label={`Live simulated value distribution for ${v.ticker}`}
          format={(x) => price(x, ccy)}
          color={C.dcf}
          threshold={v.current_price}
          markers={[{ value: v.current_price, label: "Price", color: C.marker }]}
          height={240}
        />
      </div>
    </Card>
  );
}
