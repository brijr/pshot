---
name: pshot
description: Make high-end product shots of Bridger's work (websites, local dev servers, Figma frames, Mac/iOS apps) with the `pshot` CLI. Use whenever Bridger asks for product shots, portfolio images, case-study visuals, mockups, device shots, screenshots "for the portfolio", or "shoot the <page>", from any project/repo.
---

# pshot: product shots

`pshot` is Bridger's product-shot tool: a global CLI (repo `~/Projects/pshot`, github.com/brijr/pshot).
**Read `~/Projects/pshot/CLAUDE.md` before the first shot in a session.** It is the full operating manual
(sources, layouts, frames, motion, QA, delivery, gotchas). This skill is the summary.

## Standards (never drift)

- Near-black `#0A0A0A` / off-white `#FAFAFA` backgrounds. No gradients, color, text, logos, or captions.
- **4:3 only**, 3200×2400 (`--xl` 4800×3600). Always **dark and light**.
- Minimal framing by default (raw UI, radius, soft shadow). Devices (`iphone`, `ipad`, `macbook`, `display`,
  Apple's official bezels) when they help. Close-ups: `layout: bleed` with `edge: corner, zoom: 1.3–1.5`.
- Never upscale; real, fully loaded content; every shot in a set shows different content.

## Workflow in any project

1. **Scout** the site/app (live URL or the project's dev server; start it if needed) and pick 4–8 views.
2. **Recipe**: `pshot init <url>` writes `./shots.yaml` in the current repo; edit it (see `~/Projects/pshot/recipes/*.yaml`
   for examples). Sites with their own theme toggle: `storage: { theme: "{theme}" }`.
3. **Render**: `pshot` (runs `./shots.yaml`). Iterate with `pshot --shot <id> --reuse`.
4. **Review** `~/Projects/pshot/output/<project>/_contact.png` and full-res crops. Fix anything off. Resolve QA warnings.
5. **Show** the contact sheet and wait for feedback.
6. **Deliver** only what's approved: Shape `/Portfolio/<project>/` (Shape MCP `prepare_upload` → `curl -T`), and/or
   `--out <dir>` into the project (e.g. `public/work`) **only when Bridger asks**.

## Commands

```
pshot [recipe] [--shot a,b] [--theme dark] [--out dir] [--xl] [--reuse] [--no-motion] [--motion-only]
pshot init [url]   pshot windows   pshot sims   pshot contact <project>
```

Don't commit `shots.yaml` or rendered images into a project unless Bridger asks.
