import Link from "next/link";

import { TickerSearch } from "@/components/search/ticker-search";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-grid">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 py-24 text-center">
        <p className="num text-6xl font-semibold tracking-tight text-fg-subtle">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-fg">This page landed outside the distribution</h1>
        <p className="mt-2 text-fg-muted">Even at P99.9 we couldn’t find it. Search for a company instead.</p>
        <TickerSearch className="mt-8 max-w-md" />
        <Button asChild variant="ghost" className="mt-4">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
