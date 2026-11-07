"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const ORDER = ["dark", "light", "system"] as const;
const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Theme is only known on the client; render a stable placeholder on the server.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const current = mounted ? ((theme as (typeof ORDER)[number]) ?? "system") : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${current}. Switch to ${next}`}
      title={`Theme: ${current}`}
      onClick={() => setTheme(next)}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
