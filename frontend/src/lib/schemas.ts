/**
 * Zod mirrors of the backend Pydantic schemas (backend/app/schemas). Every API response is parsed
 * through these, so a backend contract change fails loudly instead of rendering garbage.
 */
import { z } from "zod";

const num = z.number();
const optNum = z.number().nullable().optional();

export const healthSchema = z.object({ status: z.literal("ok"), version: z.string(), provider: z.string() });

export const distKindSchema = z.enum(["normal", "truncnormal", "triangular", "uniform", "lognormal"]);
export const distributionSchema = z.object({
  kind: distKindSchema,
  mean: optNum,
  std: optNum,
  low: optNum,
  mode: optNum,
  high: optNum,
});

export const unitSchema = z.enum(["pct", "x", "num", "years"]);
export const assumptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  group: z.string(),
  value: num,
  unit: unitSchema,
  min: num,
  max: num,
  step: num,
  source: z.string(),
  rationale: z.string(),
  description: z.string(),
  stochastic: z.boolean(),
  distribution: distributionSchema.nullable().optional(),
});
export const correlationSchema = z.object({ variables: z.array(z.string()), matrix: z.array(z.array(num)) });
export const assumptionSetSchema = z.object({ items: z.array(assumptionSchema), correlation: correlationSchema });

const qualityWarningSchema = z.object({ code: z.string(), severity: z.enum(["info", "warning", "error"]), message: z.string() });
export const dataQualitySchema = z.object({
  grade: z.enum(["good", "fair", "poor"]),
  years_available: num,
  usable_for_dcf: z.boolean(),
  warnings: z.array(qualityWarningSchema),
});

const profileSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  sector: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  industry_key: z.string().nullable().optional(),
  sector_key: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  quote_type: z.string().nullable().optional(),
  currency: z.string(),
  trading_currency: z.string(),
});

const marketSchema = z.object({
  currency: z.string(),
  price: num,
  shares_outstanding: num,
  market_cap: num,
  beta: optNum,
  total_debt: optNum,
  cash: optNum,
  enterprise_value: optNum,
  fifty_two_week_low: optNum,
  fifty_two_week_high: optNum,
  dividend_per_share: optNum,
  book_value_per_share: optNum,
  return_on_equity: optNum,
  trailing_eps: optNum,
  fx_rate: num,
  trading_currency: z.string(),
  price_in_trading_currency: num,
});

export const financialYearSchema = z.object({
  fiscal_year: num,
  period_end: z.string(),
  revenue: optNum,
  gross_profit: optNum,
  ebitda: optNum,
  ebit: optNum,
  d_and_a: optNum,
  interest_expense: optNum,
  pretax_income: optNum,
  tax_expense: optNum,
  net_income: optNum,
  operating_cash_flow: optNum,
  capex: optNum,
  free_cash_flow: optNum,
  dividends_paid: optNum,
  total_debt: optNum,
  cash: optNum,
  total_equity: optNum,
  minority_interest: optNum,
  total_assets: optNum,
  receivables: optNum,
  inventory: optNum,
  payables: optNum,
  net_working_capital: optNum,
  long_term_investments: optNum,
  shares_outstanding: optNum,
});

const suitabilitySchema = z.object({
  score: num,
  grade: z.enum(["Strong", "Moderate", "Weak", "Poor"]),
  summary: z.string(),
  components: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      weight: num,
      score: optNum,
      metric: optNum,
      metric_label: z.string(),
      reasoning: z.string(),
    }),
  ),
});

const financialValuationSchema = z.object({
  explanation: z.string(),
  pb_roe: z
    .object({ book_value_per_share: num, roe: num, cost_of_equity: num, growth: num, justified_pb: num, value_per_share: num })
    .nullable()
    .optional(),
  ddm: z.object({ dividend_per_share: num, growth: num, cost_of_equity: num, value_per_share: num }).nullable().optional(),
  notes: z.array(z.string()),
  current_price: num,
  upside_pb_roe: optNum,
  upside_ddm: optNum,
});

export const companySchema = z.object({
  profile: profileSchema,
  market: marketSchema,
  financials: z.object({ currency: z.string(), years: z.array(financialYearSchema) }),
  data_quality: dataQualitySchema,
  classification: z.object({
    kind: z.enum(["operating", "bank", "insurer", "nbfc", "reit", "capital_markets"]),
    is_financial: z.boolean(),
    reason: z.string(),
  }),
  suitability: suitabilitySchema.nullable().optional(),
  assumptions: assumptionSetSchema.nullable().optional(),
  financial_valuation: financialValuationSchema.nullable().optional(),
  price_history: z.array(z.object({ date: z.string(), close: num })),
});

const statsSchema = z.object({
  mean: num,
  std: num,
  min: num,
  max: num,
  p5: num,
  p10: num,
  p25: num,
  p50: num,
  p75: num,
  p90: num,
  p95: num,
  histogram: z.array(z.object({ start: num, end: num, count: num })),
  outside_histogram: num,
});

export const terminalMethodSchema = z.enum(["perpetuity", "exit_multiple"]);
export const simSettingsSchema = z.object({
  n_sims: num,
  seed: z.number().nullable(),
  hurdle_irr: num,
  terminal_method: terminalMethodSchema,
  mid_year: z.boolean(),
});

const sourceUseSchema = z.object({ label: z.string(), amount: num, pct: num, ebitda_multiple: optNum });

