import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { FigmaSource } from "../types";
import { sleep } from "../util";

const CACHE = join(import.meta.dir, "../../raw/_figma");
/** Figma exports are reused for an hour (Figma rate-limits its image API). */
const CACHE_MS = 60 * 60 * 1000;

/** Figma API GET with backoff on 429 rate limits (honours Retry-After). */
async function figmaGet(url: string, token: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "X-Figma-Token": token } });
    if (res.status !== 429 || attempt >= 5) return res;
    const wait = Math.min(Number(res.headers.get("retry-after")) || 2 ** attempt * 5, 60);
    console.log(`   ! Figma rate limit; retrying in ${wait}s`);
    await sleep(wait * 1000);
  }
}

/** Render SVG markup to a PNG `width` px wide (vectors stay sharp at any size). */
export async function rasterizeSvg(svg: string, out: string, width = 5000) {
  const base = await sharp(Buffer.from(svg)).metadata();
  const density = Math.min(72 * (width / (base.width || width)), 100000);
  await sharp(Buffer.from(svg), { density }).resize({ width }).png().toFile(out);
}

export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  // /design/:key/... or /file/:key/... or /design/:key/branch/:branchKey/...
  const branch = parts.indexOf("branch");
  const fileKey = branch > -1 ? parts[branch + 1] : parts[1];
  const nodeId = u.searchParams.get("node-id")?.replace(/-/g, ":");
  if (!fileKey || !nodeId) throw new Error(`Figma URL needs a file key and ?node-id=: ${url}`);
  return { fileKey, nodeId };
}

/** Export a Figma node as PNG via the REST API (needs FIGMA_TOKEN). */
export async function captureFigma(src: FigmaSource, out: string, reuse = false) {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error(
      "FIGMA_TOKEN is not set (add it to .env). Alternative: export via the Figma MCP " +
        "(download_assets / get_screenshot) into raw/ and use a `file` source.",
    );
  }
  const parsed = parseFigmaUrl(src.url);
  const fileKey = parsed.fileKey;
  const nodeId = src.node?.replace(/-/g, ":") ?? parsed.nodeId;
  mkdirSync(CACHE, { recursive: true });
  const cacheFile = join(CACHE, `${fileKey}-${nodeId.replace(/:/g, "-")}-${src.format ?? "png"}${src.format === "svg" ? "" : `@${src.scale ?? 4}`}.${src.format === "svg" ? "svg" : "png"}`);
  const cached = existsSync(cacheFile) && (reuse || Date.now() - statSync(cacheFile).mtimeMs < CACHE_MS);
  if (src.format === "svg") {
    if (cached) return rasterizeSvg(await Bun.file(cacheFile).text(), out, src.rasterWidth);
    const api = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=svg&svg_outline_text=true`;
    const res = await figmaGet(api, token);
    if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { err?: string; images: Record<string, string | null> };
    const url = body.images[nodeId];
    if (!url) throw new Error(`Figma returned no SVG for ${nodeId}${body.err ? `: ${body.err}` : ""}`);
    const svg = await (await fetch(url)).text();
    await Bun.write(cacheFile, svg);
    await rasterizeSvg(svg, out, src.rasterWidth);
    return;
  }
  if (cached) {
    await Bun.write(out, Bun.file(cacheFile));
    return;
  }
  // Figma returns a null image when a large render times out: retry, then step the scale down.
  const want = Math.min(src.scale ?? 4, 4);
  const scales = [want, want, Math.min(want, 3), Math.min(want, 2)];
  let lastErr = "";
  for (const scale of scales) {
    const api = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png`;
    const res = await figmaGet(api, token);
    if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { err?: string; images: Record<string, string | null> };
    const imageUrl = body.images[nodeId];
    if (imageUrl) {
      if (scale < want) console.log(`   ! Figma render timed out at ${want}×, exported at ${scale}×`);
      const img = await fetch(imageUrl);
      const buf = await img.arrayBuffer();
      await Bun.write(out, buf);
      await Bun.write(cacheFile, buf);
      return;
    }
    lastErr = body.err ?? "null image";
  }
  throw new Error(`Figma returned no image for ${nodeId}: ${lastErr}`);
}
