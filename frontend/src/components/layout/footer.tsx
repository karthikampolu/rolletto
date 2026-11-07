import Link from "next/link";

import { Logo } from "@/components/layout/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/analyze", label: "Analyze a company" },
      { href: "/analyze/AAPL", label: "Sample: Apple" },
      { href: "/analyze/TCS.NS", label: "Sample: TCS" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/methodology", label: "Methodology" },
      { href: "/methodology#monte-carlo", label: "Monte Carlo engine" },
      { href: "/methodology#limitations", label: "Limitations" },
    ],
  },
  {
    title: "Rolletto",
    links: [
      { href: "/about", label: "About" },
      { href: "/about#contact", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-bg-elevated">
      <div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Probabilistic DCF and LBO valuation. Every assumption is a distribution, every output a range.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h2 className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">{c.title}</h2>
            <ul className="mt-2 space-y-0.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-7 items-center text-sm text-fg-muted transition-colors hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[1600px] px-4 py-5 text-xs leading-relaxed text-fg-subtle sm:px-6">
          <strong className="font-semibold text-fg-muted">Educational purposes only — not investment advice.</strong> Rolletto is a modelling tool.
          Outputs depend entirely on assumptions and on market data from Yahoo Finance via the unofficial yfinance library, which may be delayed,
          incomplete or wrong. Do your own research and consult a licensed adviser before investing.
        </p>
      </div>
    </footer>
  );
}
