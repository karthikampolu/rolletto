import { Code2, Mail, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "@/components/layout/logo";

export const metadata: Metadata = {
  title: "About",
  description: "Why Rolletto exists, who it is for, and how it is built.",
  alternates: { canonical: "/about" },
};

const STACK = [
  ["Frontend", "Next.js (App Router), TypeScript, Tailwind CSS, Radix/shadcn primitives, Recharts, TanStack Query, Zod, KaTeX"],
  ["Backend", "Python, FastAPI, Pydantic v2, NumPy, SciPy, pandas"],
  ["Data", "Yahoo Finance via yfinance, behind a swappable DataProvider interface"],
  ["Exports", "openpyxl (Excel with live formulas), ReportLab (PDF memo)"],
];

// Replace these with your own profiles before deploying.
const CONTACT = [
  { icon: Mail, label: "Email", href: "mailto:hello@example.com", text: "hello@example.com" },
  { icon: Code2, label: "GitHub", href: "https://github.com/your-handle", text: "github.com/your-handle" },
  { icon: UserRound, label: "LinkedIn", href: "https://www.linkedin.com/in/your-handle", text: "linkedin.com/in/your-handle" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <LogoMark className="size-12" />
      <p className="mt-6 text-xs font-medium tracking-wider text-accent uppercase">About</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance text-fg">A valuation is a range. Rolletto shows you the range.</h1>

      <section className="mt-10 space-y-4 leading-relaxed text-fg-muted">
        <h2 className="text-lg font-semibold text-fg">The name</h2>
        <p>
          Monte Carlo simulation is named after the casino in Monaco — the idea that you can understand an uncertain outcome by spinning the wheel
          thousands of times. <em>Rolletto</em> borrows from the roulette wheel at its heart. Every spin is one plausible future for the company; ten
          thousand spins draw the shape of its value.
        </p>
        <h2 className="pt-4 text-lg font-semibold text-fg">Why it exists</h2>
        <p>
          A traditional DCF produces one number to the cent, built on a dozen inputs nobody knows to the cent. Analysts compensate with sensitivity
          tables, but two-way grids can’t show how uncertain drivers interact. Rolletto keeps the rigour of a banker’s model — the same projection,
          bridge, debt schedule and returns maths — and replaces point estimates with distributions, so the output answers better questions: how
          likely is this stock to be worth more than its price? What are the odds a buyout clears a 20% hurdle? Which assumption matters most?
        </p>
        <h2 className="pt-4 text-lg font-semibold text-fg">Who it’s for</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Students and candidates preparing for investment banking, private equity and equity research interviews.</li>
          <li>Analysts who want a fast, transparent first pass before building their own model.</li>
          <li>Investors who want to see the uncertainty behind a single “target price”.</li>
        </ul>
        <p>
          Every formula is documented on the{" "}
          <Link href="/methodology" className="text-accent underline underline-offset-2 hover:no-underline">
            methodology page
          </Link>
          , every default carries its source, and every number can be exported to Excel and audited.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">Built with</h2>
        <dl className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
          {STACK.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[120px_1fr]">
              <dt className="text-sm font-medium text-fg">{k}</dt>
              <dd className="text-sm text-fg-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="contact" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold text-fg">Contact</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {CONTACT.map((c) => (
            <li key={c.label}>
              <a
                href={c.href}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
              >
                <c.icon className="size-5 text-fg-subtle" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{c.label}</span>
                  <span className="block truncate text-xs text-fg-subtle">{c.text}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-sm text-fg-subtle">Rolletto is an educational tool and does not provide investment advice.</p>
    </div>
  );
}
