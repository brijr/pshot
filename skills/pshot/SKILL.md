---
name: pshot
description: Make high-end product shots of websites, local dev servers, Figma frames, and Mac/iOS apps with the `pshot` CLI. Use whenever the user asks for product shots, portfolio images, case-study visuals, mockups, device shots, screenshots "for the portfolio", or to "shoot" a page, from any project.
---

# pshot: product shots

`pshot` is a global CLI (installed in `~/Projects/pshot` by default; pshot.dev). Before the first shot in a
session, read `~/Projects/pshot/CLAUDE.md` (how to work) and `~/Projects/pshot/docs/recipes.md` (every option).
The user's own preferences, from memory or instructions, override pshot's defaults.

## Defaults

- Near-black `#0A0A0A` / off-white `#FAFAFA` canvases. No captions, logos, or watermarks.
- 4:3 at 3200×2400. Every shot in dark and light.
- Minimal framing by default; device frames (`iphone`, `ipad`, `macbook`, `display`) when they help.
  Close-ups: `layout: bleed` with `edge: corner, zoom: 1.3–1.5`.
- Never upscale. Real, fully loaded content. Every shot in a set shows different content.

## Workflow

1. **Scout** the site or app (live URL, or the project's dev server; start it if needed). Pick 4–8 views.
2. **Recipe**: `pshot init <url>` writes `./shots.yaml`. Edit it. Sites with their own theme toggle need
   `storage: { theme: "{theme}" }`.
3. **Render**: `pshot`. Iterate with `pshot --shot <id> --reuse`.
4. **Review** `~/Projects/pshot/output/<project>/_contact.png` and full-resolution crops. Fix anything off and
   resolve every QA warning.
5. **Show** the contact sheet and wait for feedback.
6. **Deliver** only what's approved, where the user wants it. Use `--out <dir>` only when asked.

```
pshot [recipe] [--shot a,b] [--theme dark] [--out dir] [--xl] [--reuse] [--no-motion] [--motion-only]
pshot init [url]   pshot windows   pshot sims   pshot contact <project>
```

Don't commit `shots.yaml` or rendered images into a project unless the user asks.
