"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";
import { toast } from "sonner";

import { AssumptionPanel } from "@/components/analyze/assumption-panel";
import { CompanyHeader } from "@/components/analyze/company-header";
import { ExportButtons } from "@/components/analyze/export-buttons";
import { FmtProvider, makeFmt } from "@/components/analyze/format-context";
import { ErrorState, FinancialCompanyState, InsufficientDataState, WorkspaceSkeleton } from "@/components/analyze/states";
import { OverviewTab } from "@/components/analyze/tabs/overview-tab";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import type { Company, Distribution, SimSettings, ValuationRequest } from "@/lib/schemas";
import { decodeShare, encodeShare } from "@/lib/share";
import { cn } from "@/lib/utils";

function TabLoading() {
  return <Skeleton className="mt-1 h-96 w-full" />;
}

// Non-default tabs (and the charting library they use) load on first open.
const CompsTab = dynamic(() => import("@/components/analyze/tabs/comps-tab").then((mod) => mod.CompsTab), { loading: TabLoading });
const DcfTab = dynamic(() => import("@/components/analyze/tabs/dcf-tab").then((mod) => mod.DcfTab), { loading: TabLoading });
const FinancialsTab = dynamic(() => import("@/components/analyze/tabs/financials-tab").then((mod) => mod.FinancialsTab), { loading: TabLoading });
const LboTab = dynamic(() => import("@/components/analyze/tabs/lbo-tab").then((mod) => mod.LboTab), { loading: TabLoading });
const MonteCarloTab = dynamic(() => import("@/components/analyze/tabs/monte-carlo-tab").then((mod) => mod.MonteCarloTab), { loading: TabLoading });
const SensitivityTab = dynamic(() => import("@/components/analyze/tabs/sensitivity-tab").then((mod) => mod.SensitivityTab), { loading: TabLoading });

const DEFAULT_SETTINGS: SimSettings = { n_sims: 10_000, seed: 42, hurdle_irr: 0.2, terminal_method: "perpetuity", mid_year: true };
const DEBOUNCE_MS = 600;

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "dcf", label: "DCF" },
  { value: "lbo", label: "LBO" },
  { value: "monte-carlo", label: "Monte Carlo" },
  { value: "sensitivity", label: "Sensitivity" },
  { value: "comps", label: "Comps & Football Field" },
  { value: "financials", label: "Financials" },
] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function IndianToggle({ checked, onChange }: { checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-fg-muted">
      <Switch checked={checked} onCheckedChange={onChange} aria-label="Indian lakh and crore number format" />
      Lakh / crore
    </label>
  );
}

export function Workspace({ ticker }: { ticker: string }) {
  const companyQ = useQuery({ queryKey: ["company", ticker], queryFn: () => api.company(ticker) });
  const [indian, setIndian] = React.useState<boolean | null>(null);

  if (companyQ.isPending) return <WorkspaceSkeleton />;
  if (companyQ.isError) return <ErrorState error={companyQ.error} ticker={ticker} onRetry={() => companyQ.refetch()} />;

  const company = companyQ.data;
  const ccy = company.profile.currency;
  const useIndian = indian ?? ccy === "INR";
  const fmt = makeFmt(ccy, useIndian);
  const toggle = ccy === "INR" ? <IndianToggle checked={useIndian} onChange={setIndian} /> : null;

  if (company.classification.is_financial || !company.assumptions) {
    return (
      <FmtProvider value={fmt}>
        <CompanyHeader company={company} actions={toggle} />
        {company.classification.is_financial ? <FinancialCompanyState company={company} /> : <InsufficientDataState company={company} />}
        {company.financials.years.length > 0 && (
          <div className="mx-auto max-w-[1100px] px-4 pb-8 sm:px-6">
            <FinancialsTab company={company} />
          </div>
        )}
      </FmtProvider>
    );
  }
  return (
    <FmtProvider value={fmt}>
      <Analysis company={company} toggle={toggle} />
    </FmtProvider>
  );
}

