/** Encode workspace state (overrides, settings, distributions, peers) into a compact URL-safe string. */
import { z } from "zod";

import { distributionSchema, simSettingsSchema, type Distribution, type SimSettings } from "@/lib/schemas";

export interface ShareState {
  overrides: Record<string, number>;
  distributions: Record<string, Distribution>;
  settings: SimSettings;
  peers: string[] | null;
}

const shareSchema = z.object({
  o: z.record(z.string(), z.number()).default({}),
  d: z.record(z.string(), distributionSchema).default({}),
  s: simSettingsSchema.partial().default({}),
  p: z.array(z.string()).nullable().default(null),
});

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShare(state: ShareState, defaults: SimSettings): string {
  const s: Partial<SimSettings> = {};
  (Object.keys(state.settings) as (keyof SimSettings)[]).forEach((k) => {
    if (state.settings[k] !== defaults[k]) (s as Record<string, unknown>)[k] = state.settings[k];
  });
  const payload = { o: state.overrides, d: state.distributions, s, p: state.peers };
  const empty = !Object.keys(state.overrides).length && !Object.keys(state.distributions).length && !Object.keys(s).length && !state.peers;
  return empty ? "" : toBase64Url(JSON.stringify(payload));
}

export function decodeShare(encoded: string | null, defaults: SimSettings): ShareState | null {
  if (!encoded) return null;
  try {
    const parsed = shareSchema.parse(JSON.parse(fromBase64Url(encoded)));
    return { overrides: parsed.o, distributions: parsed.d, settings: { ...defaults, ...parsed.s }, peers: parsed.p };
  } catch {
    return null;
  }
}
