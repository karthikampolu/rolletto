import type { Metadata } from "next";

import { PopularTickers } from "@/components/home/popular-tickers";
import { TickerSearch } from "@/components/search/ticker-search";

export const metadata: Metadata = {
  title: "Analyze a company",
  description: "Search any public company by name or ticker and get a probabilistic DCF and LBO valuation.",
  alternates: { canonical: "/analyze" },
};

export default function AnalyzeIndex() {
  return (
    <div className="bg-grid">
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-20">
        <p className="text-xs font-medium tracking-wider text-accent uppercase">Analyze</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Which company should we value?</h1>
        <p className="mt-3 text-fg-muted">
          US and global listings work by ticker; Indian companies use the exchange suffix (<span className="num">.NS</span> for NSE,{" "}
          <span className="num">.BO</span> for BSE).
        </p>
        <TickerSearch size="lg" className="mt-8" />
        <div className="mt-5">
          <PopularTickers label="Try" />
        </div>
      </div>
    </div>
  );
}
