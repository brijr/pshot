import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { getBrowser } from "../browser";
import { ROOT } from "../capture";
import { ensureDir, run } from "../util";

/** Build a review contact sheet of every final in output/<project>/. */
export async function contactSheet(project: string): Promise<string | undefined> {
  const dir = join(ROOT, "output", project);
  const files = readdirSync(dir)
    .filter((f) => !f.startsWith("_") && /\.(png|mp4)$/.test(f))
    .sort();
  if (!files.length) return;

  const thumbs = join(ROOT, "raw", "_render", "thumbs", project);
  ensureDir(thumbs);
  const tiles: { src: string; label: string }[] = [];
  for (const f of files) {
    const p = join(dir, f);
    const t = join(thumbs, `${basename(f)}.jpg`);
    if (f.endsWith(".mp4")) {
      await run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1.5", "-i", p, "-frames:v", "1", "-vf", "scale=800:-2", t]);
    } else {
      await sharp(p).resize(800).jpeg({ quality: 88 }).toFile(t);
    }
    tiles.push({ src: pathToFileURL(t).href, label: f });
  }

  const cols = tiles.length <= 4 ? 2 : 3;
  const html = `<!doctype html><html><head><style>
    body{margin:0;background:#141414;font:500 13px/1.4 -apple-system,system-ui,sans-serif;color:#8a8a8a;}
    .grid{display:grid;grid-template-columns:repeat(${cols},400px);gap:28px 20px;padding:32px;width:max-content}
    img{width:400px;display:block;border-radius:4px;outline:1px solid rgba(255,255,255,.06)}
    .l{margin-top:8px;display:flex;justify-content:space-between}
    h1{font-size:13px;color:#ddd;margin:32px 32px 0;font-weight:600}
  </style></head><body><h1>${project} — ${tiles.length} finals</h1><div class="grid">${tiles
    .map((t) => `<div><img src="${t.src}"><div class="l"><span>${t.label}</span>${t.label.endsWith(".mp4") ? "<span>▶ video</span>" : ""}</div></div>`)
    .join("")}</div></body></html>`;

  const htmlFile = join(thumbs, "_contact.html");
  await Bun.write(htmlFile, html);
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const out = join(dir, "_contact.png");
  try {
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await ctx.close();
  }
  return out;
}
