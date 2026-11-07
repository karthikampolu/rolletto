import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkspaceSkeleton } from "@/components/analyze/states";
import { Workspace } from "@/components/analyze/workspace";

function clean(raw: string) {
  return decodeURIComponent(raw).trim().toUpperCase();
}

export async function generateMetadata({ params }: PageProps<"/analyze/[ticker]">): Promise<Metadata> {
  const ticker = clean((await params).ticker);
  return {
    title: `${ticker} valuation`,
    description: `Monte Carlo DCF and LBO valuation of ${ticker}: value distribution, IRR, sensitivity, comps and football field.`,
    alternates: { canonical: `/analyze/${encodeURIComponent(ticker)}` },
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
