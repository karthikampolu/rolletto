import { ImageResponse } from "next/og";

export const alt = "Rolletto — Monte Carlo DCF and LBO valuation for any public company";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A fixed bell-shaped histogram, drawn as bars.
const BARS = Array.from({ length: 28 }, (_, i) => Math.exp(-((i - 12) ** 2) / 38) * 0.92 + 0.04);

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#070a10",
        padding: 72,
        color: "#e8edf5",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, border: "3px solid #6a96ff", display: "flex" }} />
        <div style={{ fontSize: 36, fontWeight: 700 }}>Rolletto</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>Value a company as a distribution, not a guess.</div>
          <div style={{ fontSize: 26, color: "#a3afc3", marginTop: 24 }}>DCF · LBO · 10,000 correlated Monte Carlo simulations</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 260 }}>
          {BARS.map((h, i) => (
            <div key={i} style={{ width: 12, height: Math.round(h * 260), background: i >= 15 ? "#6a96ff" : "#1b2536", borderRadius: 3 }} />
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
