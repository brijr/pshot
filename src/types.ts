export type Theme = "dark" | "light";
export type Scheme = "dark" | "light" | "match" | "cross";

export type Action =
  | { click: string }
  | { hover: string }
  | { type: [string, string] }
  | { press: string }
  | { wait: number }
  | { scroll: number | string }
  | { eval: string };

interface BaseSource {
  /** Crop the raw capture before layout, in raw pixels or 0–1 fractions: [x, y, w, h]. */
  crop?: [number, number, number, number];
  /** Force a display aspect (e.g. "16:10"); taller images are cropped from the top. */
  aspect?: string;
  /** Device frame to place the screen in. */
  frame?: FrameKind;
  /** Corner radius override (CSS px at a 1600-wide canvas). */
  radius?: number;
  /** Flatten transparency onto this color (e.g. Figma frames with no fill). */
  background?: string;
  /** The image is a native window capture with its own alpha corners (drop-shadow, no clip). */
  window?: boolean;
  /** Add padding around the capture, as a fraction of its width, filled with `background`. */
  pad?: number;
  /** Draw the artwork straight on the canvas: no card, radius, hairline, or shadow (logos, marks). */
  bare?: boolean;
  /** Hairline opacity override (0–1), e.g. 0.24 to separate dark tiles on the dark canvas. */
  outline?: number;
  /** Width in px to rasterize vector sources (SVG files, Figma `format: svg`) at. Default 5000. */
  rasterWidth?: number;
  /** Per-theme overrides, merged in for that theme (e.g. a light logo on the dark canvas). */
  dark?: Record<string, unknown>;
  light?: Record<string, unknown>;
}

export interface WebSource extends BaseSource {
  type: "web";
  url: string;
  /** "1440x900" CSS px. */
  viewport?: string;
  dpr?: number;
  /** Color scheme to emulate. "match" captures dark UI for dark shots, light for light. */
  scheme?: Scheme;
  fullPage?: boolean;
  /** Capture only this element. */
  selector?: string;
  /** Scroll to this y (px) or selector before capture. */
  scrollTo?: number | string;
  waitFor?: string;
  /** Extra settle time in ms after load. */
  delay?: number;
  /** Selectors to hide (cookie banners, chat widgets…). */
  hide?: string[];
  css?: string;
  actions?: Action[];
  /** Keep animations running (default: frozen for stills). */
  animations?: boolean;
  /**
   * localStorage to set before any page script runs; values may contain `{theme}` (the resolved
   * scheme). E.g. `{ theme: "{theme}" }` for next-themes sites with their own toggle.
   */
  storage?: Record<string, string>;
  /** Hide position:fixed elements (floating CTAs, clocks…). Defaults to true for fullPage. */
  hideFixed?: boolean;
}

export interface FigmaSource extends BaseSource {
  type: "figma";
  url: string;
  /** Node to export, overriding the URL's node-id (e.g. "104:52"). */
  node?: string;
  scale?: number;
  /** `svg` exports vectors and rasterizes them at `rasterWidth`: sharp at any size (logos). */
  format?: "png" | "svg";
}

export interface MacSource extends BaseSource {
  type: "mac";
  app: string;
  /** Substring match on window title. */
  title?: string;
  /** Resize the window first, "1280x800" points. Needs Accessibility permission. */
  size?: string;
  activate?: boolean;
}

export interface IosSource extends BaseSource {
  type: "ios";
  /** Simulator name or UDID; defaults to the booted device. */
  device?: string;
  /** Bundle id to launch before capture. */
  app?: string;
  /** Deep link / URL to open before capture. */
  url?: string;
  scheme?: Scheme;
  delay?: number;
}

export interface HtmlSource extends BaseSource {
  type: "html";
  /** Template file (relative to the recipe), or a built-in name from pshot's templates/ (e.g. "home-screen"). */
  template: string;
  /** CSS viewport, e.g. "1200x600". With a `frame`, computed from the device screen. */
  viewport?: string;
  dpr?: number;
  /** Values for {{key}} placeholders; all params are also available to scripts as {{json}}. */
  params?: Record<string, unknown>;
  /** Images to capture first and pass to the template as file URLs (any source: figma, file, web…). */
  assets?: Record<string, Source>;
  /** Keep the template's transparent background (for bare artwork like a size ladder). */
  transparent?: boolean;
}

export interface FileSource extends BaseSource {
  type: "file";
  /** May contain `{theme}` to pick a per-theme file. */
  path: string;
  /** Pixel density of the image (2 = Retina, the default); sets what bleed `zoom: 1` means. */
  density?: number;
}

export type Source = WebSource | FigmaSource | MacSource | IosSource | FileSource | HtmlSource;

export type FrameKind = "none" | "iphone" | "ipad" | "macbook" | "display";

export type LayoutKind =
  | "single"
  | "detail"
  | "bleed"
  | "duo"
  | "row"
  | "grid"
  | "stagger";

export interface Motion {
  /** Which source (index) gets motion; default 0. */
  item?: number;
  /** "scroll": deterministic eased scroll of a web source. "video": use a recorded file. */
  kind?: "scroll" | "video";
  /** Seconds of movement (scroll) — holds are added on top. */
  duration?: number;
  /** Scroll target: px, a selector, or "end". */
  to?: number | string;
  /** Start position: px or a selector. */
  from?: number | string;
  hold?: number;
  fps?: number;
  /** For kind: video — path to the recording (or recorded via `ios`/`mac` sources). */
  path?: string;
  /** Seconds to record for ios/mac sources. */
  record?: number;
}

export interface Shot {
  id: string;
  source?: Source;
  sources?: Source[];
  layout?: LayoutKind;
  themes?: Theme[];
  /** Canvas ratio, default "4:3". */
  ratio?: string;
  /** Layout-specific knobs. */
  options?: Record<string, unknown>;
  motion?: Motion;
}

export interface Recipe {
  project: string;
  /** Folder the recipe was loaded from (set by the CLI); relative paths resolve from here. */
  dir?: string;
  defaults?: Partial<Pick<Shot, "themes" | "ratio" | "layout">> & {
    web?: Partial<WebSource>;
  };
  shots: Shot[];
}

/** A captured, layout-ready image. */
export interface Asset {
  path: string;
  width: number;
  height: number;
  source: Source;
  /** Average luminance of the top rows, 0–1 (status bar tinting). */
  topLuma?: number;
  topColor?: string;
  /** Average luminance of the outer edge ring, 0–1 (contrast-aware borders). */
  edgeLuma?: number;
  /** Source still has transparent pixels after processing. */
  transparent?: boolean;
  /** Alpha-weighted center of the artwork (0–1), for optical centering. */
  centroid?: { x: number; y: number };
}
