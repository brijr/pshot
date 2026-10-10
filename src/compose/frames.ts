import { CONTRAST_THRESHOLD, MOBILE_RADIUS_RATIO, SCREEN_RADIUS, THEMES } from "../tokens";
import type { Asset, FrameKind, Theme } from "../types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The area screen content is drawn into. */
export interface ScreenRect extends Rect {
  /** CSS border-radius value. */
  radius: string;
  /** Inset at the top (status bar) filled with `fill`. */
  padTop: number;
  fill: string;
  /** Use alpha-following drop-shadow instead of clipping (macOS windows). */
  dropShadow?: string;
}

export interface FrameRender {
  /** Layers beneath the screen content (shadow, body, bezel). */
  under: string;
  /** Layers above the screen content (island, notch, status bar, hairline). */
  over: string;
  screen: ScreenRect;
}

export interface FrameOpts {
  finish?: "black" | "silver";
  statusBar?: boolean;
  notch?: boolean;
}

export interface Frame {
  /** Outer width / height of the framed object for a given asset. */
  aspect(asset: Asset): number;
  render(asset: Asset, r: Rect, theme: Theme, opts: FrameOpts): FrameRender;
}

const px = (n: number) => `${+n.toFixed(3)}px`;
const box = (r: Rect, style = "") =>
  `<div style="position:absolute;left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)};${style}"></div>`;

/** Mobile = captured at a phone-width viewport (full-page desktop captures are tall but not mobile). */
function isMobile(a: Asset) {
  const vp = a.source.type === "web" ? a.source.viewport : undefined;
  if (vp) return parseInt(vp) < 600;
  return a.source.type === "ios" || a.width / a.height < 0.8;
}

// ─── Unframed ────────────────────────────────────────────────────────────────

const none: Frame = {
  aspect: (a) => a.width / a.height,
  render(asset, r, theme) {
    const t = THEMES[theme];
    const custom = asset.source.radius;
    if ((asset.source.type === "mac" || asset.source.window) && custom === undefined) {
      // Native windows carry their own rounded alpha corners and border.
      return {
        under: "",
        over: "",
        screen: { ...r, radius: "0", padTop: 0, fill: "transparent", dropShadow: t.dropShadow },
      };
    }
    const radius =
      custom ?? (isMobile(asset) ? r.w * MOBILE_RADIUS_RATIO : Math.min(Math.max(r.w * 0.008, 6), SCREEN_RADIUS + 2));
    const br = `border-radius:${px(radius)};`;
    // When the UI's edge color is close to the background, strengthen the separation.
    const lowContrast = Math.abs((asset.edgeLuma ?? 0.5) - t.luma) < CONTRAST_THRESHOLD;
    const hairline = lowContrast ? t.hairlineStrong : t.hairline;
    const shadow = lowContrast ? t.shadowStrong : t.shadow;
    return {
      under: box(r, `${br}box-shadow:${shadow};background:${t.bg};`),
      over: box(r, `${br}box-shadow:inset 0 0 0 1px ${hairline};pointer-events:none;`),
      screen: { ...r, radius: px(radius), padTop: 0, fill: t.bg },
    };
  },
};

// ─── iPhone (Pro geometry, 402×874pt display) ───────────────────────────────

const IPHONE = { w: 402, h: 874, bezel: 0.046, band: 0.011, radius: 0.15, statusBar: 62 };

const FINISH = {
  black: {
    band: "linear-gradient(90deg,#4a4a4d 0%,#1d1d1f 3%,#2c2c2e 50%,#1d1d1f 97%,#4a4a4d 100%)",
    button: "#2a2a2c",
    alu: "linear-gradient(180deg,#38383b 0%,#1e1e20 60%,#141416 100%)",
    aluEdge: "#55555a",
    base: "linear-gradient(180deg,#2e2e31 0%,#1f1f21 45%,#111113 100%)",
  },
  silver: {
    band: "linear-gradient(90deg,#f4f4f6 0%,#b9b9be 3%,#dcdce0 50%,#b9b9be 97%,#f4f4f6 100%)",
    button: "#c4c4c8",
    alu: "linear-gradient(180deg,#eeeff1 0%,#d3d4d8 60%,#b4b5ba 100%)",
    aluEdge: "#fbfbfc",
    base: "linear-gradient(180deg,#e9eaec 0%,#d2d3d7 45%,#a9aaaf 100%)",
  },
};

