import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Rolletto probabilistic valuation: DCF, LBO and Monte Carlo";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Per-company preview. Uses only the ticker (no API call), so link unfurls stay fast even when the API is asleep. */
export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = decodeURIComponent((await params).ticker)
    .trim()
    .toUpperCase()
    .slice(0, 16);
  return renderOgImage({
    eyebrow: "PROBABILISTIC VALUATION",
    title: `What is ${ticker} really worth?`,
    subtitle: "DCF, LBO and 10,000 correlated Monte Carlo simulations — the full range of outcomes, not one number.",
  });
}
