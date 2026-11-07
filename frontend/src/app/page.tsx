import { BarChart3, Database, FileSpreadsheet, GitBranch, Landmark, LineChart, Shuffle, Target } from "lucide-react";
import Link from "next/link";

import { HeroVisual } from "@/components/home/hero-visual";
import { LazyLiveSample } from "@/components/home/live-sample-lazy";
import { PopularTickers } from "@/components/home/popular-tickers";
import { TickerSearch } from "@/components/search/ticker-search";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: "01",
    title: "Pull and clean the data",
    body: "Five years of statements and market data, normalised across companies, with every gap and anomaly flagged — never silently filled.",
  },
  {
    n: "02",
    title: "Derive the assumptions",
    body: "Growth, margins, capex, working capital and a CAPM-based WACC from history and country defaults — each with its source, all overridable.",
  },
  {
    n: "03",
    title: "Roll 10,000 futures",
    body: "Correlated Monte Carlo draws drive a full DCF and LBO in a single vectorised pass, in well under a second.",
  },
  {
    n: "04",
    title: "Read the distribution",
    body: "Value ranges, P(undervalued), IRR odds, covenant risk, tornado sensitivities and a football field — exported to Excel or a memo.",
  },
];

const FEATURES = [
  {
    icon: LineChart,
    title: "Two-method DCF",
    body: "Five to ten-year unlevered FCF with perpetuity-growth and exit-multiple terminal values side by side, mid-year toggle and a full EV-to-equity bridge.",
  },
  {
    icon: Landmark,
    title: "Real LBO mechanics",
    body: "Sources & uses, amortising senior debt, a bullet high-yield tranche, a revolver, cash sweep, covenant tests and sponsor IRR / MOIC.",
  },
  {
    icon: Shuffle,
    title: "Correlated Monte Carlo",
    body: "Five distribution families and a Gaussian copula with PSD validation, reproducible seeds and convergence diagnostics.",
  },
  {
    icon: Target,
    title: "Football field",
    body: "52-week range, trading comps, the DCF P10–P90 and the price a sponsor could pay for its hurdle — on one chart.",
  },
  {
    icon: FileSpreadsheet,
    title: "Banker-grade exports",
    body: "A formatted workbook with live DCF formulas (blue inputs, black formulas) and a one-page PDF memo.",
  },
  {
    icon: Database,
    title: "Honest data",
    body: "A data-quality grade, financial-company detection with P/B–ROE and DDM instead, and Indian lakh / crore formatting.",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(70%_70%_at_50%_30%,black,transparent)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted">
              <span className="size-1.5 rounded-full bg-series-lbo" aria-hidden="true" />
              DCF · LBO · Monte Carlo — for any public company
            </p>
            <h1 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">
              Value a company as a <span className="text-accent">distribution</span>, not a guess.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-fg-muted">
              Rolletto builds the DCF and LBO an analyst would, then spins the wheel 10,000 times. You get the range of outcomes, the odds that
              matter, and the drivers behind them.
            </p>
            <TickerSearch size="lg" className="mt-8 max-w-xl" />
            <div className="mt-5 max-w-xl">
              <PopularTickers />
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
        <p className="text-xs font-medium tracking-wider text-accent uppercase">How it works</p>
        <h2 id="how" className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-fg">
          From ticker to probability-weighted value in four steps
        </h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-surface p-6">
              <span className="num text-sm text-accent">{s.n}</span>
              <h3 className="mt-3 font-semibold text-fg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="border-y border-border bg-bg-elevated">
        <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
          <p className="text-xs font-medium tracking-wider text-accent uppercase">What you get</p>
          <h2 id="features" className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-fg">
            The full analyst toolkit, built on correct finance
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-surface p-6">
                <div className="grid size-10 place-items-center rounded-md bg-accent-soft">
                  <f.icon className="size-5 text-accent" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="sample" className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:items-center">
          <div>
            <p className="text-xs font-medium tracking-wider text-accent uppercase">Live sample</p>
            <h2 id="sample" className="mt-2 text-3xl font-semibold tracking-tight text-fg">
              One question every valuation should answer
            </h2>
            <p className="mt-4 leading-relaxed text-fg-muted">
              Not “what is it worth?” but “how likely is it to be worth more than today’s price?”. This is a real simulation run against live market
              data, using the defaults Rolletto derives automatically.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/analyze">
                  <BarChart3 aria-hidden="true" /> Analyze a company
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/methodology">
                  <GitBranch aria-hidden="true" /> Read the methodology
                </Link>
              </Button>
            </div>
          </div>
          <LazyLiveSample />
        </div>
      </section>
    </>
  );
}
