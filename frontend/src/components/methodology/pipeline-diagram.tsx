const STAGES = [
  { id: "data", title: "Data", sub: "yfinance via DataProvider" },
  { id: "clean", title: "Clean", sub: "normalise · flag gaps" },
  { id: "assume", title: "Assumptions", sub: "history + CAPM" },
  { id: "dcf", title: "DCF", sub: "UFCF · 2 TVs" },
  { id: "lbo", title: "LBO", sub: "S&U · debt · IRR" },
  { id: "mc", title: "Monte Carlo", sub: "copula · 10k draws" },
  { id: "out", title: "Outputs", sub: "ranges · odds · exports" },
];

/** Horizontal (desktop) / vertical (mobile) pipeline diagram drawn with plain HTML so it reflows. */
export function PipelineDiagram() {
  return (
    <figure aria-label="The Rolletto pipeline: data, cleaning, assumptions, DCF and LBO models, Monte Carlo simulation, outputs" className="my-8">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7 lg:gap-0">
        {STAGES.map((s, i) => (
          <li key={s.id} className="relative flex items-center lg:flex-col lg:items-stretch">
            <div
              className={`flex-1 rounded-lg border p-3 lg:mx-1.5 ${s.id === "mc" ? "border-accent bg-accent-soft" : "border-border bg-surface"} ${
                s.id === "dcf" || s.id === "lbo" ? "lg:border-dashed" : ""
              }`}
            >
              <span className="num text-2xs text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-1 text-sm font-semibold text-fg">{s.title}</p>
              <p className="text-2xs text-fg-subtle">{s.sub}</p>
            </div>
            {i < STAGES.length - 1 && (
              <span aria-hidden="true" className="absolute top-1/2 -right-1.5 z-10 hidden -translate-y-1/2 text-fg-subtle lg:block">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-xs text-fg-subtle">
        DCF and LBO share one operating projection. The Monte Carlo re-runs both, vectorised, for every simulated set of drivers.
      </figcaption>
    </figure>
  );
}
