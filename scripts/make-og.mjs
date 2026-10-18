// Pembuat og-default.png — murni Node (zlib bawaan), TANPA dependency gambar.
// Kanvas RGBA → PNG 8-bit RGBA valid, 1200×630 (standar Open Graph).
// Isi gambar: gradasi biru brand + ikon koper + teks "LOKERKU" (bitmap font 5×7).
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** Encode buffer RGBA (w*h*4) menjadi PNG valid. */
export function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = w * 4 + 1; // +1 byte filter per scanline
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bitmap font 5×7 — hanya huruf yang dipakai teks OG.
const GLYPHS = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

export function makeOgPNG({ w = 1200, h = 630, text = 'LOKERKU' } = {}) {
  const px = Buffer.alloc(w * h * 4);
  const set = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    if (a >= 1) {
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    } else {
      px[i] = Math.round(r * a + px[i] * (1 - a));
      px[i + 1] = Math.round(g * a + px[i + 1] * (1 - a));
      px[i + 2] = Math.round(b * a + px[i + 2] * (1 - a));
      px[i + 3] = 255;
    }
  };
  const rect = (x0, y0, rw, rh, c, a) => {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) set(x, y, c, a);
  };
  const rrect = (x0, y0, rw, rh, rad, c) => {
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        const dx = x < x0 + rad ? x0 + rad - x : x >= x0 + rw - rad ? x - (x0 + rw - rad - 1) : 0;
        const dy = y < y0 + rad ? y0 + rad - y : y >= y0 + rh - rad ? y - (y0 + rh - rad - 1) : 0;
        if (dx * dx + dy * dy <= rad * rad) set(x, y, c);
      }
    }
  };

  // 1. Latar gradasi biru brand (atas → bawah).
  const top = [11, 95, 255];
  const bottom = [7, 52, 163];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const col = top.map((v, i) => Math.round(v + (bottom[i] - v) * t));
    for (let x = 0; x < w; x++) set(x, y, col);
  }

  // 2. Ornamen: dua lingkaran translusen.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d1 = (x - 1100) ** 2 + (y - 90) ** 2;
      const d2 = (x - 90) ** 2 + (y - 560) ** 2;
      if (d1 < 150 * 150) set(x, y, [255, 255, 255], 0.08);
      if (d2 < 110 * 110) set(x, y, [255, 255, 255], 0.06);
    }
  }

  // 3. Ikon koper (briefcase) di tengah-atas.
  const white = [255, 255, 255];
  rrect(460, 195, 280, 170, 20, white); // badan
  rect(545, 160, 14, 48, white); // pegangan kiri
  rect(641, 160, 14, 48, white); // pegangan kanan
  rect(545, 160, 110, 14, white); // pegangan atas
  rect(460, 268, 280, 20, [11, 95, 255]); // sabuk biru
  rect(578, 262, 44, 32, [8, 66, 201]); // kaitan

  // 4. Teks brand dengan bitmap font.
  const scale = 15;
  const gap = 10;
  const cw = 5 * scale;
  const ch = 7 * scale;
  const totalW = text.length * cw + (text.length - 1) * gap;
  let tx = Math.round((w - totalW) / 2);
  const ty = Math.round(h / 2 + 105);
  for (const ch of text) {
    const rows = GLYPHS[ch];
    if (rows) {
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) {
          if (row[rx] === '1') rect(tx + rx * scale, ty + ry * scale, scale, scale, white);
        }
      });
    }
    tx += cw + gap;
  }

  return encodePNG(w, h, px);
}
