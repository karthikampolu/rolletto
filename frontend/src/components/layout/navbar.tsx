"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { TickerSearch } from "@/components/search/ticker-search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
];

function Links({ pathname }: { pathname: string | null }) {
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {LINKS.map((l) => {
        const active = pathname?.startsWith(l.href) ?? false;
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-sm text-fg-muted transition-colors hover:text-fg",
                active && "text-fg",
              )}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveLinks() {
  return <Links pathname={usePathname()} />;
}

/** The compact search is hidden on the home page, which has its own hero search. */
function NavSearch() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <TickerSearch className="hidden w-72 lg:block" placeholder="Search ticker…" />;
}

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Rolletto home" className="shrink-0 rounded-md">
          <Logo />
        </Link>
        <React.Suspense fallback={<Links pathname={null} />}>
          <ActiveLinks />
        </React.Suspense>
        <div className="ml-auto flex items-center gap-2">
          <React.Suspense fallback={null}>
            <NavSearch />
          </React.Suspense>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </nav>
      {open && (
        <div className="border-t border-border px-4 pt-3 pb-4 md:hidden">
          <TickerSearch placeholder="Search ticker…" />
          <ul className="mt-3 flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