function Analysis({ company, toggle }: { company: Company; toggle: React.ReactNode }) {
  const assumptions = company.assumptions!;
  // Analysis only renders in the browser (it waits on client-fetched company data), so the share
  // parameter can be read straight from the URL; useSearchParams would force a client-render bailout.
  const [initial] = React.useState(() => decodeShare(new URLSearchParams(window.location.search).get("a"), DEFAULT_SETTINGS));
  const [overrides, setOverrides] = React.useState<Record<string, number>>(initial?.overrides ?? {});
  const [distributions, setDistributions] = React.useState<Record<string, Distribution>>(initial?.distributions ?? {});
  const [settings, setSettings] = React.useState<SimSettings>(initial?.settings ?? DEFAULT_SETTINGS);
  const [peers, setPeers] = React.useState<string[] | null>(initial?.peers ?? null);
  const [tab, setTab] = React.useState<string>("overview");
  const [panelOpen, setPanelOpen] = React.useState(false);

  const request = React.useMemo<ValuationRequest>(
    () => ({ ticker: company.profile.ticker, overrides, distributions, settings, peers }),
    [company.profile.ticker, overrides, distributions, settings, peers],
  );
  const debounced = useDebounced(request, DEBOUNCE_MS);
  const pendingChange = debounced !== request;

  const valuationQ = useQuery({
    queryKey: ["valuation", debounced],
    queryFn: ({ signal }) => api.valuation(debounced, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });

  React.useEffect(() => {
    const encoded = encodeShare(
      { overrides: debounced.overrides, distributions: debounced.distributions, settings: debounced.settings, peers: debounced.peers ?? null },
      DEFAULT_SETTINGS,
    );
    window.history.replaceState(null, "", encoded ? `?a=${encoded}` : window.location.pathname);
  }, [debounced]);

  const error = valuationQ.error;
  React.useEffect(() => {
    if (error) toast.error("Couldn’t run the valuation", { description: error instanceof ApiError ? error.message : "Please try again." });
  }, [error]);

  const v = valuationQ.data;
  const usedDistributions = React.useMemo(() => Object.fromEntries((v?.monte_carlo.inputs ?? []).map((i) => [i.key, i.distribution])), [v]);
  const running = valuationQ.isFetching || pendingChange;

  const onOverride = (key: string, value: number | null) =>
    setOverrides((o) => {
      const next = { ...o };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  const onDistribution = (key: string, d: Distribution | null) =>
    setDistributions((o) => {
      const next = { ...o };
      if (d === null) delete next[key];
      else next[key] = d;
      return next;
    });

  const panel = (
    <AssumptionPanel
      assumptions={assumptions}
      overrides={overrides}
      distributions={distributions}
      usedDistributions={usedDistributions}
      settings={settings}
      onOverride={onOverride}
      onDistribution={onDistribution}
      onSettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
      onResetAll={() => {
        setOverrides({});
        setDistributions({});
        setSettings(DEFAULT_SETTINGS);
      }}
    />
  );

  return (
    <>
      <CompanyHeader
        company={company}
        actions={
          <>
            {toggle}
            <ExportButtons request={debounced} disabled={!v || !!error} />
          </>
        }
      />
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          aria-label="Assumptions and simulation settings"
          className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:pr-2"
        >
          <Button variant="secondary" className="w-full justify-between lg:hidden" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            <span className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" /> Assumptions
            </span>
            <span className="text-xs text-fg-subtle">{Object.keys(overrides).length} changed</span>
          </Button>
          <div className={cn("mt-3 lg:mt-0 lg:block", panelOpen ? "block" : "hidden")}>{panel}</div>
        </aside>

        <section aria-label="Valuation results" className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="flex items-end gap-3">
              <TabsList className="flex-1">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div role="status" aria-live="polite" className="hidden shrink-0 items-center gap-2 pb-2.5 text-xs text-fg-subtle sm:flex">
                {running ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden="true" />
                    Simulating {settings.n_sims.toLocaleString()} paths…
                  </>
                ) : v ? (
                  <>
                    <span className="size-1.5 rounded-full bg-positive" aria-hidden="true" />
                    {v.monte_carlo.n_sims.toLocaleString()} runs · {v.monte_carlo.elapsed_ms.toFixed(0)} ms
                  </>
                ) : null}
              </div>
            </div>
            <div className="relative h-0.5 overflow-hidden" aria-hidden="true">
              {running && <div className="absolute inset-y-0 w-1/3 animate-indeterminate bg-accent" />}
            </div>

            {error && v && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2 text-sm text-fg-muted"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <span>Showing the last valid result. {error instanceof ApiError ? error.message : "The latest change could not be valued."}</span>
              </div>
            )}

            {!v ? (
              error ? (
                <ErrorState error={error} ticker={company.profile.ticker} onRetry={() => valuationQ.refetch()} />
              ) : (
                <div className="mt-5 space-y-4" aria-busy="true">
                  <p className="sr-only" role="status">
                    Running the first simulation…
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-28" />
                    ))}
                  </div>
                  <Skeleton className="h-72" />
                  <Skeleton className="h-56" />
                </div>
              )
            ) : (
              <div className={cn("transition-opacity duration-300", running && "opacity-70")}>
                <TabsContent value="overview">
                  <OverviewTab v={v} company={company} />
                </TabsContent>
                <TabsContent value="dcf">
                  <DcfTab v={v} company={company} />
                </TabsContent>
                <TabsContent value="lbo">
                  <LboTab v={v} />
                </TabsContent>
                <TabsContent value="monte-carlo">
                  <MonteCarloTab v={v} />
                </TabsContent>
                <TabsContent value="sensitivity">
                  <SensitivityTab v={v} />
                </TabsContent>
                <TabsContent value="comps">
                  <CompsTab v={v} customPeers={peers !== null} onPeers={setPeers} />
                </TabsContent>
                <TabsContent value="financials">
                  <FinancialsTab company={company} />
                </TabsContent>
              </div>
            )}
          </Tabs>
        </section>
      </div>
    </>
  );
}
