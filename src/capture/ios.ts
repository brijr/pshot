import { resolveScheme } from "../tokens";
import type { IosSource, Theme } from "../types";
import { run, sleep } from "../util";

interface Sim {
  udid: string;
  name: string;
  state: string;
}

export async function listSims(): Promise<Sim[]> {
  const json = JSON.parse(await run(["xcrun", "simctl", "list", "devices", "available", "-j"]));
  return Object.values(json.devices as Record<string, Sim[]>).flat();
}

async function resolveDevice(device?: string): Promise<string> {
  const sims = await listSims();
  if (!device) {
    const booted = sims.find((s) => s.state === "Booted");
    if (!booted) throw new Error("No booted simulator. Boot one or set `device` in the recipe (`pshot sims`).");
    return booted.udid;
  }
  const sim = sims.find((s) => s.udid === device || s.name === device);
  if (!sim) throw new Error(`Simulator "${device}" not found (\`pshot sims\`).`);
  if (sim.state !== "Booted") {
    await run(["xcrun", "simctl", "boot", sim.udid]);
    await run(["xcrun", "simctl", "bootstatus", sim.udid]);
  }
  return sim.udid;
}

/** Boot, clean the status bar, set appearance, open the app/URL. Returns the UDID. */
async function prepare(src: IosSource, theme: Theme): Promise<string> {
  const udid = await resolveDevice(src.device);
  const appearance = resolveScheme(src.scheme, theme);
  await run(["xcrun", "simctl", "ui", udid, "appearance", appearance]);
  await run([
    "xcrun", "simctl", "status_bar", udid, "override",
    "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3",
    "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "discharging", "--batteryLevel", "100",
  ]);
  if (src.app) await run(["xcrun", "simctl", "launch", udid, src.app]);
  if (src.url) await run(["xcrun", "simctl", "openurl", udid, src.url]);
  await sleep(src.delay ?? 1500);
  return udid;
}

export async function captureIos(src: IosSource, theme: Theme, out: string) {
  const udid = await prepare(src, theme);
  await run(["xcrun", "simctl", "io", udid, "screenshot", "--type=png", out]);
}

/** Record the simulator screen for `seconds` (interact with the simulator meanwhile if needed). */
export async function recordIos(src: IosSource, theme: Theme, seconds: number, out: string) {
  const udid = await prepare(src, theme);
  const proc = Bun.spawn(["xcrun", "simctl", "io", udid, "recordVideo", "--codec=h264", "--force", out], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await sleep(seconds * 1000 + 500);
  proc.kill("SIGINT");
  await proc.exited;
}
