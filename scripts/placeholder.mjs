// Generate neutral gradient artwork at install time.
// The repository ships no binary assets: a content pack either provides its
// own illustrations, or gets auto-generated placeholders so the demo runs.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function hsv(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function makePng(seed, width, height) {
  const hue = (seed * 43 + 205) % 360;
  const [ar, ag, ab] = hsv(hue, 0.5, 0.09);
  const [br, bg, bb] = hsv((hue + 40) % 360, 0.6, 0.58);
  const cx = width * (0.3 + 0.36 * ((seed % 4) / 3));
  const cy = height * (0.3 + 0.36 * ((seed % 3) / 2));
  const radius = Math.min(width, height) * (0.2 + seed * 0.012);
  const raw = Buffer.alloc(height * (1 + width * 3));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / width) * 0.55 + (y / height) * 0.45;
      let r = ar + (br - ar) * t;
      let g = ag + (bg - ag) * t;
      let b = ab + (bb - ab) * t;
      const ring = Math.abs(Math.hypot(x - cx, y - cy) - radius);
      if (ring < 12) {
        const k = 1 - ring / 12;
        r += 110 * k;
        g += 95 * k;
        b += 55 * k;
      }
      raw[p++] = Math.min(255, r) | 0;
      raw[p++] = Math.min(255, g) | 0;
      raw[p++] = Math.min(255, b) | 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function generatePlaceholders({
  destDir,
  count,
  pattern = "scene_{n}.png",
  width = 1920,
  height = 1080,
}) {
  const w = Math.max(320, Math.min(1280, Math.round(width) || 1280));
  const h = Math.max(180, Math.round((w * (height || 1080)) / (width || 1920)));
  mkdirSync(destDir, { recursive: true });
  let bytes = 0;
  for (let n = 1; n <= count; n++) {
    const file = pattern.replace("{n}", String(n));
    const buf = makePng(n, w, h);
    writeFileSync(path.join(destDir, file), buf);
    bytes += buf.length;
  }
  return { count, width: w, height: h, bytes };
}
