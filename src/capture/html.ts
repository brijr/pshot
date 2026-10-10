import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getBrowser } from "../browser";
import { parseSize } from "../tokens";
import type { HtmlSource, Theme } from "../types";
import { ensureDir } from "../util";
import { resolvePath, ROOT } from "./index";

/** A template path relative to the recipe, or a built-in name from pshot's templates/. */
function templatePath(name: string, baseDir?: string): string {
  const builtin = join(ROOT, "templates", name.endsWith(".html") ? name : `${name}.html`);
  const local = resolvePath(name, baseDir);
  if (existsSync(local) && local.endsWith(".html")) return local;
  if (existsSync(builtin)) return builtin;
  throw new Error(`Template not found: ${name} (looked for ${local} and ${builtin})`);
}

/**
 * Render an HTML template to PNG. {{key}} placeholders come from params, asset file URLs, and {{theme}};
 * {{json}} is all of them as JSON for template scripts.
 */
export async function captureHtml(
  src: HtmlSource,
  theme: Theme,
  dpr: number,
  assets: Record<string, string>,
  baseDir: string | undefined,
  out: string,
) {
  const tpl = templatePath(src.template, baseDir);
  const data: Record<string, unknown> = { ...src.params, ...assets, theme };
  const html = (await Bun.file(tpl).text())
    .replaceAll("{{json}}", JSON.stringify(data).replace(/</g, "\\u003c"))
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => (data[k] == null ? "" : String(data[k])));
  const dir = join(ROOT, "raw", "_render");
  ensureDir(dir);
  const file = join(dir, `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.html`);
  await Bun.write(file, html);

  const [width, height] = parseSize(src.viewport ?? "1200x800");
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: src.dpr ?? dpr, colorScheme: theme });
  const page = await ctx.newPage();
  try {
    await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    await page.screenshot({ path: out, omitBackground: !!src.transparent });
  } finally {
    await ctx.close();
  }
}
