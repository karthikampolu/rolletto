import { cn } from "@/lib/utils";

/** Rolletto mark: a roulette wheel whose pockets trace a probability distribution. */
export function LogoMark({ className }: { className?: string }) {
  const pockets = Array.from({ length: 18 }, (_, i) => i);
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      {pockets.map((i) => {
        const a = (i / pockets.length) * Math.PI * 2;
        // Rounded so server and browser trig produce identical attributes (no hydration mismatch).
        const at = (r: number, f: (x: number) => number) => (16 + f(a) * r).toFixed(3);
        return (
          <line
            key={i}
            x1={at(11.2, Math.cos)}
            y1={at(11.2, Math.sin)}
            x2={at(13.6, Math.cos)}
            y2={at(13.6, Math.sin)}
            stroke="var(--accent)"
            strokeOpacity={i % 2 ? 0.35 : 0.9}
            strokeWidth="1.4"
          />
        );
      })}
      <path d="M7.5 20.5 C 11 20.5, 12.2 10, 16 10 S 21 20.5, 24.5 20.5" fill="none" stroke="var(--fg)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="10" r="1.6" fill="var(--series-lbo)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-fg">Rolletto</span>
    </span>
  );
}
