# pshot: agent operating manual

You make product shots with pshot. The user says *"take product shots of <url | Figma link | app>"* and you
scout, write a recipe, render, review, and deliver. Every option is in [`docs/recipes.md`](docs/recipes.md);
this file is how to use them well. If the user has their own preferences (in memory or instructions), those
win over the defaults here.

## House style (pshot's defaults; don't drift from them unless the user asks)

- Near-black `#0A0A0A` / off-white `#FAFAFA` canvases (`src/tokens.ts`). No gradients, color, captions, logos,
  or watermarks. The work only.
- 4:3 at 3200×2400 (`--xl` 4800×3600). Every shot in dark **and** light.
- Minimal framing by default (raw UI, radius, soft shadow; hairline on dark). Device frames when they help.
- **Never upscale.** Web sources re-capture automatically; a warning on any other source means capture larger.
- Real, fully loaded content. No spinners, empty states, cookie banners, chat widgets, or dev toasts.

## Workflow

1. **Scout** first: load the site or app (start the project's dev server if it's local), look at the screens,
   and pick the 4–8 views worth showing. The best screens, not every screen.
2. **Write the recipe.** In a project repo: `pshot init <url>` writes `./shots.yaml`; edit it. Otherwise use
   `recipes/<project>.yaml` in this repo. `recipes/gui.yaml` uses nearly every feature.
3. **Run** `pshot` (or `pshot <recipe>`). Iterate on one shot with `--shot <id> --reuse`.
4. **Review every final yourself**: open `output/<project>/_contact.png`, then crop into full-resolution
   details. Check: fully loaded, alignment and margins consistent across the set, shadow weight, status bar
   (9:41, full bars, battery not green), nothing awkwardly cut off, no QA warnings. Fix and re-render before
   showing anything.
5. **Show** the contact sheet and wait for feedback.
6. **Deliver** only what's approved, where the user wants it. `--out <dir>` copies finals into a project; only
   use it when asked. Don't commit `shots.yaml` or images into someone's project unless asked.

## Composition

- Every shot in a set shows **different content**. Never the same hero in eight costumes.
- Desktop viewports of 1280×800 or smaller, so UI reads at thumbnail size. `bleed` and `detail` for scale.
- Close-ups: `layout: bleed` with `edge: corner, zoom: 1.3–1.5`. For centered-column sites, use a narrower
  viewport so the content stays in frame.
- `scheme: cross` (light UI on the dark canvas and vice versa) is often the most striking hero when the UI's
  background is close to the canvas color.
- Multi-device scenes: different screens on each device.
- Motion: short and slow, one section, 4–6 seconds.
- The real app in real states beats its marketing site.
- Brands: tell the story, not just the logo. `recipes/shape-brand.yaml` is the model, numbered like a brand deck:
  mark → wordmark → family → palette → type → app icon → icon set → sizes → favicon → home screen → in product
  → brand-color field → giant mark. Export logos from Figma with `format: svg`, draw them `bare`, size mark and
  wordmark on one scale (`height`), center them `optical`ly, and use `dark:` / `light:` overrides for the
  colorway per canvas. Context shots come from `html` templates. One brand-color `canvas` field is fine;
  more than one breaks the black-and-white house style.

## Working on pshot itself

- Bun + TypeScript. `bun run typecheck`. Entry point `src/cli.ts`; capture in `src/capture/`, layout and frames in
  `src/compose/`, video in `src/motion/`, contact sheets in `src/deliver/`.
- Apple bezels live in `assets/bezels/` (gitignored, downloaded by `scripts/setup-bezels.ts`, measured by
  `scripts/measure-bezels.ts`). Never commit them; Apple's terms don't allow redistribution.
- The site (pshot.dev) is built from `README.md` by `site/build.ts` and deployed with `bunx wrangler deploy` from
  `site/`. It also serves `install.sh` at `/install`, so redeploy after changing either.
- `scripts/gui-states.ts` is an example of capturing an Electron app in real states: it drives the app with
  Playwright's Electron support on a throwaway project copy and an isolated profile, and captures each state.

## Gotchas

- Electron-based hosts export `ELECTRON_RUN_AS_NODE=1` (Electron apps then exit on launch), and agent markers
  like `CLAUDECODE` / `AI_AGENT` make some dev servers (e.g. `astro dev`) daemonize. `src/util.ts:cleanEnv`
  strips both for apps pshot launches. Manually: `env -u ELECTRON_RUN_AS_NODE open -a <App>`.
- Window capture tries ScreenCaptureKit, then `screencapture -l`, then a display crop. If Screen Recording is
  stale (on, but captures fail or come back black), toggle it off and on for the terminal app and restart it.
  macOS may also ask for a periodic "bypass the private window picker" approval.
- Sites that scroll inside a container (e.g. Lenis) instead of the page: stills work, scroll videos don't yet.
- Images *inside* a page can be lower resolution than the page; QA can't detect that. Prefer the real app.
- Native app windows show real recents and project names. Check for personal data before delivering.
- Running `pshot` deletes finals for shots that are no longer in the recipe.
