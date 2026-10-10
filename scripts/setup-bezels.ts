#!/usr/bin/env bun
/**
 * Downloads Apple's official product bezels (developer.apple.com/design/resources) into
 * assets/bezels/ (gitignored), copies the variants the frames use, and measures them.
 * Mounting each DMG accepts Apple's bezel license. Re-run to refresh.
 *
 *   bun scripts/setup-bezels.ts
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../src/capture";
import { run } from "../src/util";

const DIR = join(ROOT, "assets/bezels");
const DL = join(DIR, "_dl");
const CDN = "https://devimages-cdn.apple.com/design/resources/download/";

/** DMG → [path inside its PNG/ folder, our name]. */
const PACKS: Record<string, [string, string][]> = {
  "Bezel-iPhone-18": [
    ["iPhone 18 Pro/iPhone 18 Pro - Black - Portrait.png", "iphone-black"],
    ["iPhone 18 Pro/iPhone 18 Pro - Silver - Portrait.png", "iphone-silver"],
  ],
  "Bezel-iPad-Pro-(M5)": [
    ['iPad Pro (M5) 13" - Space Black - Portrait.png', "ipad-black-portrait"],
    ['iPad Pro (M5) 13" - Space Black - Landscape.png', "ipad-black-landscape"],
    ['iPad Pro (M5) 13" - Silver - Portrait.png', "ipad-silver-portrait"],
    ['iPad Pro (M5) 13" - Silver - Landscape.png', "ipad-silver-landscape"],
  ],
  "Bezel-MacBook-Pro-M5": [
    ["MacBook Pro M5 14-inch Space Black.png", "macbook-black"],
    ["MacBook Pro M5 14-inch Silver.png", "macbook-silver"],
  ],
  "Bezel-Studio-Displays": [
    ["Studio Display 2026 On Dark Background.png", "display-dark"],
    ["Studio Display 2026 On Light Background.png", "display-light"],
  ],
};

mkdirSync(DL, { recursive: true });
for (const [pack, files] of Object.entries(PACKS)) {
  const dmg = join(DL, `${pack}.dmg`);
  console.log(`▸ ${pack}`);
  await run(["curl", "-sfL", "-o", dmg, CDN + encodeURI(pack) + ".dmg"]);
  const mnt = join("/tmp", `bezel-${pack}`);
  mkdirSync(mnt, { recursive: true });
  // Each DMG opens with Apple's license agreement; `yes` accepts it.
  await run(["bash", "-c", `yes | hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "${mnt}" "${dmg}" >/dev/null`]);
  try {
    for (const [src, name] of files) copyFileSync(join(mnt, "PNG", src), join(DIR, `${name}.png`));
  } finally {
    await run(["hdiutil", "detach", "-quiet", mnt]);
  }
}
await run(["bun", join(ROOT, "scripts/measure-bezels.ts")]).then((o) => console.log(o));
