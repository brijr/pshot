import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { getBrowser } from "../browser";
import { ROOT } from "../capture";
import { THEMES } from "../tokens";
import type { FrameKind, Theme } from "../types";
import { ensureDir } from "../util";
import { FRAMES, type FrameOpts, type FrameRender, type ScreenRect } from "./frames";
import type { LayoutResult } from "./layouts";

export type RenderMode =
  /** Everything. */
  | { kind: "full" }
  /** Background plate for video: everything beneath the video item's screen content. */
  | { kind: "plate"; video: number }
  /** Transparent overlay for video: everything above the video item's screen content. */
  | { kind: "top"; video: number };

export interface RenderInput {
  layout: LayoutResult;
  theme: Theme;
  W: number;
  H: number;
  scale: number;
  frameOpts?: FrameOpts;
  /** Canvas color override for this shot (e.g. a brand field). */
  canvas?: string;
}

export interface QaNote {
  item: number;
  level: "warn" | "info";
  msg: string;
  /** For upscale warnings: output px per source px. */
  upscale?: number;
}

export interface RenderResult {
  /** Screen rects in output pixels, by item index. */
  screens: ScreenRect[];
  qa: QaNote[];
}

const px = (n: number) => `${+n.toFixed(3)}px`;

function screenHtml(s: ScreenRect, src: string | null): string {
  const base = `position:absolute;left:${px(s.x)};top:${px(s.y)};width:${px(s.w)};height:${px(s.h)};`;
  if (s.dropShadow) {
    const img = src ? `<img src="${src}" style="width:100%;height:100%;object-fit:contain;display:block">` : "";
    return `<div style="${base}filter:${s.dropShadow};">${img}</div>`;
  }
  const img = src
    ? `<img src="${src}" style="position:absolute;left:0;top:${px(s.padTop)};width:100%;height:${px(s.h - s.padTop)};object-fit:cover;object-position:top center;display:block">`
    : "";
  return `<div style="${base}border-radius:${s.radius};overflow:hidden;background:${s.fill};isolation:isolate;">${img}</div>`;
}

export function buildHtml(input: RenderInput, mode: RenderMode = { kind: "full" }) {
  const { layout, theme, W, H } = input;
  const t = THEMES[theme];
  const order = layout.items.map((it, i) => ({ it, i })).sort((a, b) => (a.it.z ?? 0) - (b.it.z ?? 0) || a.i - b.i);
  const videoPos = mode.kind === "full" ? -1 : order.findIndex((o) => o.i === mode.video);

  const renders: FrameRender[] = [];
  let body = "";
  order.forEach(({ it, i }, pos) => {
    const frame: FrameKind = it.asset.source.frame ?? "none";
    const r = FRAMES[frame].render(it.asset, it.rect, theme, input.frameOpts ?? {});
    renders[i] = r;
    const src = pathToFileURL(it.asset.path).href;
    if (mode.kind === "full") body += r.under + screenHtml(r.screen, src) + r.over;
    else if (mode.kind === "plate") {
      if (pos < videoPos) body += r.under + screenHtml(r.screen, src) + r.over;
      else if (pos === videoPos) body += r.under + screenHtml(r.screen, null);
    } else {
      if (pos === videoPos) body += r.over;
      else if (pos > videoPos) body += r.under + screenHtml(r.screen, src) + r.over;
    }
  });

  const rotate = layout.rotate ? `transform:rotate(${layout.rotate}deg);transform-origin:50% 50%;` : "";
  const bg = mode.kind === "top" ? "transparent" : (input.canvas ?? t.bg);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${bg};}
    #canvas{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${bg};}
    #group{position:absolute;inset:0;${rotate}}
    img{-webkit-user-drag:none;image-rendering:auto;}
  </style></head><body><div id="canvas"><div id="group">${body}</div></div></body></html>`;
  return { html, renders };
}

function qaFor(input: RenderInput, renders: FrameRender[]): QaNote[] {
  const notes: QaNote[] = [];
  input.layout.items.forEach((it, i) => {
    const s = renders[i]!.screen;
    const cw = s.w;
    const ch = s.h - s.padTop;
    const a = it.asset;
    const cssScale = s.dropShadow ? Math.min(cw / a.width, ch / a.height) : Math.max(cw / a.width, ch / a.height);
    const pxScale = cssScale * input.scale;
    if (pxScale > 1.01) {
      notes.push({
        item: i,
        level: "warn",
        upscale: pxScale,
        msg: `upscaled ${pxScale.toFixed(2)}× (source ${a.width}×${a.height}px, needs ≥${Math.ceil(a.width * pxScale)}px wide). Capture at higher DPR/scale.`,
      });
    }
    if (a.transparent && a.source.type !== "mac" && !a.source.window && !a.source.bare) {
      notes.push({ item: i, level: "info", msg: "source has transparency; set `background` (and maybe `pad`) to flatten it." });
    }
    const assetAspect = a.width / a.height;
    const slotAspect = cw / ch;
    // Tall full-page captures in bleed layouts are expected to crop.
    // Share of the image lost when it covers the slot.
    const cropped = 1 - Math.min(assetAspect, slotAspect) / Math.max(assetAspect, slotAspect);
    const framed = (a.source.frame ?? "none") !== "none";
    // Device screens must be filled exactly; unframed screens tolerate a little crop (and bleed crops by design).
    if (!s.dropShadow && (framed ? cropped > 0.01 : cropped > 0.03 && it.rect.y + it.rect.h <= input.H)) {
      notes.push({
        item: i,
        level: framed || cropped > 0.25 ? "warn" : "info",
        msg: framed
          ? `doesn't match the ${a.source.frame} screen (${assetAspect.toFixed(3)} vs ${slotAspect.toFixed(3)}), ${(cropped * 100).toFixed(1)}% would be cropped. Capture at the device's screen size (web sources fit automatically).`
          : `content cropped to fit (${assetAspect.toFixed(3)} → ${slotAspect.toFixed(3)}); match the viewport to the frame to avoid.`,
      });
    }
  });
  return notes;
}

/** Render a composition to PNG. Returns screen rects in output pixels plus QA notes. */
export async function render(input: RenderInput, out: string, mode: RenderMode = { kind: "full" }): Promise<RenderResult> {
  const { html, renders } = buildHtml(input, mode);
  const dir = join(ROOT, "raw", "_render");
  ensureDir(dir);
  const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  await Bun.write(file, html);

  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: input.W, height: input.H }, deviceScaleFactor: input.scale });
  const page = await ctx.newPage();
  try {
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    });
    const buf = await page.locator("#canvas").screenshot({ omitBackground: mode.kind === "top", type: "png" });
    await sharp(buf).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(out);
  } finally {
    await ctx.close();
  }

  const s = input.scale;
  const screens = renders.map((r) => ({
    ...r.screen,
    x: r.screen.x * s,
    y: r.screen.y * s,
    w: r.screen.w * s,
    h: r.screen.h * s,
    padTop: r.screen.padTop * s,
  }));
  return { screens, qa: mode.kind === "full" ? qaFor(input, renders) : [] };
}
