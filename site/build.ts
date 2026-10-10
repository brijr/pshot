#!/usr/bin/env bun
/**
 * Builds pshot.dev: the README rendered as a single monospace page, with an example contact sheet.
 *
 *   bun site/build.ts        → site/dist/
 *   bunx wrangler deploy     (from site/) to publish
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SITE = import.meta.dir;
const ROOT = join(SITE, "..");
const DIST = join(SITE, "dist");

const readme = await Bun.file(join(ROOT, "README.md")).text();
let body = Bun.markdown.html(readme.replace(" [pshot.dev](https://pshot.dev)", ""));

// The example contact sheet goes right after the intro paragraph.
const figure = `
<figure>
  <a href="/contact-sheet.png"><img src="/contact-sheet.webp" width="1800" height="1586"
    alt="A pshot contact sheet: nine product shots of websites and apps in dark and light, unframed, close-up and on Apple devices."></a>
  <figcaption>An example contact sheet from <code>pshot</code>. Click for full resolution.</figcaption>
</figure>`;
body = body.replace("</p>", `</p>${figure}`);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pshot · product shots of your work</title>
<meta name="description" content="Product shots of your work, made by your AI agent.">
<meta property="og:title" content="pshot">
<meta property="og:description" content="Product shots of your work, made by your AI agent.">
<meta property="og:image" content="https://pshot.dev/contact-sheet.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230A0A0A'/><text x='16' y='22' font-family='monospace' font-size='18' fill='%23FAFAFA' text-anchor='middle'>p</text></svg>">
<style>
  :root { --bg: #FAFAFA; --fg: #0A0A0A; --dim: #6b6b6b; --line: rgba(0,0,0,.1); --code: rgba(0,0,0,.045); color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0A0A0A; --fg: #FAFAFA; --dim: #8a8a8a; --line: rgba(255,255,255,.12); --code: rgba(255,255,255,.06); }
  }
  * { box-sizing: border-box; }
  html { background: var(--bg); color: var(--fg); }
  body {
    margin: 0 auto; max-width: 86ch; padding: 9vh 24px 12vh;
    font: 14px/1.7 ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: 14px; font-weight: 700; margin: 0 0 1.4em; }
  h1::before { content: "$ "; color: var(--dim); }
  h2 { font-size: 14px; font-weight: 700; margin: 3em 0 .8em; }
  h2::before { content: "## "; color: var(--dim); }
  p, ul { margin: 0 0 1.2em; }
  ul { padding-left: 2ch; }
  a { color: inherit; text-underline-offset: 3px; text-decoration-color: var(--line); }
  a:hover { text-decoration-color: currentColor; }
  code { font: inherit; background: var(--code); padding: .1em .35em; border-radius: 3px; }
  pre { background: var(--code); padding: 14px 16px; border-radius: 4px; overflow-x: auto; margin: 0 0 1.4em; line-height: 1.6; }
  pre code { background: none; padding: 0; }
  figure { margin: 2.6em -12ch 3em; }
  figure img { display: block; width: 100%; height: auto; border-radius: 4px; outline: 1px solid var(--line); }
  figcaption { color: var(--dim); margin-top: .8em; padding: 0 12ch; }
  footer { margin-top: 5em; color: var(--dim); }
  @media (max-width: 1100px) { figure { margin-left: 0; margin-right: 0; } figcaption { padding: 0; } }
</style>
</head>
<body>
<main>
${body}
</main>
<footer><a href="https://github.com/brijr/pshot">github.com/brijr/pshot</a> · MIT</footer>
</body>
</html>
`;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
await Bun.write(join(DIST, "index.html"), html);
cpSync(join(SITE, "assets"), DIST, { recursive: true });
// `curl -fsSL https://pshot.dev/install | bash`: the installer, copied from the repo on every build.
const installer = await Bun.file(join(ROOT, "install.sh")).text();
await Bun.write(join(DIST, "install"), installer);
await Bun.write(join(DIST, "install.sh"), installer);
await Bun.write(join(DIST, "_headers"), "/install\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-cache\n/install.sh\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-cache\n");
console.log(`✓ built ${DIST}`);
