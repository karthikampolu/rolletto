import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Rolletto — value any public company as a distribution, not a guess: DCF, LBO and 10,000 Monte Carlo simulations";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOgImage({
    eyebrow: "DCF · LBO · MONTE CARLO",
    title: "Value any company as a distribution, not a guess.",
    subtitle: "Pick a ticker. Get the range of outcomes, the odds that matter and the drivers behind them.",
  });
}
