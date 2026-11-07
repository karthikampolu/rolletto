"use client";

import { useFmt } from "@/components/analyze/format-context";
import { Panel, StatementTable } from "@/components/analyze/tabs/shared";
import { ProjectionChart } from "@/components/charts/line-charts";
import { pct } from "@/lib/format";
import type { Company, FinancialYear } from "@/lib/schemas";

type Key = keyof FinancialYear;

const SECTIONS: { title: string; rows: { key: Key; label: string; strong?: boolean }[] }[] = [
  {
    title: "Income statement",
    rows: [
      { key: "revenue", label: "Revenue", strong: true },
      { key: "gross_profit", label: "Gross profit" },
      { key: "ebitda", label: "EBITDA", strong: true },
      { key: "d_and_a", label: "D&A" },
      { key: "ebit", label: "EBIT" },
      { key: "interest_expense", label: "Interest expense" },
      { key: "pretax_income", label: "Pre-tax income" },
      { key: "tax_expense", label: "Tax expense" },
      { key: "net_income", label: "Net income", strong: true },
    ],
  },
  {
    title: "Balance sheet",
    rows: [
      { key: "total_assets", label: "Total assets", strong: true },
      { key: "cash", label: "Cash & short-term investments" },
      { key: "receivables", label: "Receivables" },
      { key: "inventory", label: "Inventory" },
      { key: "payables", label: "Payables" },
      { key: "net_working_capital", label: "Operating NWC" },
      { key: "long_term_investments", label: "Long-term investments" },
      { key: "total_debt", label: "Total debt", strong: true },
      { key: "minority_interest", label: "Minority interest" },
      { key: "total_equity", label: "Shareholders’ equity", strong: true },
    ],
  },
  {
    title: "Cash flow",
    rows: [
      { key: "operating_cash_flow", label: "Operating cash flow", strong: true },
      { key: "capex", label: "Capital expenditure" },
      { key: "free_cash_flow", label: "Free cash flow", strong: true },
      { key: "dividends_paid", label: "Dividends paid" },
    ],
  },
];

export function FinancialsTab({ company }: { company: Company }) {
  const fmt = useFmt();
  const years = company.financials.years;
  const periods = years.map((y) => `FY${y.fiscal_year}`);
  const chartRows = years
    .filter((y) => y.revenue && y.ebitda)
    .map((y) => ({
      label: `FY${String(y.fiscal_year).slice(-2)}`,
      revenue: y.revenue!,
      ebitda: y.ebitda!,
      margin: y.ebitda! / y.revenue!,
      historical: true,
    }));

  return (
    <div className="space-y-6">
      <Panel
        title="Revenue and EBITDA history"
        description={`Cleaned annual statements, ${fmt.ccy}. Missing values are shown as “—”, never estimated.`}
      >
        <ProjectionChart rows={chartRows} format={fmt.money} />
      </Panel>
      {SECTIONS.map((s) => (
        <Panel key={s.title} title={s.title} description={fmt.scaleLabel}>
          <StatementTable
            caption={s.title}
            periods={periods}
            rows={s.rows.map((r) => ({
              label: r.label,
              strong: r.strong,
              values: years.map((y) => fmt.table(y[r.key] as number | null | undefined)),
            }))}
          />
        </Panel>
      ))}
      <Panel title="Ratios">
        <StatementTable
          caption="Key ratios"
          periods={periods}
          rows={[
            { label: "EBITDA margin", values: years.map((y) => pct(y.ebitda && y.revenue ? y.ebitda / y.revenue : null)) },
            { label: "Capex % revenue", values: years.map((y) => pct(y.capex != null && y.revenue ? y.capex / y.revenue : null)) },
            {
              label: "FCF conversion (FCF / EBITDA)",
              values: years.map((y) => pct(y.free_cash_flow != null && y.ebitda ? y.free_cash_flow / y.ebitda : null)),
            },
            {
              label: "Effective tax rate",
              values: years.map((y) => pct(y.tax_expense != null && y.pretax_income ? y.tax_expense / y.pretax_income : null)),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
