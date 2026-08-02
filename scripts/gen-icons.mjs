// Generate brass-case PWA icons (192, 512, apple-touch 180) as PNGs — no deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Brass briefcase on near-black mahogany, radial vignette.
function icon(u, v) {
  const dx = u - 0.5, dy = v - 0.5;
  const r = Math.hypot(dx, dy);
  let bg = [11 + 20 * Math.max(0, 1 - r * 1.6), 9 + 14 * Math.max(0, 1 - r * 1.6), 6, 255];
  // Case body: rounded-ish rect from (0.22,0.38) to (0.78,0.78)
  const inRect = (x0, y0, x1, y1, rad) => {
    const cx = Math.max(x0 + rad, Math.min(x1 - rad, u));
    const cy = Math.max(y0 + rad, Math.min(y1 - rad, v));
    return Math.hypot(u - cx, v - cy) <= rad;
  };
  if (inRect(0.22, 0.40, 0.78, 0.78, 0.06)) {
    const shade = 1 - (v - 0.40) * 0.5;
    bg = [212 * shade, 175 * shade, 55 * shade, 255];
    // border
    if (!inRect(0.245, 0.425, 0.755, 0.755, 0.05)) bg = [90, 74, 24, 255];
  }
  // Handle
  if (inRect(0.40, 0.30, 0.60, 0.42, 0.035) && !inRect(0.44, 0.34, 0.56, 0.42, 0.02)) {
    bg = [138, 115, 38, 255];
  }
  // Latch
  if (inRect(0.46, 0.52, 0.54, 0.60, 0.02)) bg = [245, 240, 225, 255];
  return bg;
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(join(outDir, name), png(size, icon));
  console.log('wrote', name, size);
}
