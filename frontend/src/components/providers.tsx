"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/http";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            // Never retry client errors (bad ticker, validation); retry transient upstream failures once.
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-bg-elevated !border-border-strong !text-fg !shadow-token-lg",
              description: "!text-fg-muted",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
