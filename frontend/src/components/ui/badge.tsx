import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-border bg-surface-2 text-fg-muted",
      accent: "border-transparent bg-accent-soft text-accent",
      positive: "border-transparent bg-[color-mix(in_srgb,var(--positive)_14%,transparent)] text-positive",
      negative: "border-transparent bg-[color-mix(in_srgb,var(--negative)_14%,transparent)] text-negative",
      warning: "border-transparent bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
