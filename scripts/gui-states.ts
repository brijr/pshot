#!/usr/bin/env bun
/**
 * Drives the real Gui app (via Playwright's Electron support, like Gui's own e2e suite) through
 * product states and captures the native window for each, in dark and light:
 *
 *   raw/gui/app-preview-<theme>.png   project open, live preview, chat idle
 *   raw/gui/app-pick-<theme>.png      an element picked in the preview
 *   raw/gui/app-compose-<theme>.png   the change written in the chat (not sent)
 *
 * It opens a throwaway copy of ~/Projects/gui/www, so the real project is never touched, and
 * an isolated profile, so your Gui settings and recents never appear. No agent turn is sent.
 *
 *   bun scripts/gui-states.ts [--repo ~/Projects/gui] [--project ~/Projects/gui/www]
 */
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { ROOT } from "../src/capture";
import { captureWindowOfPid } from "../src/capture/mac";
import { cleanEnv, run, sleep } from "../src/util";

const { values } = parseArgs({
  options: {
    /** Gui repo: launched like its e2e suite (repo Electron + built out/). Release builds block automation. */
    repo: { type: "string", default: join(homedir(), "Projects/gui") },
    project: { type: "string", default: join(homedir(), "Projects/gui/www") },
    size: { type: "string", default: "1440x900" },
  },
});

const WORK = join(realpathSync(tmpdir()), "shot-studio-gui");
const PROJECT = join(WORK, "www");
const PROFILE = join(WORK, "profile");
const OUT = join(ROOT, "raw", "gui");
const PICK_SELECTOR = "[data-demo-target]";
const MESSAGE = "Make “real app” semi-bold. Keep the rest of the headline light.";

async function waitFor<T>(check: () => Promise<T | null | undefined | false>, label: string, timeout = 120_000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await check();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await sleep(300);
  }
}

function prepareProject() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const skip = new Set(["node_modules", "dist", "test-results", ".astro", ".wrangler"]);
  cpSync(values.project!, PROJECT, {
    recursive: true,
    filter: (src) => !skip.has(src.split("/").pop()!),
  });
  // Reuse installed dependencies instead of reinstalling into the copy.
  symlinkSync(join(values.project!, "node_modules"), join(PROJECT, "node_modules"));
  writeFileSync(join(PROFILE, "trusted-projects.json"), JSON.stringify([PROJECT]));
  writeFileSync(
    join(PROFILE, "prefs.json"),
    JSON.stringify({ chatSidebar: false, chatCorner: { x: "right", y: "bottom" } }),
  );
}

async function launch(): Promise<ElectronApplication> {
  const env = Object.fromEntries(Object.entries(cleanEnv()).filter(([, v]) => v !== undefined)) as Record<string, string>;
  delete env.NODE_OPTIONS;
  // Not GUI_E2E_BACKGROUND: its "prohibited" activation policy makes windows uncapturable.
  Object.assign(env, { GUI_OPEN: PROJECT, GUI_ACCOUNT_REQUIRED: "0" });
  const repo = values.repo!;
  const executablePath = createRequire(join(repo, "package.json"))("electron") as unknown as string;
  if (!existsSync(join(repo, "out/main"))) throw new Error(`No build in ${repo}/out — run \`bun run build\` there first`);
  return electron.launch({ executablePath, args: [repo, `--user-data-dir=${PROFILE}`], env, timeout: 60_000 });
}

const findPage = (app: ElectronApplication, test: (url: string) => boolean, label: string) =>
  waitFor(async () => app.context().pages().find((p) => test(p.url())), label);

/**
 * Native window capture when Screen Recording allows it; otherwise Electron renders its own
 * window (base + every visible view: preview, chat, pick overlay) and we redraw the macOS
 * chrome — active traffic lights, 17pt corners, window hairline — measured from a native capture.
 */
