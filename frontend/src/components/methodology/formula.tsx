import katex from "katex";

/** Server-rendered KaTeX emitting native MathML: no client JavaScript, no stylesheet or math fonts to load. */
export function Formula({ tex, display = true, label }: { tex: string; display?: boolean; label?: string }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "mathml" });
  const Tag = display ? "div" : "span";
  return (
    <Tag
      className={display ? "my-3 overflow-x-auto rounded-md border border-border bg-surface-2 px-4 py-3" : undefined}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
