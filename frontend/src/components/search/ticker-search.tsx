"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { searchCompanies } from "@/lib/http";
import { cn } from "@/lib/utils";

interface TickerSearchProps {
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Accessible combobox: type a name or ticker, pick a match, or press Enter to go straight to a ticker. */
export function TickerSearch({ size = "md", autoFocus, className, placeholder = "Search any company or ticker — AAPL, TCS.NS…" }: TickerSearchProps) {
  const router = useRouter();
  const id = React.useId();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const debounced = useDebounced(query.trim(), 220);

  const {
    data = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["search", debounced],
    queryFn: ({ signal }) => searchCompanies(debounced, signal),
    enabled: debounced.length >= 1,
    staleTime: 10 * 60_000,
  });
  const results = debounced ? data : [];

  const go = (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setOpen(false);
    setQuery("");
    router.push(`/analyze/${encodeURIComponent(t)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active >= 0 && results[active] ? results[active].symbol : query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && debounced.length > 0;
  const lg = size === "lg";
  return (
    <div className={cn("relative w-full", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border-strong bg-bg-elevated transition-colors focus-within:border-accent",
          lg ? "h-14 pr-2 pl-4 shadow-token-md" : "h-9 px-3",
        )}
      >
        {isFetching ? (
          <Loader2 className={cn("shrink-0 animate-spin text-fg-subtle", lg ? "size-5" : "size-4")} aria-hidden="true" />
        ) : (
          <Search className={cn("shrink-0 text-fg-subtle", lg ? "size-5" : "size-4")} aria-hidden="true" />
        )}
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-label="Search companies by name or ticker"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className={cn("h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle", lg ? "text-base" : "text-sm")}
        />
        {lg && (
          <button
            type="button"
            onClick={() => go(query)}
            disabled={!query.trim()}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            Analyze <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Matching companies"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-lg border border-border-strong bg-bg-elevated p-1 shadow-token-lg"
        >
          {isError && <li className="px-3 py-2 text-sm text-negative">Search is unavailable right now. Press Enter to open the ticker directly.</li>}
          {!isError && !isFetching && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-fg-subtle">
              No matches. Press <kbd className="rounded border border-border px-1 num text-xs">Enter</kbd> to try “{query.trim().toUpperCase()}”.
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={r.symbol}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r.symbol);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2", i === active && "bg-surface-2")}
            >
              <span className="min-w-0">
                <span className="block num text-sm font-medium text-fg">{r.symbol}</span>
                <span className="block truncate text-xs text-fg-subtle">{r.name}</span>
              </span>
              {r.exchange && <span className="shrink-0 text-2xs text-fg-subtle">{r.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
