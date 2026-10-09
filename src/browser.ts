import { chromium, type Browser } from "playwright";

let browser: Browser | undefined;

export async function getBrowser(): Promise<Browser> {
  browser ??= await chromium.launch({ args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = undefined;
}
