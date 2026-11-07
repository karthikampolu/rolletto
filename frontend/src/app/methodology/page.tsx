import type { Metadata } from "next";
import Link from "next/link";

import { Formula } from "@/components/methodology/formula";
import { PipelineDiagram } from "@/components/methodology/pipeline-diagram";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Rolletto values a company: data cleaning, assumption derivation, CAPM WACC, two-method DCF, LBO debt schedule, correlated Monte Carlo, sensitivity and limitations.",
  alternates: { canonical: "/methodology" },
};

const TOC = [
  { id: "data", label: "Data & cleaning" },
  { id: "assumptions", label: "Assumptions" },
  { id: "wacc", label: "Cost of capital" },
  { id: "dcf", label: "DCF" },
  { id: "lbo", label: "LBO" },
  { id: "monte-carlo", label: "Monte Carlo" },
  { id: "outputs", label: "Sensitivity & outputs" },
  { id: "financials", label: "Financial companies" },
  { id: "limitations", label: "Limitations" },
];

function H2({ id, n, children }: { id: string; n: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-16 scroll-mt-24 text-2xl font-semibold tracking-tight text-fg first:mt-0">
      <span className="mr-3 num text-base text-accent">{n}</span>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed text-fg-muted">{children}</p>;
}

function Convention({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mt-4 rounded-md border-l-2 border-accent bg-accent-soft/50 px-4 py-3 text-sm leading-relaxed text-fg-muted">
      <span className="font-semibold text-fg">Convention · </span>
      {children}
    </aside>
  );
}

const DISTS = [
  ["Normal", "mean, σ", "Symmetric uncertainty with no natural bound.", "—"],
  ["Truncated normal", "mean, σ, low, high", "Bell-shaped but bounded — margins, growth, WACC.", "Revenue growth, EBITDA margin, WACC"],
  ["Triangular", "low, mode, high", "Expert ranges with a most-likely value.", "Capex % revenue, terminal growth"],
  ["Uniform", "low, high", "Every value in the range equally likely.", "Senior interest rate"],
  ["Lognormal", "mean, σ (of the variable)", "Positive, right-skewed quantities.", "Exit EV/EBITDA multiple"],
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="On this page" className="hidden lg:block">
        <ul className="sticky top-24 space-y-2 border-l border-border text-sm">
          {TOC.map((t) => (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className="-ml-px block border-l border-transparent pl-4 text-fg-subtle transition-colors hover:border-accent hover:text-fg"
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0">
        <p className="text-xs font-medium tracking-wider text-accent uppercase">Methodology</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance text-fg">How Rolletto turns a ticker into a distribution of value</h1>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">
          Rolletto builds the same models an investment-banking analyst would — an unlevered DCF and a leveraged buyout — and then treats each key
          driver as uncertain. Every convention below is implemented exactly as written and covered by unit tests against a hand-calculated fixture
          company.
        </p>
        <PipelineDiagram />

        <H2 id="data" n="01">
          Data & cleaning
        </H2>
        <P>
          Market data and up to five years of annual statements come from Yahoo Finance through the open-source <em>yfinance</em> library, accessed
          only through a <code className="num text-sm">DataProvider</code> interface so a licensed feed can replace it without touching the models.
          Responses are cached (12 hours for statements, 15 minutes for prices) and retried with exponential backoff.
        </P>
        <P>
          Line items are normalised across companies (e.g. “Total Revenue” vs “Operating Revenue”). Where a figure must be derived — EBITDA as EBIT +
          D&A, debt as long-term + current — the derivation is recorded. Periods without revenue are dropped, never interpolated. Each company
          receives a data-quality grade listing every gap, fallback and anomaly (negative equity, revenue jumps &gt; 100%, missing years); if the
          latest year has no revenue or EBITDA, Rolletto refuses to value it rather than compute on garbage.
        </P>
        <P>
          When shares trade in a different currency from the statements (ADRs), price and market capitalisation are converted at the live FX rate so
          every per-share figure is in the reporting currency.
        </P>

        <H2 id="assumptions" n="02">
          Assumptions
        </H2>
        <P>Defaults are derived from history and bounded so a single unusual year cannot drive a perpetuity:</P>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">Revenue growth</strong> — historical CAGR, bounded to [−5%, 25%]; it fades linearly to terminal growth.
          </li>
          <li>
            <strong className="text-fg">EBITDA margin, D&A %, capex %</strong> — three-year averages (margin bounded to [−10%, 60%]).
          </li>
          <li>
            <strong className="text-fg">Working capital</strong> — median operating NWC (receivables + inventory − payables) as % of revenue.
          </li>
          <li>
            <strong className="text-fg">Tax</strong> — three-year effective rate if between 5% and 40% (capped at 35%), otherwise the statutory rate.
          </li>
          <li>
            <strong className="text-fg">Steady-state capex</strong> — historical capex/D&A, bounded to [1.0x, 1.5x].
          </li>
        </ul>
        <P>Every default is returned with its source and rationale, shown in the tooltip next to its control, and can be overridden.</P>

        <H2 id="wacc" n="03">
          Cost of capital
        </H2>
        <P>The cost of equity follows CAPM with a Blume-adjusted beta, which pulls the raw regression beta toward the market average of 1:</P>
        <Formula tex={String.raw`\beta_{adj} = 0.67\,\beta_{raw} + 0.33 \qquad K_e = R_f + \beta_{adj}\cdot ERP`} />
        <Formula tex={String.raw`WACC = \frac{E}{D+E}\,K_e + \frac{D}{D+E}\,K_d\,(1-t)`} />
        <P>
          The risk-free rate and equity risk premium are country defaults (configurable per deployment and overridable per analysis). The pre-tax cost
          of debt is interest expense divided by average total debt, bounded to [R<sub>f</sub> + 1%, 15%]. The debt weight is the current market
          D/(D+E), capped at 60%.
        </P>

        <H2 id="dcf" n="04">
          Discounted cash flow
        </H2>
        <P>Revenue growth fades from the year-one rate to terminal growth over the forecast horizon T:</P>
        <Formula tex={String.raw`g_t = g_1 + (g_\infty - g_1)\,\frac{t-1}{T}, \qquad t = 1,\dots,T`} />
        <Formula
          tex={String.raw`UFCF_t = \underbrace{EBIT_t\,(1-t_c)}_{NOPAT} + D\&A_t - Capex_t - \Delta NWC_t, \qquad \Delta NWC_t = nwc\% \cdot (Rev_t - Rev_{t-1})`}
        />
        <Convention>
          Capex as a share of revenue fades linearly from its current level to k × D&A% by the final year, so the terminal year represents a steady
          state rather than a peak-investment year. Taxes apply to positive EBIT only (no loss carry-forwards).
        </Convention>
        <P>Two terminal values are computed side by side:</P>
        <Formula tex={String.raw`TV^{PGM} = \frac{UFCF_T\,(1+g_\infty)}{WACC - g_\infty} \qquad\qquad TV^{EMM} = \text{multiple} \times EBITDA_T`} />
        <Formula
          tex={String.raw`EV = \sum_{t=1}^{T} \frac{UFCF_t}{(1+WACC)^{t-\frac12}} + \frac{TV^{PGM}}{(1+WACC)^{T-\frac12}} \quad \text{(mid-year, perpetuity method)}`}
        />
        <Convention>
          With the mid-year toggle on, cash flows are discounted at t − ½. The perpetuity-growth TV is discounted at T − ½ because its cash flows also
          arrive mid-year; the exit-multiple TV is a point-in-time sale price and is discounted at T (Rosenbaum & Pearl). Without mid-year, both use
          T.
        </Convention>
        <Formula
          tex={String.raw`\text{Equity} = EV - \text{Net debt} - \text{Minority interest} + \text{Non-operating assets} \qquad \text{Price} = \frac{\text{Equity}}{\text{Shares}}`}
        />
        <P>
          Rolletto also reports the cross-checks: the EV/EBITDA multiple implied by the perpetuity value, the perpetual growth implied by the exit
          multiple, and terminal value as a share of EV.
        </P>

        <H2 id="lbo" n="05">
          Leveraged buyout
        </H2>
        <P>
          The sponsor pays a premium to the current price. <strong className="text-fg">Uses</strong>: equity purchase, refinancing existing debt,
          advisory fees (% of EV), financing fees (% of new debt) and minimum cash. <strong className="text-fg">Sources</strong>: an amortising senior
          term loan and a bullet subordinated note (both sized as multiples of LTM EBITDA), existing cash, and sponsor equity as the plug.
        </P>
        <Formula tex={String.raw`LFCF_t = EBITDA_t - \text{Interest}_t - \max(EBIT_t - \text{Interest}_t,\,0)\,t_c - Capex_t - \Delta NWC_t`} />
        <Convention>
          Interest is charged on opening balances, which avoids the circular reference of average-balance interest. Cash is applied in order:
          mandatory senior amortisation → revolver repayment → cash sweep (× sweep %) against senior debt. Shortfalls draw on the revolver up to its
          commitment. The subordinated note is repaid at exit.
        </Convention>
        <Formula
          tex={String.raw`MOIC = \frac{\max(\text{multiple}\times EBITDA_N - \text{Net debt}_N,\ 0)}{\text{Sponsor equity}} \qquad IRR = MOIC^{1/N} - 1`}
        />
        <P>
          The IRR formula is exact because there are no interim distributions to the sponsor. Each year is tested against a maximum net-debt/EBITDA
          and a minimum EBITDA/interest covenant. The football field’s LBO bar is the maximum offer price at which a sponsor still earns the hurdle,
          solved in closed form because sponsor equity is linear in the offer price once the debt package is fixed.
        </P>

        <H2 id="monte-carlo" n="06">
          Monte Carlo simulation
        </H2>
        <P>
          Seven drivers are stochastic: year-one revenue growth, EBITDA margin, capex %, WACC, terminal growth, exit multiple and the senior interest
          rate (subordinated and revolver rates move in parallel). Each has an editable marginal distribution:
        </P>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Supported distributions</caption>
            <thead className="bg-surface-2 text-left text-2xs tracking-wider text-fg-subtle uppercase">
              <tr>
                {["Distribution", "Parameters", "Use when", "Default for"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DISTS.map(([a, b, c, d]) => (
                <tr key={a} className="border-t border-border">
                  <th scope="row" className="px-4 py-2 text-left font-medium text-fg">
                    {a}
                  </th>
                  <td className="px-4 py-2 num text-xs text-fg-muted">{b}</td>
                  <td className="px-4 py-2 text-fg-muted">{c}</td>
                  <td className="px-4 py-2 text-fg-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>Drivers are correlated with a Gaussian copula. With correlation matrix Σ = LLᵀ (Cholesky):</P>
        <Formula tex={String.raw`Z \sim \mathcal{N}(0, I_k), \qquad \tilde Z = Z L^{\top}, \qquad U = \Phi(\tilde Z), \qquad X_j = F_j^{-1}(U_j)`} />
        <P>
          Each marginal is therefore exactly as specified while the rank correlation follows Σ. The matrix is checked to be positive semi-definite
          before sampling; an invalid matrix is rejected with the nearest valid one suggested. Defaults include growth ↔ exit multiple (+0.5), WACC ↔
          exit multiple (−0.4) and WACC ↔ interest rate (+0.6). The whole DCF and LBO are evaluated as NumPy arrays of shape (n, T) — there is no loop
          over simulations — so 10,000 runs take tens of milliseconds. A fixed seed makes every result reproducible.
        </P>
        <Convention>Inside simulations, terminal growth is capped at WACC − 0.5pp; the share of capped draws is reported.</Convention>

        <H2 id="outputs" n="07">
          Sensitivity & outputs
        </H2>
        <P>
          Rolletto reports the value-per-share and EV distributions (P5–P95, mean, σ), P(value &gt; price), IRR and MOIC distributions, P(IRR ≥
          hurdle), P(loss) and covenant-breach probability by year. Convergence is shown as the running mean with a 95% band:
        </P>
        <Formula tex={String.raw`\bar x_n \pm 1.96\,\frac{s_n}{\sqrt n}`} />
        <P>
          The tornado chart swings each driver from its P10 to its P90 with every other driver at base — computed in one batched evaluation of the
          same engine. Trading comps use the interquartile range of peer EV/EBITDA, EV/revenue and P/E applied to the target’s LTM figures.
        </P>

        <H2 id="financials" n="08">
          Financial companies
        </H2>
        <P>
          Banks, insurers, NBFCs, broker-dealers and REITs are detected from their industry classification. For them, debt is raw material rather than
          financing, so unlevered FCF and EBITDA are not meaningful and DCF/LBO are not run. Rolletto shows two equity-side views instead:
        </P>
        <Formula
          tex={String.raw`\frac{P}{B} = \frac{ROE - g}{K_e - g} \qquad\qquad P = \frac{D_0\,(1+g)}{K_e - g}, \qquad g = \min\big(ROE\cdot(1-\text{payout}),\ g_{\text{long-run}}\big)`}
        />

        <H2 id="limitations" n="09">
          Limitations
        </H2>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-fg-muted">
          <li>yfinance is an unofficial scraper: fields can be missing, late or wrong, and requests can be rate-limited.</li>
          <li>Annual statements only; trailing-twelve-month figures, stock-based compensation and leases are not separately modelled.</li>
          <li>Non-operating assets are long-term investments as reported; pensions, NOLs and contingent liabilities are not adjusted for.</li>
          <li>Diluted shares are approximated by market capitalisation ÷ price; options and convertibles are not modelled explicitly.</li>
          <li>The LBO assumes no dividend recaps or interim distributions and a single exit; taxes ignore interest-deductibility caps.</li>
          <li>Automatic peers come from Yahoo’s industry and sector leaders (or curated lists for Indian listings) and may need editing.</li>
          <li>Distributions describe model uncertainty given your inputs — not the full range of real-world outcomes.</li>
        </ul>
        <p className="mt-10 rounded-lg border border-border bg-surface p-5 text-sm text-fg-muted">
          Rolletto is for education. It is not investment advice.{" "}
          <Link href="/analyze" className="text-accent underline underline-offset-2 hover:no-underline">
            Try it on a company →
          </Link>
        </p>
      </article>
    </div>
  );
}
