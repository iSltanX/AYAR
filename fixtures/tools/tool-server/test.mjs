#!/usr/bin/env node
// اختبار خادم الأداة المعدّلة (AT-35): الوضع الافتراضي بصمته لا تطابق، و--honest تطابق، والتقادم أكبر من 180 يومًا.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ayar-fx-toolserver-'));

async function session(extra) {
  const catalogFile = path.join(tmp, `catalog-${extra.join('')}.json`);
  const child = spawn(process.execPath, [server, '--catalog-out', catalogFile, ...extra], { stdio: ['ignore', 'pipe', 'inherit'] });
  const info = await new Promise((resolve) => child.stdout.once('data', (d) => resolve(JSON.parse(d.toString()))));
  const bytes = Buffer.from(await (await fetch(info.url)).arrayBuffer());
  child.kill('SIGTERM');
  await new Promise((r) => child.once('close', r));
  return { info, bytes, catalog: JSON.parse(fs.readFileSync(catalogFile, 'utf8')) };
}
try {
  const bad = await session([]);
  const sha = crypto.createHash('sha256').update(bad.bytes).digest('hex');
  check('الوضع الافتراضي: بصمة الملف المقدَّم لا تطابق بصمة الكتالوج', sha !== bad.catalog.sha256 && sha === bad.catalog.served_sha256);
  check('الخادم يربط 127.0.0.1 فقط', bad.info.url.startsWith('http://127.0.0.1:'));
  const age = (Date.now() - Date.parse(bad.catalog.verified_at)) / 86400000;
  check('تاريخ التحقق أقدم من 180 يومًا (تنبيه التقادم)', age > 180, `${age.toFixed(0)} يومًا`);
  const tgz = path.join(tmp, 'tool.tar.gz');
  fs.writeFileSync(tgz, bad.bytes);
  const listing = spawnSync('tar', ['tzf', tgz], { encoding: 'utf8' });
  check('tar tzf يقرأ الأرشيف المعدَّل (bin/ayar-fake-tool)', listing.status === 0 && listing.stdout.includes('bin/ayar-fake-tool'), listing.stderr);
  const good = await session(['--honest', '--verified-days-ago', '10']);
  check('--honest: البصمة تطابق (ضابط سلبي)', crypto.createHash('sha256').update(good.bytes).digest('hex') === good.catalog.sha256);
  check('--verified-days-ago 10: لا تقادم', (Date.now() - Date.parse(good.catalog.verified_at)) / 86400000 < 180);
  check('الأرشيف المعدَّل أكبر بايتات من الأصلي لكنه ما زال gzip صالحًا', bad.bytes[0] === 0x1f && bad.bytes[1] === 0x8b);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\nأخفق ${failed} فحص` : '\nنجحت فحوص خادم الأداة المعدّلة');
process.exit(failed ? 1 : 0);
