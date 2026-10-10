import sharp from "sharp";
import { openWebPage } from "../capture/web";
import type { ScreenRect } from "../compose/frames";
import type { Motion, Theme, WebSource } from "../types";
import { log, run } from "../util";

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Record a perfectly smooth eased scroll by stepping the page frame-by-frame and
 * capturing each frame, so there are no dropped frames and no timing jitter.
 */
export async function recordScroll(src: WebSource, theme: Theme, dpr: number, m: Motion, out: string) {
  const fps = m.fps ?? 60;
  const duration = m.duration ?? 4;
  const hold = m.hold ?? 0.6;
  const { page, close } = await openWebPage(src, theme, dpr, { still: false });
  try {
    // Targets: px, "end", or any Playwright selector (incl. :has-text()). Unmatched selectors warn.
    const resolve = async (target: number | string | undefined, fallback: "top" | "end"): Promise<number> => {
      const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      if (target === undefined) return fallback === "end" ? max : 0;
      if (target === "end") return max;
      if (typeof target === "number") return Math.min(target, max);
      const el = page.locator(target).first();
      if (!(await el.count())) {
        console.log(`   ! motion target "${target}" matched nothing; using ${fallback === "end" ? "the end" : "the top"}`);
        return fallback === "end" ? max : 0;
      }
      const top = await el.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
      return Math.min(top, max);
    };
    const from = await resolve(m.from, "top");
    const to = await resolve(m.to, "end");
    await page.evaluate((y) => window.scrollTo(0, y), from);
    await page.waitForTimeout(400);

    const total = Math.round(fps * (duration + hold * 2));
    log(`record scroll ${from}→${Math.round(to)}px, ${total} frames @${fps}fps`);
    const ff = Bun.spawn(
      [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-preset", "medium", "-crf", "8", "-pix_fmt", "yuv444p", out,
      ],
      { stdin: "pipe", stdout: "ignore", stderr: "inherit" },
    );
    const cdp = await page.context().newCDPSession(page);
    for (let f = 0; f < total; f++) {
      const t = Math.min(Math.max((f / fps - hold) / duration, 0), 1);
      const y = from + (to - from) * easeInOutCubic(t);
      await page.evaluate(
        (y) =>
          new Promise<void>((r) => {
            window.scrollTo(0, y);
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
          }),
        y,
      );
      const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 95, optimizeForSpeed: true });
      ff.stdin.write(Buffer.from(data, "base64"));
    }
    ff.stdin.end();
    if ((await ff.exited) !== 0) throw new Error("ffmpeg failed while encoding scroll recording");
  } finally {
    await close();
  }
}

function radii(r: string, scale: number): [number, number, number, number] {
  const v = r.split(/\s+/).map((s) => parseFloat(s) * scale || 0);
  const [a = 0, b = a, c = a, d = b] = v;
  return [a, b, c, d];
}

/** Alpha mask (white = visible) with per-corner radii [tl, tr, br, bl]. */
async function maskPng(w: number, h: number, [tl, tr, br, bl]: number[], out: string) {
  const path = `M${tl},0 H${w - tr} A${tr},${tr} 0 0 1 ${w},${tr} V${h - br} A${br},${br} 0 0 1 ${w - br},${h} H${bl} A${bl},${bl} 0 0 1 0,${h - bl} V${tl} A${tl},${tl} 0 0 1 ${tl},0 Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#000"/><path d="${path}" fill="#fff"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(out);
}

export async function probeDuration(path: string): Promise<number> {
  const out = await run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return parseFloat(out);
}

/**
 * Composite: plate (background, frames) → screen video masked to rounded corners → top overlay.
 * `screen` is in output pixels (from the renderer); `renderScale` converts the radius string.
 */
export async function composite(o: {
  plate: string;
  top: string;
  video: string;
  screen: ScreenRect;
  renderScale: number;
  out: string;
  fps?: number;
}) {
  const s = o.screen;
  const x = Math.round(s.x);
  const y = Math.round(s.y + s.padTop);
  const w = Math.round(s.w);
  const h = Math.round(s.h - s.padTop);
  // Status bar inset → top corners belong to the plate, not the video.
  let [tl, tr, br, bl] = radii(s.radius, o.renderScale);
  if (s.padTop > 0) [tl, tr] = [0, 0];
  const mask = o.out.replace(/\.mp4$/, ".mask.png");
  await maskPng(w, h, [tl, tr, br, bl], mask);
  const duration = await probeDuration(o.video);
  const fps = String(o.fps ?? 60);

  await run([
    "ffmpeg", "-y", "-loglevel", "error",
    "-loop", "1", "-framerate", fps, "-i", o.plate,
    "-i", o.video,
    "-loop", "1", "-framerate", fps, "-i", mask,
    "-loop", "1", "-framerate", fps, "-i", o.top,
    "-filter_complex",
    [
      `[1:v]fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}:0:0,format=rgba[v]`,
      `[2:v]format=gray[m]`,
      `[v][m]alphamerge[vm]`,
      `[0:v][vm]overlay=${x}:${y}:format=auto[b]`,
      `[b][3:v]overlay=0:0:format=auto,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[out]`,
    ].join(";"),
    "-map", "[out]", "-t", String(duration), "-r", fps,
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", o.out,
  ]);
  await Bun.file(mask).delete().catch(() => {});
}