async function capture(app: ElectronApplication, pid: number, out: string) {
  await app.evaluate(({ app, BrowserWindow }) => {
    app.focus({ steal: true });
    const win = BrowserWindow.getAllWindows().find((w) => w.isVisible() && !w.getParentWindow());
    win?.moveTop();
    win?.focus();
  });
  await sleep(500);
  if (!nativeDenied) {
    try {
      await captureWindowOfPid(pid, out);
      return;
    } catch (e) {
      nativeDenied = true;
      console.log(`   ! native capture unavailable (${(e as Error).message.split("\n")[0]}); rendering via Electron`);
    }
  }
  await captureViaElectron(app, out);
}

let nativeDenied = false;

async function captureViaElectron(app: ElectronApplication, out: string) {
  const shot = await app.evaluate(async ({ BrowserWindow, WebContentsView, nativeTheme }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.isVisible() && !w.getParentWindow())!;
    const [width = 0, height = 0] = win.getContentSize();
    const layers = [{ x: 0, y: 0, png: (await win.webContents.capturePage()).toPNG().toString("base64") }];
    for (const child of win.contentView.children) {
      if (!(child instanceof WebContentsView) || !child.getVisible()) continue;
      const b = child.getBounds();
      if (b.width < 2 || b.height < 2) continue;
      layers.push({ x: b.x, y: b.y, png: (await child.webContents.capturePage()).toPNG().toString("base64") });
    }
    const buttons = (win as any).getWindowButtonPosition?.() ?? null;
    return { width, height, layers, buttons, dark: nativeTheme.shouldUseDarkColors };
  });

  const base = Buffer.from(shot.layers[0]!.png, "base64");
  const meta = await sharp(base).metadata();
  const s = meta.width! / shot.width; // device scale
  const W = Math.round(shot.width * s);
  const H = Math.round(shot.height * s);
  const comps: sharp.OverlayOptions[] = [];
  for (const l of shot.layers.slice(1)) {
    comps.push({ input: Buffer.from(l.png, "base64"), left: Math.round(l.x * s), top: Math.round(l.y * s) });
  }

  // Traffic lights (active): 14pt circles, 23pt apart; Electron reports a custom position if set.
  const bx = (shot.buttons?.x ?? 16) * s;
  const by = (shot.buttons?.y ?? 15) * s;
  const d = 14 * s;
  const lights = [
    ["#FF5F57", "#E2463F"],
    ["#FEBC2E", "#E1A116"],
    ["#28C840", "#1AAB29"],
  ]
    .map(([fill, ring], i) => {
      const cx = bx + i * 23 * s + d / 2;
      const cy = by + d / 2;
      return `<circle cx="${cx}" cy="${cy}" r="${d / 2 - s * 0.25}" fill="${fill}" stroke="${ring}" stroke-width="${s * 0.5}"/>`;
    })
    .join("");
  const r = 17 * s;
  const hairline = shot.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const chrome = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lights}
    <rect x="${s * 0.5}" y="${s * 0.5}" width="${W - s}" height="${H - s}" rx="${r - s * 0.5}" fill="none" stroke="${hairline}" stroke-width="${s}"/></svg>`;
  comps.push({ input: Buffer.from(chrome), left: 0, top: 0 });

  const flat = await sharp(base).resize(W, H).composite(comps).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${r}" fill="#fff"/></svg>`);
  await sharp(flat).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toFile(out);
}

