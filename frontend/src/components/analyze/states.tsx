"use client";

import { AlertOctagon, Landmark, Loader2, SearchX, WifiOff } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useFmt } from "@/components/analyze/format-context";
import { TickerSearch } from "@/components/search/ticker-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/http";
import { pct } from "@/lib/format";
import type { Company } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Free hosting (e.g. Render's free plan) puts the API to sleep when idle; the first request then takes
 * up to a minute. After a few seconds of loading, say so instead of leaving a silent skeleton.
 */
function SlowLoadNotice() {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, []);
  if (!slow) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <p className="flex items-center gap-2 rounded-full border border-border-strong bg-bg-elevated px-4 py-2 text-sm text-fg-muted shadow-token-lg">
        <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
        Waking up the valuation server — the first load can take up to a minute.
      </p>
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading company data">
      <div className="border-b border-border bg-bg-elevated">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-5 sm:px-6">
          <Skeleton className="size-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-80" />
          </div>
          <div className="ml-auto hidden gap-8 md:flex">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-24" />
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
      <p className="sr-only" role="status">
        Fetching statements and market data…
      </p>
      <SlowLoadNotice />
    </div>
  );
}

export function ErrorState({ error, ticker, onRetry }: { error: unknown; ticker: string; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  const notFound = api?.code === "ticker_not_found" || api?.code === "invalid_ticker";
  const offline = api?.code === "network_error";
  const Icon = notFound ? SearchX : offline ? WifiOff : AlertOctagon;
  const title = notFound
    ? `We couldn’t find “${ticker}”`
    : offline
      ? "The valuation API is unreachable"
      : "Something went wrong loading this company";
  const body = notFound
    ? "Check the symbol and exchange suffix — Indian listings use .NS (NSE) or .BO (BSE), London uses .L, Tokyo .T."
    : offline
      ? "Start the backend (see README) or check NEXT_PUBLIC_API_URL, then retry."
      : (api?.message ?? "Please try again in a moment. Yahoo Finance occasionally rate-limits requests.");
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <div className="grid size-14 place-items-center rounded-full border border-border bg-surface-2">
        <Icon className="size-6 text-fg-muted" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-fg">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
      <div className="mt-6 w-full max-w-md">
        <TickerSearch autoFocus={notFound} />
      </div>
      <div className="mt-4 flex gap-2">
        {onRetry && !notFound && (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

export function InsufficientDataState({ company }: { company: Company }) {
  const errors = company.data_quality.warnings.filter((w) => w.severity !== "info");
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not enough clean data to build a valuation</CardTitle>
          <CardDescription>
            Rolletto refuses to compute on garbage. The provider’s statements for {company.profile.ticker} fail these checks:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-fg-muted">
            {errors.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", w.severity === "error" ? "bg-negative" : "bg-warning")}
                  aria-hidden="true"
                />
                {w.message}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 num text-xs text-fg">{children}</code>;
}

export function FinancialCompanyState({ company }: { company: Company }) {
  const fmt = useFmt();
  const fv = company.financial_valuation;
  const kind = company.classification.kind;
  const label = { bank: "bank", insurer: "insurer", nbfc: "lender", reit: "REIT", capital_markets: "broker-dealer", operating: "company" }[kind];
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border bg-accent-soft/40 p-6 sm:flex-row sm:items-start">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent-soft">
            <Landmark className="size-5 text-accent" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg">Why there’s no DCF or LBO for this {label}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">{company.classification.reason}</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
              For financial institutions, debt and deposits are operating inputs, not financing, so “unlevered free cash flow” and “EBITDA” are not
              meaningful — and they cannot carry acquisition leverage. Equity-side methods are used instead.
            </p>
          </div>
        </div>
        {fv ? (
          <div className="grid gap-px bg-border md:grid-cols-2">
            <div className="bg-surface p-6">
              <h3 className="text-sm font-semibold text-fg">Justified P/B from ROE</h3>
              <p className="mt-1 text-xs text-fg-subtle">
                <Formula>P/B = (ROE − g) / (Ke − g)</Formula>
              </p>
              {fv.pb_roe ? (
                <>
                  <p className="mt-4 num text-3xl font-semibold text-fg">{fmt.price(fv.pb_roe.value_per_share)}</p>
                  <p className={cn("mt-1 num text-sm", (fv.upside_pb_roe ?? 0) >= 0 ? "text-positive" : "text-negative")}>
                    {pct(fv.upside_pb_roe, 1, true)} vs {fmt.price(fv.current_price)}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    {[
                      ["ROE (3y avg)", pct(fv.pb_roe.roe)],
                      ["Cost of equity", pct(fv.pb_roe.cost_of_equity)],
                      ["Sustainable growth", pct(fv.pb_roe.growth)],
                      ["Justified P/B", `${fv.pb_roe.justified_pb.toFixed(2)}x`],
                      ["Book value / share", fmt.price(fv.pb_roe.book_value_per_share)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-fg-subtle">{k}</dt>
                        <dd className="num text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="mt-4 text-sm text-fg-muted">Not computable from the available data (see notes).</p>
              )}
            </div>
            <div className="bg-surface p-6">
              <h3 className="text-sm font-semibold text-fg">Gordon dividend discount</h3>
              <p className="mt-1 text-xs text-fg-subtle">
                <Formula>P = D₀(1 + g) / (Ke − g)</Formula>
              </p>
              {fv.ddm ? (
                <>
                  <p className="mt-4 num text-3xl font-semibold text-fg">{fmt.price(fv.ddm.value_per_share)}</p>
                  <p className={cn("mt-1 num text-sm", (fv.upside_ddm ?? 0) >= 0 ? "text-positive" : "text-negative")}>
                    {pct(fv.upside_ddm, 1, true)} vs {fmt.price(fv.current_price)}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    {[
                      ["Dividend / share", fmt.price(fv.ddm.dividend_per_share)],
                      ["Growth", pct(fv.ddm.growth)],
                      ["Cost of equity", pct(fv.ddm.cost_of_equity)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-fg-subtle">{k}</dt>
                        <dd className="num text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="mt-4 text-sm text-fg-muted">No dividend history, so the DDM is not applied.</p>
              )}
            </div>
          </div>
        ) : null}
        {fv && (
          <div className="border-t border-border p-6">
            <h3 className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">How these were derived</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-fg-muted">
              {fv.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link href="/methodology#financials" className="text-accent underline underline-offset-2 hover:no-underline">
                Read the methodology for financial companies →
              </Link>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
