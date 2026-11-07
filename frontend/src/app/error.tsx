"use client";

import { AlertOctagon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-24 text-center">
      <div className="grid size-14 place-items-center rounded-full border border-border bg-surface-2">
        <AlertOctagon className="size-6 text-negative" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-fg">Something went wrong</h1>
      <p className="mt-2 text-fg-muted">An unexpected error interrupted this page. Your inputs are encoded in the URL, so retrying is safe.</p>
      {error.digest && <p className="mt-2 num text-xs text-fg-subtle">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="ghost">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
