# pshot

Product shots of your work, made by your AI agent. [pshot.dev](https://pshot.dev)

pshot captures websites, local dev servers, Figma frames, and Mac/iOS apps, then composes them into
minimal, high-resolution product shots: near-black and off-white canvases, 4:3 at 3200×2400, in dark
and light, with optional real Apple device frames and smooth scroll videos. It's built to be driven by
an agent (it ships a Claude Code skill), but works fine by hand.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/brijr/pshot/main/install.sh | bash
```

Installs Bun and ffmpeg if needed, clones pshot to `~/Projects/pshot`, installs Chromium, downloads
Apple's product bezels from Apple's Design Resources (this accepts Apple's bezel license; set
`PSHOT_SKIP_BEZELS=1` to skip, and CSS frames are used instead), links the `pshot` command, and installs
the Claude Code skill. Re-run to update. Built for macOS.

## Use

```sh
cd your-project
pshot init https://your-site.com   # writes shots.yaml
pshot                              # renders every shot, dark + light
pshot --shot home --reuse          # iterate on one shot
pshot --out public/work            # also copy finals into the project
```

A recipe is a list of shots, each a source (web page, Figma frame, Mac window, iOS Simulator, or file)
and a layout:

```yaml
project: my-site
defaults:
  web: { url: https://my-site.com, viewport: 1280x800 }
shots:
  - id: home
    source: { type: web }
    layout: single
  - id: close-up
    source: { type: web }
    layout: bleed
    options: { edge: corner, zoom: 1.4 }
  - id: devices
    sources:
      - { type: web, frame: macbook }
      - { type: web, frame: iphone }
    layout: duo
```

Layouts: `single`, `detail`, `bleed` (incl. close-up corner crops), `duo`, `row`, `grid`, `stagger`.
Frames: `iphone`, `ipad`, `macbook`, `display`. Captures always fill device screens exactly, and nothing
is ever upscaled: web captures re-render at the density each layout needs, and QA flags anything else.

Finals land in `output/<project>/` with a contact sheet. See [`CLAUDE.md`](CLAUDE.md) for every option.

## License

MIT. Apple product bezels are not included in this repository; they are downloaded from Apple and
subject to Apple's terms.