const iphone: Frame = {
  aspect: () => (IPHONE.w * (1 + 2 * IPHONE.bezel)) / (IPHONE.h + IPHONE.w * 2 * IPHONE.bezel),
  render(asset, r, theme, opts) {
    const t = THEMES[theme];
    const f = FINISH[opts.finish ?? "black"];
    const u = r.w / (IPHONE.w * (1 + 2 * IPHONE.bezel)); // css px per pt
    const bez = IPHONE.w * IPHONE.bezel * u;
    const band = IPHONE.w * IPHONE.band * u;
    const sr = IPHONE.w * IPHONE.radius * u;
    const outerR = sr + bez;
    const screen: Rect = { x: r.x + bez, y: r.y + bez, w: r.w - 2 * bez, h: r.h - 2 * bez };

    // Side buttons [side, top pt, length pt]
    const buttons: [number, number, number][] = [
      [-1, 120, 32], [-1, 180, 58], [-1, 252, 58], // action, volume up, volume down
      [1, 210, 92], [1, 470, 48], // side button, camera control
    ];
    const btnW = 3.2 * u;
    const btns = buttons
      .map(([side, top, len]) =>
        box(
          { x: side < 0 ? r.x - btnW * 0.6 : r.x + r.w - btnW * 0.4, y: r.y + top * u, w: btnW, h: len * u },
          `border-radius:${px(btnW)};background:${f.button};`,
        ),
      )
      .join("");

    const under =
      btns +
      box(r, `border-radius:${px(outerR)};background:${f.band};box-shadow:${t.shadow};`) +
      box(
        { x: r.x + band, y: r.y + band, w: r.w - 2 * band, h: r.h - 2 * band },
        `border-radius:${px(outerR - band)};background:#050505;box-shadow:inset 0 0 0 ${px(0.6 * u)} rgba(255,255,255,.06);`,
      );

    const native = asset.source.type === "ios";
    const showStatus = opts.statusBar ?? !native;
    const padTop = showStatus ? IPHONE.statusBar * u : 0;
    const islandW = 126 * u;
    const islandH = 37 * u;
    const island = box(
      { x: screen.x + (screen.w - islandW) / 2, y: screen.y + 11 * u, w: islandW, h: islandH },
      `border-radius:${px(islandH)};background:#000;`,
    );

    let status = "";
    if (showStatus) {
      const ink = (asset.topLuma ?? 1) > 0.55 ? "#000" : "#fff";
      status = statusBar(screen, u, ink);
    }

    return {
      under,
      over: status + island,
      screen: { ...screen, radius: px(sr), padTop, fill: asset.topColor ?? "#fff" },
    };
  },
};

function statusBar(s: Rect, u: number, ink: string): string {
  const y = s.y + 21 * u;
  const h = 22 * u;
  const font = `font:600 ${px(17 * u)}/${px(h)} -apple-system,'SF Pro Text',system-ui,sans-serif;letter-spacing:-0.01em;`;
  const time = `<div style="position:absolute;left:${px(s.x + 50 * u)};top:${px(y)};width:${px(60 * u)};height:${px(h)};text-align:center;color:${ink};${font}">9:41</div>`;
  // Cellular, wifi, battery — drawn at 1pt = 1 unit.
  const icons = `<svg style="position:absolute;left:${px(s.x + s.w - 118 * u)};top:${px(y + 5 * u)}" width="${px(80 * u)}" height="${px(13 * u)}" viewBox="0 0 80 13" fill="${ink}">
    <rect x="0" y="8" width="3.2" height="4.4" rx="0.8"/><rect x="4.8" y="5.8" width="3.2" height="6.6" rx="0.8"/>
    <rect x="9.6" y="3.4" width="3.2" height="9" rx="0.8"/><rect x="14.4" y="1" width="3.2" height="11.4" rx="0.8"/>
    <path d="M31.5 3.2a10.6 10.6 0 0 1 7.4 3l1.2-1.3a12.4 12.4 0 0 0-17.2 0l1.2 1.3a10.6 10.6 0 0 1 7.4-3zm0 3.6a6.9 6.9 0 0 1 4.8 1.9l1.2-1.3a8.7 8.7 0 0 0-12 0l1.2 1.3a6.9 6.9 0 0 1 4.8-1.9zm0 3.6c.9 0 1.7.3 2.3.9l-2.3 2.4-2.3-2.4c.6-.6 1.4-.9 2.3-.9z"/>
    <rect x="47.5" y="0.5" width="24" height="12" rx="3.6" fill="none" stroke="${ink}" stroke-opacity=".4"/>
    <rect x="49.5" y="2.5" width="20" height="8" rx="2"/>
    <path d="M73.2 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" fill-opacity=".45"/>
  </svg>`;
  return time + icons;
}

