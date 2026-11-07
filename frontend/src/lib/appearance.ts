/**
 * Appearance settings (palette, typefaces, corners, density, workspace layout). Each setting is a
 * data attribute on <html> read by themes.css; choices persist in localStorage and are re-applied by
 * an inline script before first paint. Light/dark mode is part of the same settings: "system" follows
 * prefers-color-scheme, and the resolved mode is the `dark` class that themes.css keys off.
 */

export const MODES = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "system", name: "System" },
] as const;

export const PALETTES = [
  { id: "midnight", name: "Midnight", tagline: "Institutional navy" },
  { id: "terminal", name: "Terminal", tagline: "Trading-desk amber" },
  { id: "graphite", name: "Graphite", tagline: "Neutral, emerald" },
  { id: "ivory", name: "Ivory", tagline: "Editorial, oxblood" },
  { id: "aurora", name: "Aurora", tagline: "Indigo & violet" },
  { id: "monaco", name: "Monaco", tagline: "Casino felt & gold" },
] as const;

export const FONTS = [
  { id: "inter", name: "Inter" },
  { id: "plex", name: "IBM Plex Sans" },
  { id: "grotesk", name: "Space Grotesk" },
  { id: "manrope", name: "Manrope" },
] as const;

export const MONOS = [
  { id: "jetbrains", name: "JetBrains Mono" },
  { id: "plex", name: "IBM Plex Mono" },
] as const;

export const RADII = [
  { id: "sharp", name: "Sharp" },
  { id: "soft", name: "Soft" },
  { id: "round", name: "Round" },
] as const;

export const DENSITIES = [
  { id: "compact", name: "Compact" },
  { id: "comfortable", name: "Comfortable" },
  { id: "spacious", name: "Spacious" },
] as const;

export const PANELS = [
  { id: "left", name: "Left" },
  { id: "right", name: "Right" },
] as const;

type Ids<T extends readonly { id: string }[]> = T[number]["id"];

export interface Appearance {
  mode: Ids<typeof MODES>;
  palette: Ids<typeof PALETTES>;
  font: Ids<typeof FONTS>;
  mono: Ids<typeof MONOS>;
  radius: Ids<typeof RADII>;
  density: Ids<typeof DENSITIES>;
  panel: Ids<typeof PANELS>;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  palette: "midnight",
  font: "inter",
  mono: "jetbrains",
  radius: "soft",
  density: "comfortable",
  panel: "left",
};

/** Curated combinations: a palette with the typography and shape that suit it. */
export const PRESETS: { palette: Appearance["palette"]; settings: Omit<Appearance, "palette" | "panel" | "mode"> }[] = [
  { palette: "midnight", settings: { font: "inter", mono: "jetbrains", radius: "soft", density: "comfortable" } },
  { palette: "terminal", settings: { font: "plex", mono: "plex", radius: "sharp", density: "compact" } },
  { palette: "graphite", settings: { font: "inter", mono: "jetbrains", radius: "soft", density: "comfortable" } },
  { palette: "ivory", settings: { font: "plex", mono: "plex", radius: "sharp", density: "spacious" } },
  { palette: "aurora", settings: { font: "grotesk", mono: "jetbrains", radius: "round", density: "comfortable" } },
  { palette: "monaco", settings: { font: "manrope", mono: "jetbrains", radius: "soft", density: "comfortable" } },
];

export const STORAGE_KEY = "rolletto-appearance";
const KEYS = Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[];

/** Read the current settings from <html> (the source of truth once the page has loaded). */
export function readAppearance(): Appearance {
  const el = document.documentElement;
  const out = { ...DEFAULT_APPEARANCE };
  for (const k of KEYS) {
    const v = el.getAttribute(`data-${k}`);
    if (v) (out as Record<string, string>)[k] = v;
  }
  return out;
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Set the `dark` class from the chosen mode (system mode follows the OS setting). */
export function syncDarkClass() {
  const mode = document.documentElement.getAttribute("data-mode");
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode !== "light" && systemDark()));
}

export function applyAppearance(a: Appearance) {
  const el = document.documentElement;
  for (const k of KEYS) el.setAttribute(`data-${k}`, a[k]);
  syncDarkClass();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this page view.
  }
}

/** Runs in <head> before paint so saved choices apply without a flash of the default theme. */
export const APPEARANCE_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}"),d=document.documentElement,k=${JSON.stringify(
  KEYS,
)};for(var i=0;i<k.length;i++){var v=a[k[i]];if(typeof v==="string"&&/^[a-z]+$/.test(v))d.setAttribute("data-"+k[i],v)}var m=d.getAttribute("data-mode");d.classList.toggle("dark",m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))}catch(e){}})();`;
