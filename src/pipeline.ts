import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { capture, captureVariant, resolvePath, ROOT } from "./capture";
import { recordIos } from "./capture/ios";
import { recordMac } from "./capture/mac";
import { frameViewport } from "./compose/frames";
import { LAYOUTS } from "./compose/layouts";
import { render, type QaNote, type RenderInput } from "./compose/render";
import { composite, recordScroll } from "./motion";
import { BASE_WIDTH, parseRatio, SCALE } from "./tokens";
import type { Asset, Recipe, Shot, Source, Theme } from "./types";
import { ensureDir, ensureParent, log } from "./util";

export interface RunOpts {
  xl: boolean;
  reuse: boolean;
  motion: boolean;
  stills: boolean;
  themes?: Theme[];
}

export interface ShotReport {
  shot: string;
  theme: Theme;
  outputs: string[];
  qa: QaNote[];
}

function resolveSources(recipe: Recipe, shot: Shot): Source[] {
  const statusBar = (shot.options as { statusBar?: boolean } | undefined)?.statusBar;
  const list = shot.sources ?? (shot.source ? [shot.source] : []);
  if (!list.length) throw new Error(`Shot "${shot.id}" has no source(s)`);
  return list.map((s) => {
    if (s.type !== "web") return s;
    const merged = { ...recipe.defaults?.web, ...s };
    if (s.frame && s.frame !== "none") {
      // Framed: the viewport always matches the device screen exactly (width kept if given).
      const fit = frameViewport(s.frame, s.viewport, { statusBar })!;
      if (s.viewport && s.viewport !== fit) log(`↔ ${shot.id}: viewport ${s.viewport} → ${fit} to fit the ${s.frame} screen`);
      merged.viewport = fit;
    } else {
      merged.viewport = s.viewport ?? recipe.defaults?.web?.viewport ?? "1440x900";
    }
    return merged;
  });
}

export async function runShot(recipe: Recipe, shot: Shot, o: RunOpts): Promise<ShotReport[]> {
  const sources = resolveSources(recipe, shot);
  const themes = o.themes ?? shot.themes ?? recipe.defaults?.themes ?? ["dark", "light"];
  const layoutKind = shot.layout ?? recipe.defaults?.layout ?? (sources.length > 1 ? "row" : "single");
  const ratio = parseRatio(shot.ratio ?? recipe.defaults?.ratio ?? "4:3");
  const W = BASE_WIDTH;
  const H = Math.round(W / ratio);
  const scale = o.xl ? SCALE.xl : SCALE.standard;
  const outDir = join(ROOT, "output", recipe.project);
  ensureDir(outDir);
  const reports: ShotReport[] = [];

  for (const theme of themes) {
    console.log(`\n▸ ${shot.id} · ${theme}`);
    const assets: Asset[] = [];
    const dprs: number[] = sources.map(() => scale);
    for (const [i, src] of sources.entries()) {
      assets.push(
        await capture(src, { project: recipe.project, key: `${shot.id}-${i}`, theme, dpr: scale, reuse: o.reuse, baseDir: recipe.dir }),
      );
    }
    const layout = LAYOUTS[layoutKind](assets, W, H, shot.options ?? {});
    const frameOpts = shot.options as RenderInput["frameOpts"];
    const report: ShotReport = { shot: shot.id, theme, outputs: [], qa: [] };

    // Motion shots are video-only unless `options.still: true`.
    if (o.stills && (!shot.motion || shot.options?.still || !o.motion)) {
      const out = join(outDir, `${shot.id}-${theme}${o.xl ? "@xl" : ""}.png`);
      let res = await render({ layout, theme, W, H, scale, frameOpts }, out);

      // Auto-DPR: re-capture upscaled web sources at the density the layout needs. Repeats, since a
      // reused raw capture's density isn't known up front; the second pass is exact.
      for (let pass = 0; pass < 3; pass++) {
        const retry = res.qa.filter((n) => n.upscale && sources[n.item]!.type === "web" && !(sources[n.item] as any).dpr);
        if (!retry.length) break;
        for (const n of retry) {
          const dpr = Math.min(Math.ceil(dprs[n.item]! * n.upscale! * 1.02 * 100) / 100, 5);
          if (dpr <= dprs[n.item]! && pass > 0) continue; // at the cap
          log(`↻ item ${n.item}: re-capturing at ${dpr}× to avoid upscaling`);
          dprs[n.item] = dpr;
          const src = { ...sources[n.item]!, dpr } as Source;
          const fresh = await capture(src, { project: recipe.project, key: `${shot.id}-${n.item}`, theme, dpr, reuse: false, baseDir: recipe.dir });
          assets[n.item] = { ...fresh, source: sources[n.item]! };
        }
        Object.assign(layout, LAYOUTS[layoutKind](assets, W, H, shot.options ?? {}));
        res = await render({ layout, theme, W, H, scale, frameOpts }, out);
      }
      report.outputs.push(out);
      report.qa.push(...res.qa);
      log(`✓ ${out.replace(ROOT + "/", "")}`);
      for (const n of res.qa) log(`${n.level === "warn" ? "⚠" : "·"} item ${n.item}: ${n.msg}`);
    }

    if (o.motion && shot.motion) {
      const m = shot.motion;
      const idx = m.item ?? 0;
      const src = assets[idx]!.source;
      if (layout.rotate) throw new Error(`Shot "${shot.id}": motion can't be combined with a rotated layout.`);
      const video = join(ROOT, "raw", recipe.project, `${shot.id}-${idx}-${captureVariant(src, theme)}.motion.mp4`);
      ensureParent(video);
      if (m.path) {
        const p = resolvePath(m.path, recipe.dir);
        await Bun.write(video, Bun.file(p));
      } else if (!(o.reuse && existsSync(video))) {
        if (src.type === "web") await recordScroll(src, theme, (src as any).dpr ?? Math.max(2, dprs[idx]!), m, video);
        else if (src.type === "ios") await recordIos(src, theme, m.record ?? 6, video);
        else if (src.type === "mac") await recordMac(src, m.record ?? 6, video);
        else throw new Error(`Shot "${shot.id}": motion needs a web/ios/mac source or motion.path`);
      }
      const ms = SCALE.motion;
      const input: RenderInput = { layout, theme, W, H, scale: ms, frameOpts };
      const plate = video.replace(/\.mp4$/, ".plate.png");
      const top = video.replace(/\.mp4$/, ".top.png");
      const { screens } = await render(input, plate, { kind: "plate", video: idx });
      await render(input, top, { kind: "top", video: idx });
      const out = join(outDir, `${shot.id}-${theme}.mp4`);
      await composite({ plate, top, video, screen: screens[idx]!, renderScale: ms, out, fps: m.fps });
      report.outputs.push(out);
      log(`✓ ${out.replace(ROOT + "/", "")}`);
    }
    reports.push(report);
  }
  return reports;
}