async function main() {
  prepareProject();
  await run(["git", "-C", PROJECT, "init", "-q"]);
  await run(["git", "-C", PROJECT, "add", "-A"]);
  await run(["git", "-C", PROJECT, "-c", "user.name=Gui", "-c", "user.email=gui@example.com", "commit", "-qm", "init"]);
  mkdirSync(OUT, { recursive: true });

  console.log("▸ launching Gui");
  const app = await launch();
  const pid = app.process().pid!;
  try {
    const chrome = await findPage(app, (u) => u.endsWith("/index.html"), "chrome");
    const chat = await findPage(app, (u) => u.endsWith("/chat.html"), "chat");
    await chrome.waitForFunction(() => "gui" in window);
    const state = () => chrome.evaluate(() => (window as any).gui.getState());

    const [w, h] = values.size!.split("x").map(Number);
    await app.evaluate(({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.setSize(w!, h!);
      win.center();
      win.showInactive();
    }, [w, h]);

    console.log("▸ waiting for dev server + preview");
    await waitFor(async () => {
      const s = await state();
      if (s.devServer.status === "exited") throw new Error(`dev server exited: ${s.devServer.lastLine}`);
      return s.devServer.status === "running" && s.preview.visible;
    }, "preview", 180_000).catch(async (e) => {
      const st = await state();
      console.error(JSON.stringify({ devServer: st.devServer, preview: st.preview, project: st.project ?? null }, null, 1).slice(0, 1500));
      throw e;
    });
    const preview: Page = await findPage(app, (u) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(u), "preview page");
    await preview.waitForLoadState("networkidle").catch(() => {});

    for (const theme of ["dark", "light"] as const) {
      console.log(`▸ ${theme}`);
      await app.evaluate(({ nativeTheme }, t) => (nativeTheme.themeSource = t), theme);
      for (const p of [chrome, chat, preview]) await p.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await sleep(1500);

      // 1. Preview, chat idle.
      await chrome.evaluate(() => (window as any).gui.clearSelection?.()).catch(() => {});
      await chat.evaluate(() => (window as any).gui.clearSelection?.()).catch(() => {});
      await sleep(800);
      await capture(app, pid, join(OUT, `app-preview-${theme}.png`));

      // 2. Pick the headline's "real app" like a user: picking on, real click in the overlay.
      if (!(await state()).preview.selecting) await chrome.evaluate(() => (window as any).gui.toggleSelect());
      await waitFor(async () => (await state()).preview.selecting, "picking");
      const box = await preview.locator(PICK_SELECTOR).boundingBox();
      if (!box) throw new Error(`${PICK_SELECTOR} not found in preview`);
      const s = await state();
      const scale = s.preview.frame?.scale ?? s.preview.zoom ?? 1;
      const at = { x: Math.round((box.x + box.width / 2) * scale), y: Math.round((box.y + box.height / 2) * scale) };
      await app.evaluate(({ webContents }, at) => {
        const overlay = webContents.getAllWebContents().find((wc) => wc.getURL().endsWith("/pick.html"));
        if (!overlay) throw new Error("pick overlay missing");
        overlay.sendInputEvent({ type: "mouseMove", ...at });
        overlay.sendInputEvent({ type: "mouseDown", ...at, button: "left", clickCount: 1 });
        overlay.sendInputEvent({ type: "mouseUp", ...at, button: "left", clickCount: 1 });
      }, at);
      await waitFor(async () => (await chat.evaluate(() => (window as any).gui.getChat())).meta.selection.length > 0, "a pick", 20_000);
      // Keep the pointer over the pick so its outline and label stay drawn.
      await app.evaluate(({ webContents }, at) => {
        webContents.getAllWebContents().find((wc) => wc.getURL().endsWith("/pick.html"))?.sendInputEvent({ type: "mouseMove", ...at });
      }, at);
      await sleep(900);
      await capture(app, pid, join(OUT, `app-pick-${theme}.png`));

      // 3. Write the change in the chat (never sent).
      const input = chat.locator("textarea, [contenteditable='true']").first();
      await input.click();
      await input.fill(MESSAGE);
      await sleep(700);
      await capture(app, pid, join(OUT, `app-compose-${theme}.png`));
      await input.fill("");
      await chrome.evaluate(() => (window as any).gui.stopSelecting?.()).catch(() => {});
    }
    console.log(`✓ states → ${OUT}`);
  } finally {
    await Promise.race([app.close().catch(() => {}), sleep(15_000)]);
    if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
