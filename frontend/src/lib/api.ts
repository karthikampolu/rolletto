/** Typed API client. Every response is validated with Zod; every failure becomes an ``ApiError``. */
import type { z } from "zod";

import { ApiError, request } from "@/lib/http";
import { companySchema, healthSchema, valuationSchema, type Company, type Valuation, type ValuationRequest } from "@/lib/schemas";

export { ApiError } from "@/lib/http";

async function getJson<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
  const res = await request(path, init);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError("The API returned an unexpected response shape.", "schema_mismatch", res.status, parsed.error.issues);
  }
  return parsed.data;
}

export const api = {
  health: () => getJson(healthSchema, "/api/health"),
  company: (ticker: string): Promise<Company> => getJson(companySchema, `/api/company/${encodeURIComponent(ticker)}`),
  valuation: (body: ValuationRequest, signal?: AbortSignal): Promise<Valuation> =>
    getJson(valuationSchema, "/api/valuation", { method: "POST", body: JSON.stringify(body), signal }),
  exportFile: async (kind: "excel" | "memo", body: ValuationRequest): Promise<{ blob: Blob; filename: string }> => {
    const res = await request(`/api/export/${kind}`, { method: "POST", body: JSON.stringify(body) });
    const disposition = res.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `Rolletto_${body.ticker}.${kind === "excel" ? "xlsx" : "pdf"}`;
    return { blob: await res.blob(), filename };
  },
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
