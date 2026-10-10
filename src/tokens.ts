import type { Theme } from "./types";

/** Base canvas width in CSS px. Everything is laid out on this grid, then rendered at `scale`. */
export const BASE_WIDTH = 1600;

export const SCALE = { standard: 2, xl: 3, motion: 1.5 } as const;

export const THEMES: Record<
  Theme,
  {
    bg: string;
    luma: number;
    hairline: string;
    hairlineStrong: string;
    shadow: string;
    shadowStrong: string;
    dropShadow: string;
  }
> = {
  dark: {
    bg: "#0A0A0A",
    luma: 0.039,
    hairline: "rgba(255,255,255,0.09)",
    hairlineStrong: "rgba(255,255,255,0.16)",
    shadowStrong: "0 2px 4px rgba(0,0,0,.5), 0 24px 64px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.03)",
    // Shadows barely register on near-black; the hairline does the separating.
    shadow: "0 2px 4px rgba(0,0,0,.4), 0 24px 64px rgba(0,0,0,.55)",
    dropShadow: "drop-shadow(0 24px 48px rgba(0,0,0,.55))",
  },
  light: {
    bg: "#FAFAFA",
    luma: 0.98,
    hairline: "rgba(0,0,0,0.06)",
    hairlineStrong: "rgba(0,0,0,0.1)",
    shadowStrong:
      "0 1px 2px rgba(0,0,0,.06), 0 4px 8px rgba(0,0,0,.06), 0 16px 32px rgba(0,0,0,.08), 0 40px 80px rgba(0,0,0,.11)",
    shadow:
      "0 1px 2px rgba(0,0,0,.04), 0 4px 8px rgba(0,0,0,.04), 0 16px 32px rgba(0,0,0,.05), 0 40px 80px rgba(0,0,0,.07)",
    dropShadow: "drop-shadow(0 4px 8px rgba(0,0,0,.05)) drop-shadow(0 32px 64px rgba(0,0,0,.08))",
  },
};

/** Edge-vs-background luminance difference below which edges get strengthened. */
export const CONTRAST_THRESHOLD = 0.1;

/** Resolve a source's color scheme for a shot theme. "cross" = light UI on dark bg and vice versa. */
export function resolveScheme(scheme: string | undefined, theme: Theme): Theme {
  if (!scheme || scheme === "match") return theme;
  if (scheme === "cross") return theme === "dark" ? "light" : "dark";
  return scheme as Theme;
}

/** Default corner radius for an unframed desktop screen, in canvas CSS px. */
export const SCREEN_RADIUS = 10;
/** Unframed mobile screens get radius proportional to width (iPhone display ≈ 14%). */
export const MOBILE_RADIUS_RATIO = 0.12;

export function parseRatio(r = "4:3"): number {
  const [a, b] = r.split(/[:x/]/).map(Number);
  if (!a || !b) throw new Error(`Bad ratio "${r}"`);
  return a / b;
}

export function parseSize(s: string): [number, number] {
  const [w, h] = s.split("x").map(Number);
  if (!w || !h) throw new Error(`Bad size "${s}" (expected WxH)`);
  return [w, h];
}
