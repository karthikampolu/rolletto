/**
 * Shared Open Graph / social preview image (1200×630), rendered by next/og at the edge of each route.
 * Used by the site-wide preview and by per-company previews (/analyze/[ticker]).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const C = {
  bg: "#070a10",
  card: "#0f1520",
  border: "#1d2738",
  fg: "#e8edf5",
  muted: "#a3afc3",
  subtle: "#8592a8",
  accent: "#6a96ff",
  teal: "#2fd3c0",
  violet: "#b195ff",
  marker: "#ff6f86",
  bar: "#1b2536",
};

/** A right-skewed simulated distribution; bars right of the price marker are highlighted. */
const BARS = Array.from({ length: 30 }, (_, i) => {
  const x = (i - 10) / 6;
  return 0.06 + 0.94 * Math.exp(-(x * x) / (x < 0 ? 1.1 : 2.4));
});
const PRICE_INDEX = 13;

async function fonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [r, s, b, m] = await Promise.all(
    ["Inter-400.ttf", "Inter-600.ttf", "Inter-800.ttf", "JetBrainsMono-500.ttf"].map((f) => readFile(join(dir, f))),
  );
  return [
    { name: "Inter", data: r, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: s, weight: 600 as const, style: "normal" as const },
    { name: "Inter", data: b, weight: 800 as const, style: "normal" as const },
    { name: "Mono", data: m, weight: 500 as const, style: "normal" as const },
  ];
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width="44" height="44" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14.5" fill="none" stroke={C.accent} strokeWidth="1.6" />
        <path d="M7.5 20.5 C 11 20.5, 12.2 10, 16 10 S 21 20.5, 24.5 20.5" fill="none" stroke={C.fg} strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="10" r="1.8" fill={C.teal} />
      </svg>
      <div style={{ fontSize: 30, fontWeight: 600, color: C.fg, letterSpacing: -0.5 }}>Rolletto</div>
    </div>
  );
}

function ChartCard() {
  const maxH = 210;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 470,
        padding: "26px 28px 24px",
        borderRadius: 22,
        border: `1px solid ${C.border}`,
        background: C.card,
        boxShadow: "0 30px 80px -30px rgba(0,0,0,0.9)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 17, color: C.muted, fontWeight: 600 }}>Simulated value per share</div>
        <div style={{ fontFamily: "Mono", fontSize: 15, color: C.subtle }}>10,000 runs</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", height: maxH + 30, marginTop: 18, position: "relative" }}>
        {BARS.map((h, i) => (
          <div
            key={i}
            style={{
              width: 11,
              marginRight: 3,
              height: Math.round(h * maxH),
              borderRadius: "3px 3px 0 0",
              background: i > PRICE_INDEX ? C.accent : C.bar,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: PRICE_INDEX * 14 + 12,
            top: 0,
            bottom: 0,
            borderLeft: `2px dashed ${C.marker}`,
            display: "flex",
          }}
        />
        <div style={{ position: "absolute", left: PRICE_INDEX * 14 + 20, top: -2, fontSize: 15, color: C.marker, fontFamily: "Mono" }}>Price</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        {[
          { k: "DCF", c: C.accent },
          { k: "LBO", c: C.teal },
          { k: "Comps", c: C.violet },
        ].map((x) => (
          <div
            key={x.k}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              fontSize: 15,
              color: C.muted,
            }}
          >
            <div style={{ width: 9, height: 9, borderRadius: 99, background: x.c, display: "flex" }} />
            {x.k}
          </div>
        ))}
      </div>
    </div>
  );
}

export async function renderOgImage({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  const long = title.length > 34;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: `radial-gradient(circle at 78% 35%, rgba(106,150,255,0.18), transparent 55%), ${C.bg}`,
        padding: "56px 64px",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, marginRight: 42 }}>
        <Logo />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "7px 16px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              color: C.teal,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 1.6,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ marginTop: 22, fontSize: long ? 50 : 60, lineHeight: 1.06, fontWeight: 800, color: C.fg, letterSpacing: -1.5 }}>{title}</div>
          <div style={{ marginTop: 20, fontSize: 24, lineHeight: 1.4, color: C.muted }}>{subtitle}</div>
        </div>
        <div style={{ fontFamily: "Mono", fontSize: 18, color: C.subtle }}>rolletto-six.vercel.app</div>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <ChartCard />
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}
