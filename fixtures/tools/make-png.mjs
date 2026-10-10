#!/usr/bin/env node
// يولّد أيقونة PNG مربعة بلون واحد ودائرة داخلية بسيطة، دون تبعيات (zlib فقط).
//   node fixtures/tools/make-png.mjs <الحجم> <الملف> [لون hex]
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(size, hex = '1a73e8') {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = (size - 1) / 2, rad = size * 0.42;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const inside = (x - c) ** 2 + (y - c) ** 2 <= rad ** 2;
      raw[o] = inside ? r : 255; raw[o + 1] = inside ? g : 255; raw[o + 2] = inside ? b : 255; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [size, file, color] = process.argv.slice(2);
  fs.writeFileSync(file, png(Number(size), color));
}
