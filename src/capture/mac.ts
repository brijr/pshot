import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { parseSize } from "../tokens";
import type { MacSource } from "../types";
import { ensureDir, run, sleep } from "../util";

export interface MacWindow {
  id: number;
  pid: number;
  app: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const ROOT = join(import.meta.dir, "../..");

/** Compile a Swift helper into .cache/ once (and again when its source changes). */
async function swiftBinary(name: string) {
  const src = join(ROOT, `src/native/${name}.swift`);
  const bin = join(ROOT, `.cache/${name}`);
  if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) {
    ensureDir(join(ROOT, ".cache"));
    await run(["swiftc", "-O", src, "-o", bin]);
  }
  return bin;
}

const windowsBinary = () => swiftBinary("windows");

/**
 * Capture one window at Retina with its alpha corners and no shadow. ScreenCaptureKit first;
 * `screencapture -l` as a fallback (it fails on some macOS builds even with permission).
 */
export async function captureWindow(win: MacWindow, out: string) {
  try {
    await run([await swiftBinary("capture-window"), String(win.id), out]);
    return;
  } catch {}
  try {
    await run(["screencapture", "-x", "-o", `-l${win.id}`, out]);
    return;
  } catch {}
  // Last resort: the window's on-screen rectangle (it must be frontmost), with macOS's
  // window corners cut back out. Happens when per-window capture is denied but screen capture
  // isn't — usually a stale Screen Recording entry; toggling it off/on restores the above.
  console.log("   ! per-window capture denied; using region capture (toggle Screen Recording off/on to fix)");
  await captureRegionAsWindow(win, out);
}

/** macOS 26+ window corner radius, measured from a native capture. */
const WINDOW_RADIUS_PT = 17;

async function captureRegionAsWindow(win: MacWindow, out: string) {
  // Region capture (-R) can be denied too, so grab the main display and crop the window out.
  const tmp = out.replace(/\.png$/, ".screen.png");
  await run(["screencapture", "-x", "-m", tmp]);
  const screen = await sharp(tmp).metadata();
  const pointsWide = await mainDisplayWidthPoints();
  const s = screen.width! / pointsWide;
  const region = {
    left: Math.round(win.x * s),
    top: Math.round(win.y * s),
    width: Math.round(win.width * s),
    height: Math.round(win.height * s),
  };
  const cropped = await sharp(tmp).extract(region).png().toBuffer();
  await Bun.file(tmp).delete().catch(() => {});
  // Without Screen Recording, macOS returns other apps' windows as black.
  const { channels } = await sharp(cropped).stats();
  if (channels.slice(0, 3).every((c) => c.max < 8)) {
    throw new Error("Screen Recording is denied (captures come back black). Toggle it off/on for this terminal app.");
  }
  const w = region.width;
  const h = region.height;
  const r = WINDOW_RADIUS_PT * s;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  await sharp(cropped)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toFile(out);
}

async function mainDisplayWidthPoints(): Promise<number> {
  const out = await run(["osascript", "-l", "JavaScript", "-e", "ObjC.import('AppKit'); $.NSScreen.mainScreen.frame.size.width"]);
  return parseFloat(out);
}

export async function listWindows(): Promise<MacWindow[]> {
  return JSON.parse(await run([await windowsBinary()]));
}

export async function findWindow(src: Pick<MacSource, "app" | "title">): Promise<MacWindow> {
  const wins = (await listWindows()).filter(
    (w) => w.app.toLowerCase() === src.app.toLowerCase() && (!src.title || w.title.includes(src.title)),
  );
  if (!wins.length) {
    throw new Error(
      `No on-screen window for app "${src.app}"${src.title ? ` titled "${src.title}"` : ""}. ` +
        `Run \`bun shot windows\` to list windows. (If titles are empty, grant Screen Recording to your terminal.)`,
    );
  }
  return wins.sort((a, b) => b.width * b.height - a.width * a.height)[0]!;
}

async function prepare(src: MacSource) {
  if (src.activate !== false) {
    // `open -a` launches if needed (with a clean env) and brings the app forward.
    await run(["open", "-a", src.app]).catch(() => {});
    await sleep(600);
  }
  if (src.size) {
    const [w, h] = parseSize(src.size);
    await run([
      "osascript",
      "-e",
      `tell application "System Events" to tell process "${src.app}" to set size of front window to {${w}, ${h}}`,
    ]);
    await sleep(500);
  }
}

/** Capture a single app window at native Retina resolution, without the system shadow. */
export async function captureMac(src: MacSource, out: string) {
  await prepare(src);
  const win = await findWindow(src);
  await captureWindow(win, out);
}

/** Record a window region to video for `seconds`. */
export async function recordMac(src: MacSource, seconds: number, out: string) {
  await prepare(src);
  const w = await findWindow(src);
  await run(["screencapture", "-x", "-v", `-V${seconds}`, `-R${w.x},${w.y},${w.width},${w.height}`, out]);
}

/** Capture the largest on-screen window owned by a process (no shadow, Retina). */
export async function captureWindowOfPid(pid: number, out: string) {
  const wins = (await listWindows()).filter((w) => w.pid === pid);
  const win = wins.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!win) throw new Error(`No on-screen window for pid ${pid}`);
  await captureWindow(win, out);
}
