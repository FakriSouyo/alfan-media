/**
 * Regenerates the Alfan Media brand assets in `public/` from the two source
 * logo PNGs (transparent background, one per theme).
 *
 *   node scripts/build-brand-assets.mjs <light-logo.png> <dark-logo.png>
 *
 * Outputs:
 *   public/brand/logo-light.webp / logo-dark.webp   full mark + wordmark
 *   public/brand/mark-light.webp / mark-dark.webp   geometric mark only
 *   public/favicon/*                                icons (mark for small
 *                                                   sizes, full logo on a
 *                                                   white tile for the
 *                                                   home-screen sizes)
 *
 * The mark is split from the wordmark automatically by finding the widest
 * fully transparent band between the top and bottom of the artwork, so a fresh
 * export with slightly different padding still works.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [lightSrc, darkSrc] = process.argv.slice(2);
if (!lightSrc || !darkSrc) {
  console.error(
    "usage: node scripts/build-brand-assets.mjs <light-logo.png> <dark-logo.png>",
  );
  process.exit(1);
}

const ROOT = process.cwd();
const BRAND_DIR = path.join(ROOT, "public", "brand");
const FAVICON_DIR = path.join(ROOT, "public", "favicon");
const ALPHA_THRESHOLD = 16;

async function readAlpha(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Bounding boxes for the mark and the mark + wordmark, plus the full canvas. */
async function layout(file) {
  const { data, width, height } = await readAlpha(file);
  const rowHasInk = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        rowHasInk[y] = 1;
        break;
      }
    }
  }

  const bboxOf = (yStart, yEnd) => {
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < 0) throw new Error(`no visible pixels in rows ${yStart}-${yEnd}`);
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
  };

  let first = 0;
  while (first < height && !rowHasInk[first]) first++;
  let last = height - 1;
  while (last > first && !rowHasInk[last]) last--;

  // Widest empty band in the middle = the gap between mark and wordmark.
  let gap = { start: -1, length: 0 };
  let runStart = -1;
  for (let y = first; y <= last; y++) {
    if (!rowHasInk[y]) {
      if (runStart < 0) runStart = y;
      const length = y - runStart + 1;
      if (length > gap.length) gap = { start: runStart, length };
    } else {
      runStart = -1;
    }
  }

  const mark = bboxOf(first, gap.start > 0 ? gap.start - 1 : last);
  const full = bboxOf(first, last);
  return { mark, full, width, height };
}

const trim = (img, box, padding, canvas) => {
  const pad = Math.round(Math.max(box.width, box.height) * padding);
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const width = Math.min(canvas.width - left, box.width + pad * 2);
  const height = Math.min(canvas.height - top, box.height + pad * 2);
  return img.clone().extract({ left, top, width, height });
};

/** Centres `box` in a square canvas of `side` px, optional solid background. */
async function squareIcon(img, box, side, { background } = {}) {
  const scale = Math.min(side / box.width, side / box.height);
  const drawnW = Math.max(1, Math.round(box.width * scale));
  const drawnH = Math.max(1, Math.round(box.height * scale));
  const art = await img
    .clone()
    .extract(box)
    .resize(drawnW, drawnH, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: art,
        left: Math.round((side - drawnW) / 2),
        top: Math.round((side - drawnH) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** Vista+ .ico files may embed PNG payloads directly. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const at = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(entry.buffer.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.buffer.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...entries.map((entry) => entry.buffer),
  ]);
}

await mkdir(BRAND_DIR, { recursive: true });
await mkdir(FAVICON_DIR, { recursive: true });

const [light, dark] = await Promise.all([sharp(lightSrc), sharp(darkSrc)]);
const [lightLayout, darkLayout] = await Promise.all([
  layout(lightSrc),
  layout(darkSrc),
]);

const webp = { quality: 92, effort: 6, alphaQuality: 100 };
const written = [];

async function save(file, buffer) {
  await writeFile(file, buffer);
  written.push(`${path.relative(ROOT, file)} (${(buffer.length / 1024).toFixed(1)} kB)`);
}

// Full wordmark, one per theme.
for (const [theme, img, box, layout] of [
  ["light", light, lightLayout.full, lightLayout],
  ["dark", dark, darkLayout.full, darkLayout],
]) {
  const buffer = await trim(img, box, 0.03, layout)
    .resize({ width: 640, withoutEnlargement: true })
    .webp(webp)
    .toBuffer();
  await save(path.join(BRAND_DIR, `logo-${theme}.webp`), buffer);
}

// Geometric mark only, one per theme.
for (const [theme, img, box, layout] of [
  ["light", light, lightLayout.mark, lightLayout],
  ["dark", dark, darkLayout.mark, darkLayout],
]) {
  const buffer = await trim(img, box, 0.03, layout)
    .resize({ width: 480, withoutEnlargement: true })
    .webp(webp)
    .toBuffer();
  await save(path.join(BRAND_DIR, `mark-${theme}.webp`), buffer);
}

// Tab icons: the mark alone stays legible where the wordmark cannot.
const markBox = lightLayout.mark;
const tile = { r: 255, g: 255, b: 255, alpha: 1 };
const tabIcon = async (size) =>
  squareIcon(light, markBox, size, { background: tile });
const homeIcon = async (size) =>
  squareIcon(light, lightLayout.full, size, { background: tile });

const tiny = await tabIcon(16);
const small = await tabIcon(32);
const medium = await tabIcon(48);
await save(path.join(FAVICON_DIR, "favicon-16x16.png"), tiny);
await save(path.join(FAVICON_DIR, "favicon-32x32.png"), small);
await save(path.join(FAVICON_DIR, "favicon-48x48.png"), medium);

await save(
  path.join(FAVICON_DIR, "favicon.ico"),
  buildIco([
    { size: 16, buffer: tiny },
    { size: 32, buffer: small },
    { size: 48, buffer: medium },
  ]),
);

await save(
  path.join(FAVICON_DIR, "apple-touch-icon.png"),
  await homeIcon(180),
);
await save(
  path.join(FAVICON_DIR, "android-chrome-192x192.png"),
  await homeIcon(192),
);
await save(
  path.join(FAVICON_DIR, "android-chrome-512x512.png"),
  await homeIcon(512),
);

console.log(written.join("\n"));
