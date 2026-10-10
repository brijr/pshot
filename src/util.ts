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
 * Env for apps we launch, so they behave as if the user opened them:
 * - Electron-based hosts export ELECTRON_RUN_AS_NODE=1, which makes Electron apps boot as plain Node.
 * - Agent markers (CLAUDECODE, AI_AGENT, …) make tools like `astro dev` switch to agent mode and
 *   daemonize, which looks like a crash to the app that started them.
 */
const AGENT_ENV = /^(ELECTRON_RUN_AS_NODE$|CLAUDECODE$|CLAUDE_|AI_AGENT$|CODEX_|CURSOR_AGENT|AGENT_)/;

export function cleanEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (AGENT_ENV.test(key)) delete env[key];
  return env;
}