export const valuationSchema = z.object({
  ticker: z.string(),
  currency: z.string(),
  generated_at: z.string(),
  current_price: num,
  assumptions_used: z.record(z.string(), num),
  settings: simSettingsSchema,
  dcf: z.object({
    years: z.array(
      z.object({
        year: num,
        revenue: num,
        growth: num,
        ebitda: num,
        ebitda_margin: num,
        d_and_a: num,
        ebit: num,
        taxes: num,
        nopat: num,
        capex: num,
        delta_nwc: num,
        ufcf: num,
        discount_factor: num,
        pv_ufcf: num,
      }),
    ),
    wacc: num,
    terminal_growth: num,
    exit_multiple: num,
    mid_year: z.boolean(),
    sum_pv_ufcf: num,
    tv_perpetuity: num,
    tv_exit: num,
    pv_tv_perpetuity: num,
    pv_tv_exit: num,
    ev_perpetuity: num,
    ev_exit: num,
    net_debt: num,
    minority_interest: num,
    non_operating_assets: num,
    equity_perpetuity: num,
    equity_exit: num,
    price_perpetuity: num,
    price_exit: num,
    upside_perpetuity: num,
    upside_exit: num,
    tv_share_perpetuity: num,
    implied_multiple_from_perpetuity: num,
    implied_growth_from_exit: num,
  }),
  lbo: z.object({
    feasible: z.boolean(),
    infeasible_reason: z.string().nullable().optional(),
    offer_price: num,
    offer_premium: num,
    entry_equity_value: num,
    entry_ev: num,
    entry_multiple: num,
    ltm_ebitda: num,
    sources: z.array(sourceUseSchema),
    uses: z.array(sourceUseSchema),
    sponsor_equity: num,
    schedule: z.array(
      z.object({
        year: num,
        revenue: num,
        ebitda: num,
        interest_senior: num,
        interest_sub: num,
        interest_revolver: num,
        taxes: num,
        capex: num,
        delta_nwc: num,
        fcf_before_debt: num,
        mandatory_amortization: num,
        revolver_draw: num,
        revolver_repay: num,
        cash_sweep: num,
        senior_end: num,
        sub_end: num,
        revolver_end: num,
        cash_end: num,
        total_debt: num,
        net_debt: num,
        net_leverage: num,
        interest_coverage: num,
        leverage_breach: z.boolean(),
        coverage_breach: z.boolean(),
      }),
    ),
    exit_year: num,
    exit_multiple: num,
    exit_ev: num,
    exit_net_debt: num,
    exit_equity: num,
    irr: num,
    moic: num,
    max_net_leverage: num,
    min_interest_coverage: num,
  }),
  monte_carlo: z.object({
    n_sims: num,
    seed: z.number().nullable(),
    elapsed_ms: num,
    terminal_method: terminalMethodSchema,
    price: statsSchema,
    enterprise_value: statsSchema,
    prob_price_above_current: num,
    irr: statsSchema.nullable(),
    moic: statsSchema.nullable(),
    prob_irr_above_hurdle: z.number().nullable(),
    prob_loss: z.number().nullable(),
    hurdle_irr: num,
    covenant_breach: z.array(z.object({ year: num, leverage: num, coverage: num, any: num })),
    convergence: z.array(z.object({ n: num, mean: num, lower: num, upper: num })),
    inputs: z.array(
      z.object({ key: z.string(), label: z.string(), unit: z.string(), base: num, mean: num, p5: num, p95: num, distribution: distributionSchema }),
    ),
    correlation: correlationSchema,
    notes: z.array(z.string()),
  }),
  sensitivity: z.object({
    base_price: num,
    base_irr: z.number().nullable(),
    items: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        unit: z.string(),
        low_input: num,
        high_input: num,
        price_low: num,
        price_high: num,
        irr_low: z.number().nullable(),
        irr_high: z.number().nullable(),
        price_swing: num,
      }),
    ),
  }),
  comps: z.object({
    peers: z.array(
      z.object({
        ticker: z.string(),
        name: z.string(),
        currency: z.string().nullable(),
        market_cap: z.number().nullable(),
        enterprise_value: z.number().nullable(),
        ev_ebitda: z.number().nullable(),
        ev_revenue: z.number().nullable(),
        pe: z.number().nullable(),
        included: z.boolean(),
        note: z.string().nullable().optional(),
      }),
    ),
    ranges: z.array(
      z.object({
        metric: z.enum(["ev_ebitda", "ev_revenue", "pe"]),
        label: z.string(),
        count: num,
        low: num,
        median: num,
        high: num,
        implied_price_low: z.number().nullable(),
        implied_price_mid: z.number().nullable(),
        implied_price_high: z.number().nullable(),
      }),
    ),
    source: z.string(),
  }),
  football_field: z.object({
    current_price: num,
    bars: z.array(
      z.object({
        label: z.string(),
        kind: z.enum(["market", "comps", "dcf", "lbo"]),
        low: num,
        high: num,
        mid: z.number().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    ),
  }),
  warnings: z.array(z.string()),
});

export type Distribution = z.infer<typeof distributionSchema>;
export type DistKind = z.infer<typeof distKindSchema>;
export type Assumption = z.infer<typeof assumptionSchema>;
export type AssumptionSet = z.infer<typeof assumptionSetSchema>;
export type Correlation = z.infer<typeof correlationSchema>;
export type Company = z.infer<typeof companySchema>;
export type FinancialYear = z.infer<typeof financialYearSchema>;
export type SimSettings = z.infer<typeof simSettingsSchema>;
export type TerminalMethod = z.infer<typeof terminalMethodSchema>;
export type Valuation = z.infer<typeof valuationSchema>;
export type DistributionStats = z.infer<typeof statsSchema>;
export type Unit = z.infer<typeof unitSchema>;

export interface ValuationRequest {
  ticker: string;
  overrides: Record<string, number>;
  distributions: Record<string, Distribution>;
  correlation?: Correlation | null;
  settings: SimSettings;
  peers?: string[] | null;
}
