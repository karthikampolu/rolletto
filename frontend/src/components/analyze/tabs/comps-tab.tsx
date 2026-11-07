"use client";

import { Plus, RotateCcw, Users, X } from "lucide-react";
import * as React from "react";

import { useFmt } from "@/components/analyze/format-context";
import { DataTable, EmptyState, Panel } from "@/components/analyze/tabs/shared";
import { RangeBars } from "@/components/charts/range-bars";
import { C } from "@/components/charts/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, multiple } from "@/lib/format";
import type { Valuation } from "@/lib/schemas";

const BAR_COLOR = { market: C.market, comps: C.comps, dcf: C.dcf, lbo: C.lbo } as const;
type Peer = Valuation["comps"]["peers"][number];

export function CompsTab({ v, customPeers, onPeers }: { v: Valuation; customPeers: boolean; onPeers: (p: string[] | null) => void }) {
  const fmt = useFmt();
  const [draft, setDraft] = React.useState("");
  const tickers = v.comps.peers.map((p) => p.ticker);

  const add = () => {
    const t = draft.trim().toUpperCase();
    if (!t || tickers.includes(t) || tickers.length >= 12) return;
    onPeers([...tickers, t]);
    setDraft("");
  };

  return (
    <div className="space-y-6">
      <Panel title="Football field" description="Value per share implied by each method; ticks mark midpoints. The dashed line is today’s price.">
        <RangeBars
          label="Football field"
          labelWidth={230}
          format={fmt.price}
          reference={{ value: v.current_price, label: "Current price" }}
          rows={v.football_field.bars.map((b) => ({ label: b.label, low: b.low, high: b.high, mid: b.mid, color: BAR_COLOR[b.kind] }))}
        />
        <ul className="mt-4 grid gap-1 text-2xs text-fg-subtle sm:grid-cols-2">
          {v.football_field.bars
            .filter((b) => b.note)
            .map((b) => (
              <li key={b.label}>
                <span className="text-fg-muted">{b.label}:</span> {b.note}
              </li>
            ))}
        </ul>
      </Panel>

      <Panel
        title="Peer set"
        description={v.comps.source}
        actions={
          customPeers && (
            <Button variant="ghost" size="sm" onClick={() => onPeers(null)}>
              <RotateCcw aria-hidden="true" /> Automatic peers
            </Button>
          )
        }
      >
        <form
          className="mb-4 flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add peer ticker, e.g. PEP or INFY.NS"
            aria-label="Add peer ticker"
            className="num"
          />
          <Button type="submit" variant="secondary" disabled={!draft.trim()}>
            <Plus aria-hidden="true" /> Add
          </Button>
        </form>
        {v.comps.peers.length === 0 ? (
          <EmptyState icon={Users} title="No peers found">
            Yahoo Finance returned no usable peers for this industry. Add tickers above to build a comps set.
          </EmptyState>
        ) : (
          <DataTable<Peer>
            caption="Comparable companies"
            rowKey={(p) => p.ticker}
            rows={v.comps.peers}
            rowClassName={(p) => (p.included ? undefined : "opacity-60")}
            columns={[
              {
                key: "t",
                header: "Peer",
                align: "left",
                cell: (p) => (
                  <span className="flex items-center gap-2">
                    <span className="num text-fg">{p.ticker}</span>
                    <span className="max-w-48 truncate text-fg-subtle">{p.name}</span>
                    {!p.included && <Badge tone="warning">excluded</Badge>}
                  </span>
                ),
              },
              { key: "mc", header: "Market cap", cell: (p) => (p.currency ? money(p.market_cap, p.currency) : "—") },
              { key: "e", header: "EV / EBITDA", cell: (p) => multiple(p.ev_ebitda) },
              { key: "r", header: "EV / Revenue", cell: (p) => multiple(p.ev_revenue, 2) },
              { key: "pe", header: "P / E", cell: (p) => multiple(p.pe) },
              {
                key: "x",
                header: "",
                cell: (p) => (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${p.ticker}`}
                    onClick={() => onPeers(tickers.filter((t) => t !== p.ticker))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Panel>

      {v.comps.ranges.length > 0 && (
        <Panel
          title="Implied valuation from multiples"
          description="Interquartile range of peer multiples applied to the target’s LTM EBITDA, revenue and EPS."
        >
          <DataTable
            caption="Implied valuation from peer multiples"
            rowKey={(r) => r.metric}
            rows={v.comps.ranges}
            columns={[
              { key: "m", header: "Multiple", align: "left", cell: (r) => r.label },
              { key: "n", header: "Peers", cell: (r) => r.count },
              { key: "lo", header: "P25", cell: (r) => multiple(r.low) },
              { key: "md", header: "Median", cell: (r) => multiple(r.median) },
              { key: "hi", header: "P75", cell: (r) => multiple(r.high) },
              { key: "pl", header: "Price @ P25", cell: (r) => fmt.price(r.implied_price_low) },
              { key: "pm", header: "Price @ median", cell: (r) => fmt.price(r.implied_price_mid) },
              { key: "ph", header: "Price @ P75", cell: (r) => fmt.price(r.implied_price_high) },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}
