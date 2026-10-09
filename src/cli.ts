#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { closeBrowser } from "./browser";
import { ROOT } from "./capture";
import { listSims } from "./capture/ios";
import { listWindows } from "./capture/mac";
import { contactSheet } from "./deliver/contact";
import { runShot, type ShotReport } from "./pipeline";
import type { Recipe, Theme } from "./types";

const HELP = `shot-studio

  bun shot <recipe|project> [options]   Capture + render a recipe (recipes/<project>.yaml)
  bun shot contact <project>            Rebuild output/<project>/_contact.png
  bun shot windows                      List on-screen macOS windows (for mac sources)
  bun shot sims                         List iOS simulators

Options
  --shot a,b       Only these shot ids
  --theme dark     Only one theme
  --xl             Render 4800×3600 (captures at 3×)
  --reuse          Reuse existing raw captures/recordings
  --no-motion      Skip videos
  --motion-only    Only videos
  --no-contact     Skip contact sheet
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
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, arg] = positionals;
  if (!cmd || values.help) return console.log(HELP);

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

  const path = existsSync(cmd) ? cmd : join(ROOT, "recipes", `${cmd}.yaml`);
  if (!existsSync(path)) throw new Error(`Recipe not found: ${path}`);
  const recipe = YAML.parse(await Bun.file(path).text()) as Recipe;
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
  if (reports.length) await Bun.write(join(outDir, "_report.json"), JSON.stringify({ reports, failures }, null, 2));
  if (!values["no-contact"] && reports.length) {
    const sheet = await contactSheet(recipe.project);
    if (sheet) console.log(`\ncontact sheet → ${sheet}`);
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
