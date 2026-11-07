/**
 * Hero illustration: simulated value paths fanning out from today and collecting into a histogram.
 * Server-rendered SVG animated with CSS only (no client JavaScript), honouring reduced-motion.
 */

/** Deterministic PRNG so the drawing is identical on every render. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const W = 560;
const H = 380;
const PLOT_W = 420;
const STEPS = 48;
const N_PATHS = 46;
const START_Y = 210;

function buildPaths() {
  const rand = mulberry32(20240601);
  return Array.from({ length: N_PATHS }, () => {
    let y = START_Y;
    let d = `M0 ${y.toFixed(1)}`;
    for (let s = 1; s <= STEPS; s++) {
      y += -0.55 + gaussian(rand) * 5.2;
      d += `L${((s / STEPS) * PLOT_W).toFixed(1)} ${y.toFixed(1)}`;
    }
    return { d, end: y };
  });
}

const PATHS = buildPaths();
const BINS = (() => {
  const lo = 40;
  const hi = 340;
  const n = 22;
  const counts = Array.from({ length: n }, () => 0);
  PATHS.forEach((p) => {
    counts[Math.min(n - 1, Math.max(0, Math.floor(((p.end - lo) / (hi - lo)) * n)))]! += 1;
  });
  const max = Math.max(...counts);
  return counts.map((c, i) => ({ y: lo + (i / n) * (hi - lo), h: (hi - lo) / n - 2, w: (c / max) * 110 }));
})();
const MEDIAN = [...PATHS].sort((a, b) => a.end - b.end)[Math.floor(N_PATHS / 2)]!.end;

const CSS = `
.hv-path{stroke-dasharray:1;stroke-dashoffset:1;animation:hv-draw 1.8s ease-out forwards}
.hv-bar{transform:scaleX(0);transform-origin:left;transform-box:fill-box;animation:hv-grow .6s ease-out forwards}
.hv-fade{opacity:0;animation:hv-in .5s ease-out 2.4s forwards}
@keyframes hv-draw{to{stroke-dashoffset:0}}
@keyframes hv-grow{to{transform:scaleX(1)}}
@keyframes hv-in{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.hv-path,.hv-bar,.hv-fade{animation:none;stroke-dashoffset:0;transform:none;opacity:1}}
`;

export function HeroVisual() {
  return (
    <div className="relative">
      <style>{CSS}</style>
      <div className="absolute -inset-8 rounded-[32px] bg-[radial-gradient(60%_60%_at_60%_40%,var(--accent-soft),transparent)]" aria-hidden="true" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="relative w-full overflow-visible"
        role="img"
        aria-label="Illustration: dozens of simulated value paths fanning out from today and collecting into a probability distribution"
      >
        <defs>
          <linearGradient id="path-fade" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {[60, 130, 200, 270, 340].map((y) => (
          <line key={y} x1={0} x2={PLOT_W} y1={y} y2={y} stroke="var(--grid)" />
        ))}
        {PATHS.map((p, i) => (
          <path
            key={i}
            d={p.d}
            pathLength={1}
            className="hv-path"
            style={{ animationDelay: `${0.15 + i * 0.025}s` }}
            fill="none"
            stroke="url(#path-fade)"
            strokeWidth={1.1}
          />
        ))}
        <circle cx={0} cy={START_Y} r={4} fill="var(--fg)" />
        <text x={8} y={START_Y + 22} fontSize={11} fill="var(--fg-subtle)" className="num">
          today
        </text>
        <line x1={PLOT_W + 6} x2={PLOT_W + 6} y1={40} y2={340} stroke="var(--border-strong)" />
        {BINS.map((b, i) => (
          <rect
            key={i}
            className="hv-bar"
            style={{ animationDelay: `${1.6 + i * 0.03}s` }}
            x={PLOT_W + 10}
            y={b.y}
            width={Math.max(b.w, 0.01)}
            height={b.h}
            rx={2}
            fill="var(--series-dcf)"
            fillOpacity={0.85}
          />
        ))}
        <g className="hv-fade">
          <line x1={PLOT_W + 6} x2={W - 6} y1={MEDIAN} y2={MEDIAN} stroke="var(--marker)" strokeDasharray="4 3" strokeWidth={1.5} />
          <text x={W - 6} y={MEDIAN - 6} textAnchor="end" fontSize={11} fill="var(--marker)" className="num">
            P50
          </text>
        </g>
      </svg>
    </div>
  );
}
