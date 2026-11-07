/**
 * Minimal HTTP layer shared by every API call. Kept free of Zod so pages that only need search
 * (every page, via the navbar) don't ship the schema library.
 */
import { API_URL } from "@/lib/utils";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isErrorBody(body: unknown): body is { error: { code: string; message: string; details?: unknown } } {
  const e = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return typeof e?.code === "string" && typeof e?.message === "string";
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("Cannot reach the Rolletto API. Check that the backend is running.", "network_error", 0);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    if (isErrorBody(body)) throw new ApiError(body.error.message, body.error.code, res.status, body.error.details);
    throw new ApiError(`Request failed (${res.status}).`, "http_error", res.status);
  }
  return res;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string | null;
  quote_type?: string | null;
}

function isSearchResult(x: unknown): x is SearchResult {
  const r = x as Partial<SearchResult> | null;
  return typeof r?.symbol === "string" && typeof r?.name === "string";
}

/** Company search with a hand-written runtime check (no schema library needed). */
export async function searchCompanies(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const res = await request(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  const body: unknown = await res.json();
  if (!Array.isArray(body) || !body.every(isSearchResult)) {
    throw new ApiError("The API returned an unexpected response shape.", "schema_mismatch", res.status);
  }
  return body;
}
