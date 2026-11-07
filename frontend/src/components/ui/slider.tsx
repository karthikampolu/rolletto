"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("relative flex h-5 w-full touch-none items-center select-none", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-3">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props["aria-label"]}
        className="block size-3.5 cursor-grab rounded-full border-2 border-accent bg-bg-elevated shadow-token-sm transition-transform hover:scale-110 focus-visible:scale-110"
      />
    </SliderPrimitive.Root>
  );
}
