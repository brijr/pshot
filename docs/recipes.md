# Recipes

A recipe (`shots.yaml`) describes a set of product shots. Each shot has one or more **sources** (what to
capture) and a **layout** (how to compose them). Every shot renders in dark and light at 4:3, 3200×2400.

```yaml
project: my-site            # names the output folder: ~/Projects/pshot/output/my-site/
defaults:
  themes: [dark, light]     # the default; set one theme to render only that
  web:                      # merged into every web source
    url: https://my-site.com
    viewport: 1280x800
shots:
  - id: home
    source: { type: web }
    layout: single
```

## CLI

```
pshot [recipe] [options]   Render a recipe. Defaults to ./shots.yaml.
pshot init [url]           Write a starter ./shots.yaml
pshot contact <project>    Rebuild a project's contact sheet
pshot windows              List on-screen macOS windows (for mac sources)
pshot sims                 List iOS simulators

--shot a,b      Only these shot ids          --reuse        Reuse raw captures (fast layout iteration)
--theme dark    Only one theme               --no-motion    Skip videos
--out <dir>     Also copy finals into <dir>  --motion-only  Only videos
--xl            4800×3600                    --no-contact   Skip the contact sheet
```

Outputs: `~/Projects/pshot/output/<project>/<shot>-<theme>.png|.mp4`, plus `_contact.png` and
`_report.json` (QA notes). Finals for shots you remove from a recipe are deleted on the next run.

## Sources

### `web`

| option | |
|---|---|
| `url` | Page to capture. Local dev servers (`http://localhost:3000`) work too. |
| `viewport` | CSS size, e.g. `1280x800`. Smaller viewports make UI read bigger. With a `frame`, it's computed from the device screen. |
| `scheme` | `match` (default: dark UI for dark shots, if the site supports it), `dark`, `light`, or `cross` (light UI on the dark canvas and vice versa). |
| `storage` | localStorage set before the page loads, e.g. `{ theme: "{theme}" }` for sites with their own theme toggle. |
| `fullPage` | Capture the whole page (pairs with the `bleed` layout). |
| `selector` | Capture one element. |
| `scrollTo` | Scroll to a y position or selector first. |
| `hide` | Extra selectors to hide (cookie banners and common chat widgets are hidden already). |
| `hideFixed` | Hide fixed-position elements. On by default for `fullPage`. |
| `actions` | Steps before capture: `{ click: sel }`, `{ hover: sel }`, `{ type: [sel, text] }`, `{ press: key }`, `{ wait: ms }`, `{ scroll: y }`, `{ eval: js }`. |
| `css`, `waitFor`, `delay` | Inject CSS, wait for a selector, extra settle time (ms). |
| `dpr` | Force a capture density. Normally automatic. |

### `figma`

`url` with a `?node-id=` (or `node: "104:52"` to pick a different node in the same file). Exported at
`scale` (default and maximum 4) through Figma's API using `FIGMA_TOKEN` from `~/Projects/pshot/.env`.
Frames with no fill need `background` (and usually `pad`).

`format: svg` exports vectors instead and rasterizes them at `rasterWidth` (default 5000px), so logos and
icons stay perfectly sharp at any size.

### `mac`

`app` (and optionally `title`) captures that app's window at Retina, keeping its native corners. `size`
resizes the window first (needs Accessibility permission). Needs Screen Recording permission. Mac apps
follow the system appearance, so they don't switch per theme.

### `ios`

`device` (a Simulator name or UDID; defaults to the booted one), `url` or `app` (bundle id), `delay`.
pshot sets the Simulator's appearance per theme and overrides the status bar (9:41, full signal and battery).

### `file`

`path` to an image (or an SVG, rasterized at `rasterWidth`), relative to the recipe. `{theme}` in the path
picks a per-theme file. `window: true`
treats it as a native window capture (alpha corners, drop shadow). `density` (default 2) says what pixel
density it was captured at.

### Options for every source

`frame` (`iphone`, `ipad`, `macbook`, `display`), `crop: [x, y, w, h]` (pixels or 0–1 fractions),
`aspect: "16:10"` (crops from the top), `radius`, `background`, `pad` (fraction of width).

`bare: true` draws the artwork straight on the canvas, with no card, radius, or shadow. Use it for logos.

`dark: { … }` and `light: { … }` override any option for that theme only, e.g. a light logo on the dark
canvas and a dark one on the light canvas:

```yaml
source:
  type: figma
  url: "https://figma.com/design/FILE/Brand?node-id=1-2"
  format: svg
  bare: true
  dark: { node: "104:52" }    # light-on-dark logo
  light: { node: "104:51" }   # dark-on-light logo
```

## Layouts

| layout | | options |
|---|---|---|
| `single` | One screen, centered. | `fill`, `offsetY` |
| `detail` | Like single, tighter. Pair with `crop` or `selector`. | `fill` |
| `bleed` | The screen runs off the canvas. `edge: corner` with `zoom` makes close-ups where the UI reads big and runs off the right and bottom edges; with `size` and `bare` it makes a giant mark running off the corner. | `edge` (`bottom`, `right`, `corner`), `size`, `zoom`, `inset`, `insetX`, `insetY` |
| `duo` | Two screens. Unframed: an equal-height row. With frames: the second device sits in front of the first. | `scale`, `overlap`, `dropB` |
| `row` | Equal-height row. | `gap`, `fill` |
| `grid` | Uniform grid. `equalHeight` gives every item the same height (a logo family at one type size). | `cols`, `gap`, `equalHeight`, `align: left` |
| `stagger` | Cascade with alternating offsets. | `size`, `offset`, `gap`, `rotate` |

## Frames

`iphone` (iPhone 18 Pro), `ipad` (iPad Pro 13", portrait or landscape from the viewport), `macbook`
(MacBook Pro 14"), `display` (Studio Display). They use Apple's official product bezels, downloaded by the
installer; without them, CSS-drawn frames are used.

For web sources, the viewport is computed so the capture fills the device screen exactly: iPhone 402×812
(plus pshot's status bar), iPad 1032×1376 or 1376×1032, MacBook 1512×950 (content starts below the notch),
Studio Display 1600×900. Images from other sources that don't match the screen's shape get a QA warning.

Frame options (in the shot's `options`): `finish: black | silver` and `statusBar: false`.

## Motion

```yaml
motion: { kind: scroll, duration: 5, from: 0, to: "#work", hold: 1 }
```

On a web source, `scroll` records an eased scroll frame by frame, so there are no dropped frames, and
composites it into the layout as 2400×1800, 60fps H.264. `to` and `from` take pixels, a selector, or `end`.
For `ios` and `mac` sources, `record: <seconds>` makes a real-time recording. `path:` composites an existing
video. Keep scrolls short and slow: one section, four to six seconds.

## Quality checks

Every render reports problems in the terminal and in `_report.json`:

- **Upscaling.** Web sources automatically re-capture at the density the layout needs. Other sources
  get a warning; capture them larger.
- **Cropping.** Device screens must match exactly. Unframed screens warn on heavy crops.
- **Transparency.** Sources with transparent pixels (like Figma frames with no fill) get a note.
