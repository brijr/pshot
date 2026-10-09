import type { Asset, LayoutKind } from "../types";
import { FRAMES, type Rect } from "./frames";

export interface Placed {
  asset: Asset;
  rect: Rect;
  z?: number;
}

export interface LayoutResult {
  items: Placed[];
  /** Optional rotation (deg) applied to the whole group around the canvas center. */
  rotate?: number;
}

type Opts = Record<string, any>;
type LayoutFn = (assets: Asset[], W: number, H: number, o: Opts) => LayoutResult;

const aspectOf = (a: Asset) => FRAMES[a.source.frame ?? "none"].aspect(a);

function fit(aspect: number, maxW: number, maxH: number) {
  const w = Math.min(maxW, maxH * aspect);
  return { w, h: w / aspect };
}

const center = (W: number, H: number, w: number, h: number, dy = 0): Rect => ({
  x: (W - w) / 2,
  y: (H - h) / 2 + dy,
  w,
  h,
});

/** One screen, centered. `fill` = fraction of the canvas the screen may occupy. */
const single: LayoutFn = ([a], W, H, o) => {
  const asset = a!;
  const fill = o.fill ?? (asset.source.frame && asset.source.frame !== "none" ? 0.84 : 0.8);
  const { w, h } = fit(aspectOf(asset), W * (o.fillX ?? fill), H * (o.fillY ?? fill));
  return { items: [{ asset, rect: center(W, H, w, h, (o.offsetY ?? 0) * H) }] };
};

const detail: LayoutFn = (assets, W, H, o) => single(assets, W, H, { fill: 0.88, ...o });

/** Screen runs off one edge of the canvas. edge: bottom | right | corner. */
const bleed: LayoutFn = ([a], W, H, o) => {
  const asset = a!;
  const aspect = aspectOf(asset);
  const edge = o.edge ?? "bottom";
  const inset = o.inset ?? 0.12;
  if (edge === "right") {
    const h = H * (o.size ?? 0.8);
    return { items: [{ asset, rect: { x: W * inset, y: (H - h) / 2, w: h * aspect, h } }] };
  }
  if (edge === "corner") {
    const w = W * (o.size ?? 0.94);
    return { items: [{ asset, rect: { x: W * inset, y: H * inset, w, h: w / aspect } }] };
  }
  const w = W * (o.size ?? 0.84);
  return { items: [{ asset, rect: { x: (W - w) / 2, y: H * inset, w, h: w / aspect } }] };
};

/** Equal-height row, centered (desktop + mobile, three phones, …). */
const row: LayoutFn = (assets, W, H, o) => {
  const gap = W * (o.gap ?? 0.03);
  const aspects = assets.map(aspectOf);
  const sum = aspects.reduce((s, a) => s + a, 0);
  const maxW = W * (o.fill ?? 0.84);
  const h = Math.min(H * (o.fillY ?? 0.78), (maxW - gap * (assets.length - 1)) / sum);
  const total = h * sum + gap * (assets.length - 1);
  let x = (W - total) / 2;
  const y = (H - h) / 2;
  return {
    items: assets.map((asset, i) => {
      const w = h * aspects[i]!;
      const rect = { x, y, w, h };
      x += w + gap;
      return { asset, rect };
    }),
  };
};

/**
 * Two screens. Unframed → equal-height row. With device frames → a scene where the
 * second device (phone) sits in front of the first at real-world-ish scale.
 */
const duo: LayoutFn = (assets, W, H, o) => {
  const [a, b] = assets as [Asset, Asset];
  const framed = (a.source.frame ?? "none") !== "none" || (b.source.frame ?? "none") !== "none";
  if (!framed && (o.style ?? "row") === "row") return row(assets, W, H, o);

  const scale2 = o.scale ?? 0.62; // second item height relative to the first
  const overlap = o.overlap ?? 0.07; // fraction of canvas width
  const aA = aspectOf(a);
  const aB = aspectOf(b);
  // Solve for first-item height hA so the group fits the box.
  const boxW = W * (o.fill ?? 0.86);
  const boxH = H * (o.fillY ?? 0.78);
  const ov = W * overlap;
  const hA = Math.min(boxH, (boxW + ov) / (aA + aB * scale2));
  const wA = hA * aA;
  const hB = hA * scale2;
  const wB = hB * aB;
  const total = wA + wB - ov;
  const x0 = (W - total) / 2;
  const y0 = (H - hA) / 2;
  return {
    items: [
      { asset: a, rect: { x: x0, y: y0, w: wA, h: hA }, z: 1 },
      { asset: b, rect: { x: x0 + wA - ov, y: y0 + hA - hB + (o.dropB ?? 0.04) * H, w: wB, h: hB }, z: 2 },
    ],
  };
};

/** Uniform grid. cols defaults by count. */
const grid: LayoutFn = (assets, W, H, o) => {
  const n = assets.length;
  const cols = o.cols ?? (n <= 3 ? n : n === 4 ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const gap = W * (o.gap ?? 0.028);
  const a = aspectOf(assets[0]!);
  const boxW = W * (o.fill ?? 0.86);
  const boxH = H * (o.fillY ?? o.fill ?? 0.84);
  const cellW = Math.min((boxW - gap * (cols - 1)) / cols, ((boxH - gap * (rows - 1)) / rows) * a);
  const cellH = cellW / a;
  const totalW = cols * cellW + gap * (cols - 1);
  const totalH = rows * cellH + gap * (rows - 1);
  const x0 = (W - totalW) / 2;
  const y0 = (H - totalH) / 2;
  return {
    items: assets.map((asset, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      // Center a short last row.
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const rowOffset = ((cols - inRow) * (cellW + gap)) / 2;
      const { w, h } = fit(aspectOf(asset), cellW, cellH);
      return {
        asset,
        rect: {
          x: x0 + rowOffset + c * (cellW + gap) + (cellW - w) / 2,
          y: y0 + r * (cellH + gap) + (cellH - h) / 2,
          w,
          h,
        },
      };
    }),
  };
};

/** Cascade of screens with alternating vertical offsets; optional group rotation. */
const stagger: LayoutFn = (assets, W, H, o) => {
  const h = H * (o.size ?? 0.8);
  const gap = W * (o.gap ?? 0.025);
  const off = H * (o.offset ?? 0.08);
  const widths = assets.map((a) => h * aspectOf(a));
  const total = widths.reduce((s, w) => s + w, 0) + gap * (assets.length - 1);
  // Alternate up/down, re-centered so odd counts stay balanced.
  const offsets = assets.map((_, i) => (i % 2 ? off : -off));
  const mean = offsets.reduce((s, v) => s + v, 0) / offsets.length;
  let x = (W - total) / 2;
  return {
    rotate: o.rotate ?? 0,
    items: assets.map((asset, i) => {
      const w = widths[i]!;
      const rect = { x, y: (H - h) / 2 + offsets[i]! - mean, w, h };
      x += w + gap;
      return { asset, rect };
    }),
  };
};

export const LAYOUTS: Record<LayoutKind, LayoutFn> = { single, detail, bleed, duo, row, grid, stagger };
