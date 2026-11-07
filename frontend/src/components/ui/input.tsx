import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg transition-colors outline-none placeholder:text-fg-subtle focus-visible:border-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
