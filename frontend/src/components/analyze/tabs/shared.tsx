import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "positive" | "negative" | "neutral";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-2xs font-medium tracking-wider text-fg-subtle uppercase">{label}</p>
      <p className="mt-2 num text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {sub && (
        <p className={cn("mt-1 num text-xs", tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-fg-subtle")}>
          {sub}
        </p>
      )}
      {children}
    </Card>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  caption,
  rowKey,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  caption: string;
  rowKey: (row: T, i: number) => string;
  rowClassName?: (row: T) => string | undefined;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-max border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-3 py-2 text-2xs font-medium tracking-wider whitespace-nowrap text-fg-subtle uppercase first:pl-0 last:pr-0",
                  c.align === "left" ? "text-left" : "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className={cn("border-b border-border/60 last:border-0", rowClassName?.(r))}>
              {columns.map((c, j) => {
                const Cell = j === 0 ? "th" : "td";
                return (
                  <Cell
                    key={c.key}
                    scope={j === 0 ? "row" : undefined}
                    className={cn(
                      "px-3 py-2 whitespace-nowrap first:pl-0 last:pr-0",
                      c.align === "left" ? "text-left" : "text-right num",
                      j === 0 && "font-normal text-fg-muted",
                      c.className,
                    )}
                  >
                    {c.cell(r)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A statement-style table: rows are line items, columns are periods. */
export function StatementTable({
  caption,
  periods,
  rows,
}: {
  caption: string;
  periods: string[];
  rows: { label: string; values: string[]; strong?: boolean; muted?: boolean; border?: boolean }[];
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-max border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-4 text-left text-2xs font-medium tracking-wider text-fg-subtle uppercase">
              <span className="sr-only">Line item</span>
            </th>
            {periods.map((p) => (
              <th key={p} scope="col" className="px-3 py-2 text-right num text-2xs font-medium tracking-wider text-fg-subtle uppercase last:pr-0">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={cn("border-b border-border/50 last:border-0", r.border && "border-t border-t-border-strong")}>
              <th
                scope="row"
                className={cn(
                  "py-1.5 pr-4 text-left font-normal whitespace-nowrap",
                  r.strong ? "font-medium text-fg" : "text-fg-muted",
                  r.muted && "text-fg-subtle",
                )}
              >
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-1.5 text-right num whitespace-nowrap last:pr-0",
                    r.strong ? "font-medium text-fg" : "text-fg-muted",
                    r.muted && "text-fg-subtle",
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <Icon className="size-6 text-fg-subtle" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-fg">{title}</p>
      <div className="mt-1 max-w-md text-sm text-fg-muted">{children}</div>
    </div>
  );
}
