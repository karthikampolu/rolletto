import Link from "next/link";

const POPULAR = [
  { t: "AAPL", n: "Apple" },
  { t: "MSFT", n: "Microsoft" },
  { t: "KO", n: "Coca-Cola" },
  { t: "NVDA", n: "NVIDIA" },
  { t: "RELIANCE.NS", n: "Reliance" },
  { t: "TCS.NS", n: "TCS" },
  { t: "INFY.NS", n: "Infosys" },
  { t: "HINDUNILVR.NS", n: "Hindustan Unilever" },
  { t: "HDFCBANK.NS", n: "HDFC Bank" },
];

export function PopularTickers({ label = "Popular" }: { label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-fg-subtle">{label}:</span>
      {POPULAR.map((p) => (
        <Link
          key={p.t}
          href={`/analyze/${p.t}`}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
          aria-label={`Analyze ${p.n} (${p.t})`}
        >
          <span className="num text-fg">{p.t}</span>
          <span className="hidden text-fg-subtle sm:inline">{p.n}</span>
        </Link>
      ))}
    </div>
  );
}
