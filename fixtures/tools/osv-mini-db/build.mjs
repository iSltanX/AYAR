#!/usr/bin/env node
// قاعدة OSV المصغرة (DEV-2، E-09): تبني من السجلات في records/<Ecosystem>/*.json ملفات all.zip بالتخطيط الذي يقرؤه
// osv-scanner 2.6.0 دون اتصال: <cache>/osv-scalibr/<Ecosystem>/all.zip (OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=<cache>).
//
//   node fixtures/tools/osv-mini-db/build.mjs --out <مجلد-cache>
//
// بلا تبعيات: كاتب ZIP بطريقة التخزين (store) فقط وبتواريخ ثابتة، فالمخرج حتمي. الملفات .zip لا تُلتزم (.gitignore)،
// بل تُبنى وقت الاختبار. السجلات مصطنعة كلها (ayar-vuln-fake) وليست ثغرات حقيقية.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const i = argv.indexOf('--out');
const out = i >= 0 ? path.resolve(argv[i + 1]) : null;
if (!out) { console.error('الاستخدام: build.mjs --out <مجلد-cache>'); process.exit(2); }

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
// تاريخ DOS ثابت: 1980-01-01 00:00 (كما في قاعدة OSV الأصلية التي تُظهر 00-00-1980)
const DOS_TIME = u16(0), DOS_DATE = u16(0x21);

export function zipStore(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), DOS_TIME, DOS_DATE, u32(crc), u32(data.length), u32(data.length), u16(nameBuf.length), u16(0), nameBuf, data]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), DOS_TIME, DOS_DATE, u32(crc), u32(data.length), u32(data.length), u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, central, eocd]);
}

const recordsRoot = path.join(here, 'records');
const built = [];
for (const eco of fs.readdirSync(recordsRoot).sort()) {
  const dir = path.join(recordsRoot, eco);
  if (!fs.statSync(dir).isDirectory()) continue;
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const data = fs.readFileSync(path.join(dir, f));
    JSON.parse(data); // يجب أن يكون JSON صالحًا
    return { name: f, data };
  });
  const dest = path.join(out, 'osv-scalibr', eco);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'all.zip'), zipStore(entries));
  built.push({ ecosystem: eco, records: entries.map((e) => e.name), zip: path.join(dest, 'all.zip') });
}
console.log(JSON.stringify({ out, built }));
