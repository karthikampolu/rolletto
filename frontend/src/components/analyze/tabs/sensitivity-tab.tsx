"use client";

import { useFmt } from "@/components/analyze/format-context";
import { DataTable, Panel } from "@/components/analyze/tabs/shared";
import { RangeBars } from "@/components/charts/range-bars";
import { C } from "@/components/charts/theme";
import { pct, unitValue } from "@/lib/format";
import type { Valuation } from "@/lib/schemas";

type Item = Valuation["sensitivity"]["items"][number];

export function SensitivityTab({ v }: { v: Valuation }) {
  const fmt = useFmt();
  const s = v.sensitivity;
  const irrItems =
    s.base_irr === null
      ? []
      : [...s.items].sort((a, b) => Math.abs((b.irr_high ?? 0) - (b.irr_low ?? 0)) - Math.abs((a.irr_high ?? 0) - (a.irr_low ?? 0)));

  const rowsFor = (items: Item[], low: (i: Item) => number, high: (i: Item) => number, f: (x: number) => string) =>
    items.map((i) => {
      const a = low(i);
      const b = high(i);
      const lowSideIsLowInput = a <= b;
      return {
        label: i.label,
        low: Math.min(a, b),
        high: Math.max(a, b),
        color: C.positive,
        lowColor: C.negative,
        lowNote: `${f(Math.min(a, b))} @ ${unitValue(lowSideIsLowInput ? i.low_input : i.high_input, i.unit)}`,
        highNote: `${f(Math.max(a, b))} @ ${unitValue(lowSideIsLowInput ? i.high_input : i.low_input, i.unit)}`,
      };
    });

  return (
    <div className="space-y-6">
      <Panel
        title="Tornado · value per share"
        description="Each driver swung from its P10 to its P90 with every other driver held at base. Sorted by impact; labels show the input value at each end."
      >
        <RangeBars
          label="Tornado chart of value per share"
          labelWidth={190}
          format={fmt.price}
          reference={{ value: s.base_price, label: "Base-case value" }}
          rows={rowsFor(
            s.items,
            (i) => i.price_low,
            (i) => i.price_high,
            fmt.price,
          )}
        />
      </Panel>
      {s.base_irr !== null && (
        <Panel title="Tornado · sponsor IRR" description="Same swings applied to the LBO.">
          <RangeBars
            label="Tornado chart of LBO IRR"
            labelWidth={190}
            format={(x) => pct(x, 1)}
            reference={{ value: s.base_irr, label: "Base-case IRR" }}
            rows={rowsFor(
              irrItems,
              (i) => i.irr_low ?? 0,
              (i) => i.irr_high ?? 0,
              (x) => pct(x, 1),
            )}
          />
        </Panel>
      )}
      <Panel title="Sensitivity table">
        <DataTable
          caption="Sensitivity of value and IRR to each driver"
          rowKey={(r) => r.key}
          rows={s.items}
          columns={[
            { key: "l", header: "Driver", align: "left", cell: (r) => r.label },
            { key: "lo", header: "P10 input", cell: (r) => unitValue(r.low_input, r.unit) },
            { key: "hi", header: "P90 input", cell: (r) => unitValue(r.high_input, r.unit) },
            { key: "pl", header: "Value @ P10", cell: (r) => fmt.price(r.price_low) },
            { key: "ph", header: "Value @ P90", cell: (r) => fmt.price(r.price_high) },
            { key: "sw", header: "Swing", cell: (r) => fmt.price(r.price_swing) },
            { key: "il", header: "IRR @ P10", cell: (r) => pct(r.irr_low) },
            { key: "ih", header: "IRR @ P90", cell: (r) => pct(r.irr_high) },
          ]}
        />
      </Panel>
    </div>
  );
}
