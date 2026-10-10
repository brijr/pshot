import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import sharp from "sharp";
import { parseRatio, resolveScheme } from "../tokens";
import type { Asset, Source, Theme } from "../types";
import { ensureParent, log } from "../util";
import { pathToFileURL } from "node:url";
import { captureFigma, rasterizeSvg } from "./figma";
import { captureHtml } from "./html";
import { captureIos } from "./ios";
import { captureMac } from "./mac";
import { captureWeb } from "./web";

export const ROOT = resolve(import.meta.dir, "../..");

/** Which scheme a capture depends on — sources that don't vary by theme share one capture. */
export function captureVariant(src: Source, theme: Theme): string {
  if (src.type === "web" || src.type === "ios") {
    return resolveScheme(src.scheme, theme);
  }
  if (src.type === "file" && src.path.includes("{theme}")) return theme;
  if (src.type === "html") return theme;
  if ((src as { themed?: boolean }).themed) return theme;
  return "any";
}

export interface CaptureOpts {
  project: string;
  key: string;
  theme: Theme;
  dpr: number;
  reuse: boolean;
  /** Recipe folder; relative file paths resolve here first, then from pshot's root. */
  baseDir?: string;
}

export function resolvePath(rel: string, baseDir?: string): string {
  if (isAbsolute(rel)) return rel;
  const local = baseDir ? join(baseDir, rel) : undefined;
  return local && existsSync(local) ? local : join(ROOT, rel);
}

export async function capture(src: Source, o: CaptureOpts): Promise<Asset> {
  const variant = captureVariant(src, o.theme);
  const raw = join(ROOT, "raw", o.project, `${o.key}-${variant}.png`);
  ensureParent(raw);

  if (src.type === "file") {
    const p = resolvePath(src.path.replaceAll("{theme}", o.theme), o.baseDir);
    if (!existsSync(p)) throw new Error(`File not found: ${p}`);
    if (p.toLowerCase().endsWith(".svg")) await rasterizeSvg(await Bun.file(p).text(), raw, src.rasterWidth);
    else await Bun.write(raw, Bun.file(p));
  } else if (!(o.reuse && existsSync(raw))) {
    log(`capture ${src.type} → ${o.key} (${variant})`);
    if (src.type === "web") await captureWeb(src, o.theme, o.dpr, raw);
    else if (src.type === "figma") await captureFigma(src, raw, o.reuse);
    else if (src.type === "mac") await captureMac(src, raw);
    else if (src.type === "ios") await captureIos(src, o.theme, raw);
    else if (src.type === "html") {
      // Capture the template's assets first (any source type), then render the template with them.
      const urls: Record<string, string> = {};
      for (const [name, asset] of Object.entries(src.assets ?? {})) {
        const a = await capture(asset, { ...o, key: `${o.key}-${name}`, dpr: 2 });
        urls[name] = pathToFileURL(a.path).href;
      }
      await captureHtml(src, o.theme, o.dpr, urls, o.baseDir, raw);
    }
  }

  const processed = await postProcess(raw, src);
  return processed;
}

/** Apply crop / aspect, then measure. */
async function postProcess(raw: string, src: Source): Promise<Asset> {
  let img = sharp(raw);
  let { width = 0, height = 0 } = await img.metadata();
  let out = raw;

  if (src.crop || src.aspect) {
    let [x, y, w, h] = src.crop ?? [0, 0, width, height];
    const frac = [x, y, w, h].every((v) => v <= 1);
    if (frac) [x, y, w, h] = [x * width, y * height, w * width, h * height];
    if (src.aspect) {
      const a = parseRatio(src.aspect);
      if (w / h > a) w = h * a; // too wide: trim right
      else h = w / a; // too tall: trim bottom (keep the top of the page)
    }
    const region = { left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) };
    out = raw.replace(/\.png$/, ".proc.png");
    await sharp(raw).extract(region).png().toFile(out);
    ({ width, height } = region);
    img = sharp(out);
  }

  if (src.background || src.pad) {
    const next = raw.replace(/\.png$/, ".bg.png");
    let pipe = sharp(out);
    if (src.background) pipe = pipe.flatten({ background: src.background });
    if (src.pad) {
      const p = Math.round(width * src.pad);
      pipe = pipe.extend({ top: p, bottom: p, left: p, right: p, background: src.background ?? { r: 0, g: 0, b: 0, alpha: 0 } });
      width += 2 * p;
      height += 2 * p;
    }
    await pipe.png().toFile(next);
    out = next;
    img = sharp(out);
  }
  let transparent = !(await img.clone().stats()).isOpaque;
  // Bare transparent artwork: trim empty margins so layouts center what's actually visible.
  if (transparent && src.bare) {
    const next = raw.replace(/\.png$/, ".trim.png");
    const info = await sharp(out).trim({ threshold: 1 }).png().toFile(next);
    out = next;
    width = info.width;
    height = info.height;
    img = sharp(out);
    transparent = true;
  }
  // Alpha-weighted center of the artwork, for optical centering of logos.
  let centroid: Asset["centroid"];
  if (transparent) {
    const n = 64;
    const a = await img.clone().ensureAlpha().resize(n, n, { fit: "fill" }).extractChannel(3).raw().toBuffer();
    let sx = 0, sy = 0, sw = 0;
    for (let i = 0; i < a.length; i++) {
      const w = a[i]!;
      sx += (i % n) * w;
      sy += Math.floor(i / n) * w;
      sw += w;
    }
    if (sw) centroid = { x: (sx / sw + 0.5) / n, y: (sy / sw + 0.5) / n };
  }

  // Sample the top strip (status bar tinting for phone frames).
  const strip = await img
    .clone()
    .extract({ left: 0, top: 0, width, height: Math.max(1, Math.round(height * 0.01)) })
    .removeAlpha()
    .resize(1, 1)
    .raw()
    .toBuffer();
  const [r = 0, g = 0, b = 0] = strip;
  const topLuma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const topColor = `rgb(${r},${g},${b})`;

  // Edge ring: downsample, then average the outermost pixels.
  const n = 24;
  const tiny = await img.clone().removeAlpha().resize(n, n, { fit: "fill" }).raw().toBuffer();
  let sum = 0;
  let count = 0;
  for (let yy = 0; yy < n; yy++) {
    for (let xx = 0; xx < n; xx++) {
      if (xx && yy && xx < n - 1 && yy < n - 1) continue;
      const i = (yy * n + xx) * 3;
      sum += (0.2126 * tiny[i]! + 0.7152 * tiny[i + 1]! + 0.0722 * tiny[i + 2]!) / 255;
      count++;
    }
  }

  return { path: out, width, height, source: src, topLuma, topColor, edgeLuma: sum / count, transparent, centroid };
}
