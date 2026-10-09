import type { Theme } from "./types";

/** Base canvas width in CSS px. Everything is laid out on this grid, then rendered at `scale`. */
export const BASE_WIDTH = 1600;

export const SCALE = { standard: 2, xl: 3, motion: 1.5 } as const;

export const THEMES: Record<
  Theme,
  { bg: string; hairline: string; shadow: string; dropShadow: string }
> = {
  dark: {
    bg: "#0A0A0A",
    hairline: "rgba(255,255,255,0.09)",
    // Shadows barely register on near-black; the hairline does the separating.
    shadow: "0 2px 4px rgba(0,0,0,.4), 0 24px 64px rgba(0,0,0,.55)",
    dropShadow: "drop-shadow(0 24px 48px rgba(0,0,0,.55))",
  },
  light: {
    bg: "#FAFAFA",
    hairline: "rgba(0,0,0,0.06)",
    shadow:
      "0 1px 2px rgba(0,0,0,.04), 0 4px 8px rgba(0,0,0,.04), 0 16px 32px rgba(0,0,0,.05), 0 40px 80px rgba(0,0,0,.07)",
    dropShadow: "drop-shadow(0 4px 8px rgba(0,0,0,.05)) drop-shadow(0 32px 64px rgba(0,0,0,.08))",
  },
};

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
