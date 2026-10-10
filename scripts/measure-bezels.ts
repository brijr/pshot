#!/usr/bin/env bun
/**
 * Measures Apple product bezels (assets/bezels/*.png): flood-fills the transparent screen hole from
 * inside the device to find the screen rectangle and its corner radii, and writes
 * assets/bezels/bezels.json for the frame renderer.
 *
 *   bun scripts/measure-bezels.ts
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/capture";

const DIR = join(ROOT, "assets/bezels");

export interface BezelSpec {
  file: string;
  width: number;
  height: number;
  /** Screen hole in bezel pixels. */
  screen: { x: number; y: number; w: number; h: number };
  /** Corner radii of the hole in bezel pixels: [tl, tr, br, bl]. */
  radius: [number, number, number, number];
}

async function measure(file: string): Promise<BezelSpec> {
  const { data, info } = await sharp(join(DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const clear = (i: number) => data[i * 4 + 3]! < 128;

  // Seed inside the screen: the centre, nudged up for laptops/displays whose screen sits high.
  const seeds = [0.5, 0.4, 0.35, 0.3].map((fy) => Math.floor(H * fy) * W + Math.floor(W / 2));
  const seed = seeds.find(clear);
  if (seed === undefined) throw new Error(`${file}: no transparent screen found near the centre`);

  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let sp = 0;
  stack[sp++] = seed;
  seen[seed] = 1;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  while (sp) {
    const i = stack[--sp]!;
    const x = i % W;
    const y = (i - x) / W;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    for (const n of [i - 1, i + 1, i - W, i + W]) {
      if (n < 0 || n >= W * H || seen[n]) continue;
      // Don't wrap rows.
      if ((n === i - 1 && x === 0) || (n === i + 1 && x === W - 1)) continue;
      if (!clear(n)) continue;
      seen[n] = 1;
      stack[sp++] = n;
    }
  }
  if (minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1) {
    throw new Error(`${file}: screen hole touches the image edge (not enclosed)`);
  }

  // Corner radius: diagonal inset d from each corner of the bbox until we hit the hole; r = d / (1 - 1/√2).
  const inHole = (x: number, y: number) => seen[y * W + x] === 1;
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    let d = 0;
    while (d < 400 && !inHole(cx + dx * d, cy + dy * d)) d++;
    return Math.round(d / (1 - Math.SQRT1_2));
  };
  const radius: BezelSpec["radius"] = [
    corner(minX, minY, 1, 1),
    corner(maxX, minY, -1, 1),
    corner(maxX, maxY, -1, -1),
    corner(minX, maxY, 1, -1),
  ];
  return { file, width: W, height: H, screen: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, radius };
}

const out: Record<string, BezelSpec> = {};
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".png")).sort()) {
  const spec = await measure(file);
  out[file.replace(/\.png$/, "")] = spec;
  const s = spec.screen;
  console.log(`${file.padEnd(28)} screen ${s.w}×${s.h} @ ${s.x},${s.y}  aspect ${(s.w / s.h).toFixed(4)}  r ${spec.radius.join("/")}`);
}
await Bun.write(join(DIR, "bezels.json"), JSON.stringify(out, null, 2));
console.log(`→ ${join(DIR, "bezels.json")}`);
