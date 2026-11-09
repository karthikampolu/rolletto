import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkspaceSkeleton } from "@/components/analyze/states";
import { Workspace } from "@/components/analyze/workspace";

function clean(raw: string) {
  return decodeURIComponent(raw).trim().toUpperCase();
}

export async function generateMetadata({ params }: PageProps<"/analyze/[ticker]">): Promise<Metadata> {
  const ticker = clean((await params).ticker);
  const title = `${ticker} valuation`;
  const description = `What is ${ticker} really worth? A DCF and LBO driven by 10,000 Monte Carlo simulations: value distribution, odds of upside, sponsor IRR, sensitivity and football field.`;
  const url = `/analyze/${encodeURIComponent(ticker)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Rolletto", title: `${title} · Rolletto`, description, url },
    twitter: { card: "summary_large_image", title: `${title} · Rolletto`, description },
  };
}

export default function AnalyzePage({ params }: PageProps<"/analyze/[ticker]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      {params.then(({ ticker }) => (
        <Workspace key={clean(ticker)} ticker={clean(ticker)} />
      ))}
    </Suspense>
  );
}