// ─── MacBook Pro (3024×1964 display) ────────────────────────────────────────

const MBP = { aspect: 3024 / 1964, side: 0.017, top: 0.024, bottom: 0.026, base: 1.12, baseH: 0.021 };

function lidDims(lidW: number) {
  const sw = lidW / (1 + 2 * MBP.side);
  const sh = sw / MBP.aspect;
  return { sw, sh, lidH: sh + sw * (MBP.top + MBP.bottom) };
}

const macbook: Frame = {
  aspect() {
    const lidW = 1;
    const { lidH } = lidDims(lidW);
    return (lidW * MBP.base) / (lidH + lidW * MBP.baseH);
  },
  render(_asset, r, theme, opts) {
    const f = FINISH[opts.finish ?? "black"];
    const lidW = r.w / MBP.base;
    const { sw, sh, lidH } = lidDims(lidW);
    const lid: Rect = { x: r.x + (r.w - lidW) / 2, y: r.y, w: lidW, h: lidH };
    const screen: Rect = { x: lid.x + sw * MBP.side, y: lid.y + sw * MBP.top, w: sw, h: sh };
    const baseH = lidW * MBP.baseH;
    const baseY = lid.y + lidH;
    const lidR = lidW * 0.02;
    const shell = lidW * 0.0032; // aluminium rim around the glass
    const hingeH = baseH * 0.22;

    const under =
      // Soft contact shadow on the "table" — the lid stands, so only the base casts.
      box(
        { x: r.x - r.w * 0.02, y: baseY + baseH * 0.2, w: r.w * 1.04, h: baseH * 2.6 },
        `background:radial-gradient(50% 50% at 50% 30%,rgba(0,0,0,${theme === "dark" ? 0.7 : 0.22}),transparent 100%);`,
      ) +
      // Lid shell with a lit top edge.
      box(
        lid,
        `border-radius:${px(lidR)} ${px(lidR)} ${px(lidW * 0.003)} ${px(lidW * 0.003)};background:${f.alu};box-shadow:inset 0 ${px(Math.max(1, shell * 0.35))} 0 ${f.aluEdge};`,
      ) +
      // Black glass bezel.
      box(
        { x: lid.x + shell, y: lid.y + shell, w: lidW - 2 * shell, h: lidH - shell },
        `border-radius:${px(lidR - shell)} ${px(lidR - shell)} 0 0;background:linear-gradient(180deg,#0d0d0e,#050505);`,
      ) +
      // Camera.
      box(
        { x: lid.x + lidW / 2 - sw * 0.0022, y: lid.y + (sw * MBP.top) / 2 - sw * 0.0022, w: sw * 0.0044, h: sw * 0.0044 },
        `border-radius:50%;background:radial-gradient(circle at 40% 35%,#2a2d35,#0a0a0c 70%);box-shadow:0 0 0 ${px(sw * 0.0012)} #141416;`,
      ) +
      // Hinge.
      box(
        { x: lid.x + lidW * 0.06, y: baseY - hingeH * 0.4, w: lidW * 0.88, h: hingeH },
        `background:linear-gradient(180deg,#050505,#1e1e20);border-radius:0 0 ${px(hingeH)} ${px(hingeH)};`,
      ) +
      // Base: lit top edge, body gradient, rounded front.
      box(
        { x: r.x, y: baseY, w: r.w, h: baseH },
        `background:${f.base};border-radius:${px(baseH * 0.12)} ${px(baseH * 0.12)} ${px(r.w * 0.045)} ${px(r.w * 0.045)} / ${px(baseH * 0.12)} ${px(baseH * 0.12)} ${px(baseH * 0.9)} ${px(baseH * 0.9)};box-shadow:inset 0 ${px(Math.max(1, baseH * 0.07))} 0 ${f.aluEdge},inset 0 -${px(Math.max(1, baseH * 0.05))} 0 rgba(0,0,0,.25);`,
      ) +
      // Thumb scoop.
      box(
        { x: r.x + r.w * 0.43, y: baseY, w: r.w * 0.14, h: baseH * 0.36 },
        `background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.08));border-radius:0 0 ${px(baseH * 0.6)} ${px(baseH * 0.6)} / 0 0 ${px(baseH * 0.36)} ${px(baseH * 0.36)};`,
      );

    let over = "";
    if (opts.notch) {
      const nw = sw * 0.1;
      const nh = sw * 0.021;
      over = box(
        { x: screen.x + (sw - nw) / 2, y: screen.y - 1, w: nw, h: nh },
        `background:#060606;border-radius:0 0 ${px(nh * 0.4)} ${px(nh * 0.4)};`,
      );
    }
    return { under, over, screen: { ...screen, radius: `${px(sw * 0.006)} ${px(sw * 0.006)} 0 0`, padTop: 0, fill: "#000" } };
  },
};

