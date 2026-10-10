#!/usr/bin/env node
// خادم اختبار محلي لسلامة تجهيز الأدوات (AT-35، DEV-1 المهمة 9). للاختبار فقط: يربط 127.0.0.1 ولا يخرج من الجهاز.
//
//   node fixtures/tools/tool-server/server.mjs [--port 0] [--honest] [--catalog-out <ملف>] [--verified-days-ago 200]
//
// يقدّم أداة مصطنعة «ayar-fake-tool» 1.0.0:
//   - الوضع الافتراضي (معدَّلة): الملف المقدَّم بايتاته غير الأصلية، فبصمته لا تطابق بصمة الكتالوج → يجب أن يرفض عِيَار التثبيت،
//     ويحذف الملف، ويرفع تنبيهًا أمنيًّا، ويكتب قيد تدقيق.
//   - --honest (ضابط سلبي): يقدّم البايتات الأصلية فتطابق البصمة.
// ويكتب مدخل كتالوج تجريبيًّا (--catalog-out) تاريخ تحققه قبل N يومًا (الافتراضي 200 > 180 فيظهر تنبيه التقادم) وبصمة الأصل.
// يطبع سطر JSON واحدًا عند الجاهزية: {"port":...,"url":...,"catalog":...}.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const honest = argv.includes('--honest');
const port = Number(opt('port', '0'));
const daysAgo = Number(opt('verified-days-ago', '200'));
const catalogOut = opt('catalog-out');

// أداة مصطنعة: أرشيف tar.gz صغير (ملف واحد bin/ayar-fake-tool)
function tarGz(files) {
  const blocks = [];
  for (const [name, content] of files) {
    const body = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    header.write('0000755\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('        ', 148);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    let sum = 0;
    for (const b of header) sum += b;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 });
}
const original = tarGz([['bin/ayar-fake-tool', '#!/bin/sh\necho "ayar-fake-tool 1.0.0"\n']]);
const tampered = tarGz([['bin/ayar-fake-tool', '#!/bin/sh\necho "ayar-fake-tool 1.0.0"\necho "payload: هذا ملف معدَّل للاختبار فقط"\n']]);
const served = honest ? original : tampered;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const server = http.createServer((req, res) => {
  if (req.url === '/tool/ayar-fake-tool-1.0.0.tar.gz') {
    res.writeHead(200, { 'content-type': 'application/gzip', 'content-length': served.length, 'x-ayar-test-only': '1' });
    res.end(served);
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(port, '127.0.0.1', () => {
  const p = server.address().port;
  const verified = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  const catalog = {
    schema: 'tool-catalog-entry-fixture/1',
    $comment: 'مدخل كتالوج تجريبي لاختبار AT-35: البصمة للبايتات الأصلية، والخادم يقدّم بايتات معدَّلة ما لم يُشغَّل بـ --honest. لا يمثل الصيغة النهائية للكتالوج (تحددها DEV-8).',
    tool: 'ayar-fake-tool',
    version: '1.0.0',
    url: `http://127.0.0.1:${p}/tool/ayar-fake-tool-1.0.0.tar.gz`,
    sha256: sha(original),
    served_sha256: sha(served),
    license: 'MIT',
    source: 'fixtures/tools/tool-server (اختبار فقط)',
    verified_at: verified,
    verified_days_ago: daysAgo,
    tampered: !honest,
  };
  if (catalogOut) fs.writeFileSync(catalogOut, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(JSON.stringify({ port: p, url: catalog.url, catalog: catalogOut ?? null, tampered: !honest }));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
