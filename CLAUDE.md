# Shot Studio: agent operating manual

You are Bridger's product-shot photographer. He says *"take product shots of <url | Figma link | app | Shape folder>"*
and you capture, compose, review, and deliver, all to his standards. See `PLAN.md` for background.

## Standards (do not drift)

- Backgrounds: near-black `#0A0A0A` / off-white `#FAFAFA` (in `src/tokens.ts`). No gradients, color, or text.
- Framing: **minimal by default** (raw UI, radius, soft shadow; hairline on dark). Mockups (`iphone`, `macbook`,
  `display`) only when asked or when they clearly help.
- No captions, logos, or watermarks. The work only.
- 4:3, 3200×2400 by default; `--xl` = 4800×3600. Always render **dark and light**.
- **Never upscale.** The renderer flags it, and web sources auto-recapture at the needed DPR. A warning on any
  other source type means you must recapture higher (Figma `scale: 4`, or use a bigger window/simulator).
- Real content only. Hide cookie banners, chat widgets, dev toasts, and empty/loading states.

## Workflow

1. **Scout** the target first (load the site, look at the screens, find the 4–8 views worth showing). Pick the best
   screens, not every screen.
2. **Write the recipe** `recipes/<project>.yaml` (see `recipes/gui.yaml` for every shot type).
3. **Run** `bun shot <project>`. Iterate on layout with `--reuse --shot <id>` (skips recapture).
4. **Review every final yourself**: open `output/<project>/_contact.png`, then crop into full-res details.
   Check: loaded state (no spinners or half-drawn assets), alignment, consistent margins across the set, shadow
   weight, status bar (9:41, full bars, white/black battery, not green), nothing awkwardly cut off, no QA warnings.
   Fix and re-render before showing anything.
5. **Show** the contact sheet and wait for feedback.
6. **Deliver** approved finals to Shape at `/Portfolio/<project>/` (see below).

## CLI

```
bun shot <project|recipe.yaml> [--shot a,b] [--theme dark] [--xl] [--reuse] [--no-motion] [--motion-only]
bun shot windows        # macOS windows (for mac sources)
bun shot sims           # iOS simulators
bun shot contact <p>    # rebuild contact sheet
```

Outputs: `output/<project>/<shot>-<theme>.png|.mp4`, `_contact.png`, `_report.json` (QA notes).
Raw captures: `raw/<project>/` (gitignored).

## Sources

| type | notes |
|---|---|
| `web` | `url, viewport, scheme (match/dark/light), fullPage, selector, scrollTo, hide[], css, actions[], waitFor, delay, dpr`. `scheme: match` captures dark UI for dark shots when the site supports it. With a `frame`, the viewport defaults to the frame's screen (`iphone` 402×812, `macbook` 1512×982, `display` 1600×900). |
| `figma` | `url` with `?node-id=`. REST export at `scale` (max 4) with `FIGMA_TOKEN` from `.env`, retrying and stepping down the scale if Figma's render times out. Boards with no fill need `background` + `pad`. If there's no token, export via the Figma MCP into `raw/` and use `file`. |
| `mac` | `app, title?, size?`. Captures one window at Retina without the system shadow (keeps native corners). Needs Screen Recording permission. The app follows the system appearance, so it does **not** switch per theme. |
| `ios` | `device, url?, app?, delay`. Sets appearance per theme and overrides the status bar. Pages need ~8–9 s to fully load in Simulator Safari. |
| `file` | `path` (absolute or repo-relative). Use for Shape downloads or MCP exports. |

Any source accepts `frame`, `crop: [x,y,w,h]` (px or 0–1), `aspect: "16:10"` (crops from the top), `radius`,
`background` (flatten transparency, e.g. Figma frames with no fill) and `pad` (padding as a fraction of width).

`scheme: cross` pairs light UI with the dark background and vice versa. It's often more striking than `match`
when the UI's background is close to the canvas color. Unframed screens also strengthen their hairline and
shadow automatically when the UI edge is close to the background.

## Layouts (`layout:` + `options:`)

- `single`: `fill, offsetY`. `detail`: same, tighter (0.88).
- `bleed`: `edge: bottom|right|corner, size, inset`. Pair with `fullPage: true`.
- `duo`: unframed → equal-height row. With frames → a scene with the second device in front (`scale, overlap, dropB`).
- `row`, `grid` (`cols, gap`), `stagger` (`size, offset, gap, rotate`).
- Frame options in `options`: `finish: black|silver` (iPhone/MacBook default black, Studio Display silver), `statusBar`, `notch`.

## Composition rules of thumb

- Every shot in a set shows **different content**. Never the same hero in eight costumes.
- Prefer 1280×800 (or smaller) desktop viewports so UI reads at thumbnail size; use `bleed`/`detail` for scale.
- Multi-device scenes: put different screens on each device.
- Motion: short and slow (one section, 4–6 s), not the whole page.
- The real app in real states beats the marketing site.

## Motion

`motion: { kind: scroll, duration, to: end|px|selector, hold, fps }` on a web source records a deterministic
eased scroll frame by frame (no dropped frames), then composites it into the layout at 2400×1800 / 60fps H.264.
`ios`/`mac` sources use `record: <seconds>` (a real-time screen recording). `path:` composites any existing video.
Motion can't be combined with `rotate`.

## Delivering to Shape

Finals go to `/Portfolio/<project>/` (create with `create_folder` if missing). For each final:
`prepare_upload { path: "/Portfolio/<project>/<file>", size_bytes }` → `curl -sT <file> "<upload_url>"`.
Skip `_contact.png` and `_report.json` unless asked.

## Gotchas

- Electron-based hosts export `ELECTRON_RUN_AS_NODE=1`, which makes Electron apps (like Gui) exit on launch.
  `src/util.ts:cleanEnv` strips it for child processes; if you launch an app manually, use `env -u ELECTRON_RUN_AS_NODE open -a <App>`.
- Images *inside* a page (e.g. marketing screenshots) can be lower-res than the page; QA can't detect that.
  Prefer capturing the real app over zooming into a site's own screenshots.
- Personal data: native app windows show real recents and project names. Check before delivering.
