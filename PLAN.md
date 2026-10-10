# pshot — Plan

An agent-driven studio for making high-end product shots of Bridger's work.
The interface is conversation: *"take product shots of <url | Figma link | Shape folder | brand>"* →
the agent captures, composes, renders, reviews, and delivers.

## Visual standards (non-negotiable)

| | |
|---|---|
| Backgrounds | Near-black `#0A0A0A` / off-white `#FAFAFA`. No gradients, no color, no text. |
| Framing | Default **minimal**: raw UI, corner radius, soft layered shadow. On dark, a 1px hairline (`rgba(255,255,255,.08)`) replaces the shadow, which doesn't read on near-black. |
| Mockups | Optional: iPhone, MacBook / Studio Display. Minimal, built in-house (SVG/CSS), not stock PSDs. |
| Format | **4:3** default. Stills 3200×2400 (standard) and 4800×3600 (`--xl`). Other ratios on request. |
| Content | Work only, so no captions, logos, or watermarks. |
| Fidelity | Never upscale. Capture at 2–3× DPR. If a raw capture is too small for its slot, fail loudly. |

## Sources → capture adapters

| Source | Method |
|---|---|
| Live / local websites | Playwright (Chromium), DPR 2–3, set viewport, light/dark scheme, wait for fonts + network idle, hide scrollbars/cookie banners/chat widgets via injected CSS, freeze animations for stills. Full-page, viewport, or element (selector) crops. |
| Figma | Figma MCP (`get_screenshot` / `download_assets`) for frames by node URL; Figma REST export at 3–4× as the high-res path (needs `FIGMA_TOKEN`). |
| Native macOS apps | `screencapture -o -l <windowID>` (no system shadow), window ID found via a small Swift/AppleScript helper. Optionally resize the window first for consistent sizing. |
| iOS (Simulator) | `xcrun simctl status_bar override` (9:41, full bars/battery), then `simctl io screenshot` / `recordVideo`. |
| Shape | Pull existing assets via the Shape MCP into `raw/`. |

## Composition

Layouts are HTML/CSS templates rendered with Playwright to PNG (e.g. 1600×1200 CSS px @2× = 3200×2400).
That makes it fully code-controlled with real CSS shadows, radius, and typography-grade rendering.

Layouts (v1):
- `single`: one screen, centered, generous margin
- `bleed`: screen cropped off one edge (editorial)
- `duo`: desktop + mobile
- `trio` / `grid`: several screens, even rhythm
- `stagger`: offset cascade of screens
- `detail`: tight crop of a component at high zoom
- `iphone`, `macbook`: mockup variants

Every shot renders in **dark and light** by default.

## Motion

- Web: Playwright-scripted scroll/interaction recorded via CDP screencast at DPR 2 → frames → ffmpeg (60fps, eased scrolling, no cursor unless wanted).
- iOS: `simctl io recordVideo`.
- macOS: `screencapture -v` or ScreenCaptureKit helper.
- Composite with ffmpeg: rendered background/shadow plate + rounded-mask video overlay → H.264 MP4 (and optional ProRes/WebM). 4:3, 2400×1800 default.

## Recipes

One YAML per project in `recipes/`, so any shot is re-runnable when the work changes:

```yaml
project: acme
shots:
  - id: home-hero
    source: { type: web, url: https://acme.com, viewport: 1440x900, scheme: dark }
    layout: single
    themes: [dark, light]
  - id: app-duo
    sources:
      - { type: web, url: https://app.acme.com/dashboard, viewport: 1440x900 }
      - { type: web, url: https://app.acme.com/dashboard, viewport: 390x844 }
    layout: duo
  - id: onboarding
    source: { type: figma, url: https://figma.com/design/...?node-id=12-34 }
    layout: iphone
```

## Repo layout

```
pshot/
  CLAUDE.md          # agent operating manual: workflow, standards, QA checklist
  recipes/           # per-project shot recipes
  src/capture/       # web.ts, figma.ts, mac.ts, ios.ts
  src/compose/       # layout templates + renderer
  src/motion/        # recording + ffmpeg compositing
  src/cli.ts         # `pshot <recipe> [--shot id] [--xl] [--theme dark]`
  raw/               # captures (gitignored)
  output/<project>/  # finals: <shot>-<theme>.png / .mp4
```

Stack: Bun + TypeScript, Playwright, sharp, ffmpeg.

## Agent workflow (the loop)

1. Understand the target and pick 4–8 shots worth showing (best screens, not every screen).
2. Write or extend the recipe.
3. Capture → inspect raws (resolution, stray banners, broken states, placeholder content).
4. Compose and render dark and light.
5. **Self-review** each final visually against a QA checklist: alignment, optical centering, shadow weight, edge artifacts, no upscaling, no cut-off UI, consistent margins across the set.
6. Show a contact sheet, iterate on feedback.
7. Upload approved finals to Shape at `/Product Shots/<project>/`.

## Build phases

1. **Foundation**: scaffold, web capture, `single` layout, dark/light render, CLAUDE.md. Prove it on one real site.
2. **Sources**: Figma, macOS window, and iOS Simulator adapters.
3. **Layouts**: `bleed`, `duo`, `grid`, `stagger`, `detail`, plus iPhone/MacBook mockups.
4. **Motion**: scroll/interaction recording and MP4 compositing.
5. **Delivery**: contact sheet and Shape upload.

## Open questions

- A real project to prove Phase 1 on?
- Figma: OK to add a personal access token (`FIGMA_TOKEN`) for full-res exports?
- Shape destination folder: `/Product Shots/<project>/` OK?
- Git: init this repo?
