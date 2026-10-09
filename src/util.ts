import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function ensureParent(path: string) {
  ensureDir(dirname(path));
}

/** Run a command, returning stdout; throws with stderr on failure. */
export async function run(cmd: string[], opts: { input?: string } = {}): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: opts.input ? "pipe" : "ignore", env: cleanEnv() });
  if (opts.input && proc.stdin) {
    proc.stdin.write(opts.input);
    proc.stdin.end();
  }
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}: ${err.trim() || out.trim()}`);
  return out;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function log(...args: unknown[]) {
  console.log("  ", ...args);
}

/**
 * Env for child processes. Electron-based hosts (editors, agent shells) export
 * ELECTRON_RUN_AS_NODE=1, which makes any Electron app we launch boot as plain Node and exit.
 */
export function cleanEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