// ─── Studio Display (5120×2880) ──────────────────────────────────────────────

const SD = { aspect: 16 / 9, bezel: 0.021, stand: 0.36 };

const display: Frame = {
  aspect() {
    const lidW = 1;
    const sw = lidW / (1 + 2 * SD.bezel);
    const lidH = sw / SD.aspect + 2 * sw * SD.bezel;
    return lidW / (lidH * (1 + SD.stand));
  },
  render(_asset, r, theme, opts) {
    const t = THEMES[theme];
    const f = FINISH[opts.finish ?? "silver"];
    const sw = r.w / (1 + 2 * SD.bezel);
    const b = sw * SD.bezel;
    const lidH = sw / SD.aspect + 2 * b;
    const lid: Rect = { x: r.x, y: r.y, w: r.w, h: lidH };
    const screen: Rect = { x: r.x + b, y: r.y + b, w: sw, h: sw / SD.aspect };
    const standH = lidH * SD.stand;
    const neckW = r.w * 0.15;
    const footW = r.w * 0.24;
    const footH = r.w * 0.012;

    const under =
      box({ x: r.x + (r.w - footW * 1.1) / 2, y: r.y + r.h - footH, w: footW * 1.1, h: footH }, `border-radius:50%;box-shadow:${t.shadow};`) +
      box(
        { x: r.x + (r.w - neckW) / 2, y: lid.y + lidH - b, w: neckW, h: standH - footH + b },
        `background:linear-gradient(90deg,rgba(0,0,0,.12),transparent 25%,transparent 75%,rgba(0,0,0,.12)),${f.alu};`,
      ) +
      box(
        { x: r.x + (r.w - footW) / 2, y: r.y + r.h - footH, w: footW, h: footH },
        `background:${f.alu};border-radius:${px(footH * 0.3)} ${px(footH * 0.3)} ${px(footH * 0.5)} ${px(footH * 0.5)};box-shadow:inset 0 1px 0 ${f.aluEdge};`,
      ) +
      box(lid, `border-radius:${px(r.w * 0.012)};background:${f.alu};box-shadow:${t.shadow},inset 0 1px 0 ${f.aluEdge};`) +
      box(
        { x: lid.x + r.w * 0.003, y: lid.y + r.w * 0.003, w: lid.w - r.w * 0.006, h: lid.h - r.w * 0.006 },
        `border-radius:${px(r.w * 0.01)};background:#060606;`,
      );
    return { under, over: "", screen: { ...screen, radius: "0", padTop: 0, fill: "#000" } };
  },
};

export const FRAMES: Record<FrameKind, Frame> = { none, iphone, macbook, display };

/** Recommended web viewports so captures match a frame's screen exactly. */
export const FRAME_VIEWPORTS: Partial<Record<FrameKind, string>> = {
  iphone: "402x812", // 874 − 62pt status bar
  macbook: "1512x982",
  display: "1600x900",
};
