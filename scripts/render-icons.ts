// Generates PWA/tab icons from public/icon-source.svg (lyre artwork, no disc baked in —
// unlike coche's logo svgs, the background is composited here). Run: `node scripts/render-icons.ts`.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

const artwork = readFileSync(join(pub, "icon-source.svg"));

const LIGHT_DISC = "#ffffff";

const circleSvg = ({ size, fill }: { size: number; fill: string }) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/></svg>`,
  );

// Disc background: circle sized to match, artwork composited at 1:1 (icon-source already
// carries the same margin as favicon-light.svg, so no extra shrink is needed).
const disc = async ({ size, out }: { size: number; out: string }) => {
  const bg = await sharp(circleSvg({ size, fill: LIGHT_DISC }))
    .png()
    .toBuffer();
  const art = await sharp(artwork).resize(size, size).png().toBuffer();
  return sharp(bg)
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toFile(join(pub, out));
};

// Square background: artwork shrunk into the ~80% maskable safe zone.
const SAFE = 0.8;
const masked = async ({ size, out }: { size: number; out: string }) => {
  const inner = Math.round(size * SAFE);
  const art = await sharp(artwork).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: LIGHT_DISC } })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toFile(join(pub, out));
};

await Promise.all([
  disc({ size: 48, out: "favicon.png" }),
  disc({ size: 192, out: "icon-192.png" }),
  disc({ size: 512, out: "icon-512.png" }),
  masked({ size: 512, out: "icon-maskable-512.png" }),
  masked({ size: 180, out: "apple-touch-icon.png" }),
]);
console.log("icons generated");
