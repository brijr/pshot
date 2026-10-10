#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { closeBrowser } from "./browser";
import { ROOT } from "./capture";
import { listSims } from "./capture/ios";
import { listWindows } from "./capture/mac";
import { contactSheet } from "./deliver/contact";
import { runShot, type ShotReport } from "./pipeline";
import type { Recipe, Theme } from "./types";

const HELP = `pshot: product shots of your work

  pshot [recipe] [options]       Capture + render a recipe. Defaults to ./shots.yaml;
                                 a bare name runs pshot's own recipes/<name>.yaml.
  pshot init [url]               Write a starter ./shots.yaml for this project
  pshot contact <project>        Rebuild the contact sheet
  pshot windows                  List on-screen macOS windows (for mac sources)
  pshot sims                     List iOS simulators

Options
  --shot a,b       Only these shot ids
  --theme dark     Only one theme
  --out <dir>      Also copy this run's finals into <dir> (e.g. public/work)
  --xl             Render 4800×3600 (captures at 3×)
  --reuse          Reuse existing raw captures/recordings
  --no-motion      Skip videos
  --motion-only    Only videos
  --no-contact     Skip contact sheet

Finals and contact sheets live in ${join(ROOT, "output")}/<project>/.
`;

const TEMPLATE = (project: string, url: string) => `# pshot recipe (see ${join(ROOT, "CLAUDE.md")} for every option)
project: ${project}
defaults:
  web:
    url: ${url}
    viewport: 1280x800

shots:
  # Above the fold, unframed.
  - id: home
    source: { type: web }
    layout: single

  # Close-up running off the right and bottom edges.
  - id: home-corner
    source: { type: web }
    layout: bleed
    options: { edge: corner, zoom: 1.4, insetX: 0.1, insetY: 0.12 }

  # MacBook + iPhone.
  - id: devices
    sources:
      - { type: web, frame: macbook }
      - { type: web, frame: iphone }
    layout: duo
    options: { scale: 0.72, overlap: 0.06, dropB: 0.04 }
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      shot: { type: "string" },
      theme: { type: "string" },
      xl: { type: "boolean", default: false },
      reuse: { type: "boolean", default: false },
      "no-motion": { type: "boolean", default: false },
      "motion-only": { type: "boolean", default: false },
      "no-contact": { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  let [cmd, arg] = positionals;
  if (values.help) return console.log(HELP);
  if (!cmd) {
    if (!existsSync("shots.yaml")) return console.log(HELP);
    cmd = "shots.yaml";
  }

  if (cmd === "init") {
    if (existsSync("shots.yaml")) throw new Error("shots.yaml already exists here");
    const project = basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    await Bun.write("shots.yaml", TEMPLATE(project, arg ?? "http://localhost:3000"));
    console.log(`✓ wrote shots.yaml (project: ${project}). Edit it, then run \`pshot\`.`);
    return;
  }

  if (cmd === "windows") {
    for (const w of await listWindows()) console.log(`${w.id}\t${w.app}\t${w.title}\t${w.width}×${w.height}`);
    return;
  }
  if (cmd === "sims") {
    for (const s of await listSims()) console.log(`${s.state === "Booted" ? "●" : " "} ${s.name}\t${s.udid}`);
    return;
  }
  if (cmd === "contact") {
    console.log(await contactSheet(arg!));
    return;
  }

  const path = existsSync(cmd) ? resolve(cmd) : join(ROOT, "recipes", `${cmd}.yaml`);
  if (!existsSync(path)) throw new Error(`Recipe not found: ${cmd} (no file here, and no ${path})`);
  const recipe = YAML.parse(await Bun.file(path).text()) as Recipe;
  // Relative paths inside a recipe resolve from the recipe's own folder.
  recipe.dir = dirname(path);
  const only = values.shot?.split(",");
  const shots = recipe.shots.filter((s) => !only || only.includes(s.id));
  if (!shots.length) throw new Error(`No matching shots in ${path}`);

  const reports: ShotReport[] = [];
  const failures: string[] = [];
  for (const shot of shots) {
    try {
      reports.push(
        ...(await runShot(recipe, shot, {
          xl: values.xl!,
          reuse: values.reuse!,
          motion: !values["no-motion"],
          stills: !values["motion-only"],
          themes: values.theme ? [values.theme as Theme] : undefined,
        })),
      );
    } catch (e) {
      failures.push(`${shot.id}: ${(e as Error).message}`);
      console.error(`  ✗ ${shot.id}: ${(e as Error).message}`);
    }
  }

  const outDir = join(ROOT, "output", recipe.project);
  // Drop finals from shots that are no longer in the recipe, so they can't be delivered by mistake.
  const ids = new Set(recipe.shots.map((s) => s.id));
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      const m = f.match(/^(.+)-(dark|light)(@xl)?\.(png|mp4)$/);
      if (m && !ids.has(m[1]!)) {
        rmSync(join(outDir, f));
        console.log(`  − removed stale ${f}`);
      }
    }
  }
  if (reports.length) await Bun.write(join(outDir, "_report.json"), JSON.stringify({ reports, failures }, null, 2));
  if (!values["no-contact"] && reports.length) {
    const sheet = await contactSheet(recipe.project);
    if (sheet) console.log(`\ncontact sheet → ${sheet}`);
  }
  if (values.out && reports.length) {
    const dest = resolve(values.out);
    mkdirSync(dest, { recursive: true });
    const files = reports.flatMap((r) => r.outputs);
    for (const f of files) copyFileSync(f, join(dest, basename(f)));
    console.log(`\n→ copied ${files.length} final(s) to ${dest}`);
  }
  const warns = reports.flatMap((r) => r.qa.filter((q) => q.level === "warn").map((q) => `${r.shot}/${r.theme}: ${q.msg}`));
  if (warns.length) console.log(`\n⚠ ${warns.length} QA warning(s):\n  ${warns.join("\n  ")}`);
  if (failures.length) {
    console.log(`\n✗ ${failures.length} shot(s) failed`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
