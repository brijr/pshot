import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseSize } from "../tokens";
import type { MacSource } from "../types";
import { ensureDir, run, sleep } from "../util";

export interface MacWindow {
  id: number;
  app: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const ROOT = join(import.meta.dir, "../..");
const SWIFT_SRC = join(ROOT, "src/native/windows.swift");
const BIN = join(ROOT, ".cache/windows");

async function windowsBinary() {
  if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SWIFT_SRC).mtimeMs) {
    ensureDir(join(ROOT, ".cache"));
    await run(["swiftc", "-O", SWIFT_SRC, "-o", BIN]);
  }
  return BIN;
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
  await run(["screencapture", "-x", "-o", `-l${win.id}`, out]).catch((e) => {
    throw new Error(
      `${e.message}\n  → Grant Screen Recording to the app running this terminal ` +
        `(System Settings → Privacy & Security → Screen & System Audio Recording), then restart it.`,
    );
  });
}

/** Record a window region to video for `seconds`. */
export async function recordMac(src: MacSource, seconds: number, out: string) {
  await prepare(src);
  const w = await findWindow(src);
  await run(["screencapture", "-x", "-v", `-V${seconds}`, `-R${w.x},${w.y},${w.width},${w.height}`, out]);
}
