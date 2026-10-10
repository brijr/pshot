import type { Page } from "playwright";
import { getBrowser } from "../browser";
import { parseSize, resolveScheme } from "../tokens";
import type { Action, Theme, WebSource } from "../types";

/** Common cookie / consent / chat overlays. Recipes add their own via `hide`. */
const DEFAULT_HIDE = [
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  ".cky-consent-container",
  "[class*='cookie-banner']",
  "[id*='cookie-banner']",
  "#intercom-container",
  ".intercom-lightweight-app",
  "#crisp-chatbox",
  "[data-nextjs-toast]",
  "nextjs-portal",
  "vercel-live-feedback",
];

const STILL_CSS = `
  *, *::before, *::after {
    animation-play-state: paused !important;
    animation-delay: -0.0001s !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

const BASE_CSS = `
  html { scroll-behavior: auto !important; }
  ::-webkit-scrollbar { display: none !important; }
  html, body { scrollbar-width: none !important; }
`;

export interface OpenedPage {
  page: Page;
  close: () => Promise<void>;
}

/** Open a page fully prepared for capture (viewport, scheme, overlays hidden, fonts loaded). */
export async function openWebPage(
  src: WebSource,
  theme: Theme,
  dpr: number,
  opts: { still: boolean },
): Promise<OpenedPage> {
  const [width, height] = parseSize(src.viewport ?? "1440x900");
  const scheme = resolveScheme(src.scheme, theme);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: src.dpr ?? dpr,
    colorScheme: scheme,
    reducedMotion: opts.still && !src.animations ? "reduce" : "no-preference",
    isMobile: width < 600,
    hasTouch: width < 600,
  });
  if (src.storage) {
    const entries = Object.entries(src.storage).map(([k, v]) => [k, v.replaceAll("{theme}", scheme)]);
    await context.addInitScript((entries) => {
      for (const [k, v] of entries) localStorage.setItem(k!, v!);
    }, entries);
  }
  const page = await context.newPage();
  await page.goto(src.url, { waitUntil: "load", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const hide = [...DEFAULT_HIDE, ...(src.hide ?? [])];
  await page.addStyleTag({
    content: `${BASE_CSS}\n${hide.join(",\n")} { display: none !important; }\n${src.css ?? ""}`,
  });

  // Trigger lazy-loaded content and scroll-reveal animations, then return to the top.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.75;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  for (const action of src.actions ?? []) await runAction(page, action);
  if (src.waitFor) await page.waitForSelector(src.waitFor, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(src.delay ?? 800);
  if (opts.still && !src.animations) await page.addStyleTag({ content: STILL_CSS });

  return { page, close: () => context.close() };
}

async function runAction(page: Page, a: Action) {
  if ("click" in a) await page.click(a.click);
  else if ("hover" in a) await page.hover(a.hover);
  else if ("type" in a) await page.fill(a.type[0], a.type[1]);
  else if ("press" in a) await page.keyboard.press(a.press);
  else if ("wait" in a) await page.waitForTimeout(a.wait);
  else if ("scroll" in a) await scrollTo(page, a.scroll);
  else if ("eval" in a) await page.evaluate(a.eval);
  await page.waitForTimeout(250);
}

export async function scrollTo(page: Page, target: number | string) {
  if (typeof target === "number") await page.evaluate((y) => window.scrollTo(0, y), target);
  else await page.locator(target).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
}

export async function captureWeb(src: WebSource, theme: Theme, dpr: number, out: string) {
  const { page, close } = await openWebPage(src, theme, dpr, { still: true });
  try {
    if (src.scrollTo !== undefined) await scrollTo(page, src.scrollTo);
    if (src.hideFixed ?? !!src.fullPage) await hideFixed(page);
    if (src.selector) {
      await page.locator(src.selector).first().screenshot({ path: out, animations: "disabled" });
    } else {
      await page.screenshot({ path: out, fullPage: !!src.fullPage, animations: src.animations ? "allow" : "disabled" });
    }
  } finally {
    await close();
  }
}

/** Hide position:fixed elements, which otherwise float mid-page in full-page captures. */
export async function hideFixed(page: Page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (getComputedStyle(el).position === "fixed") el.style.setProperty("visibility", "hidden", "important");
    }
  });
}
