#!/usr/bin/env node
// اختبار مولّد المستودعات الاصطناعية (AT-36): العدد، والحتمية، وغياب .git، وحدود الحجم.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gen = path.join(path.dirname(fileURLToPath(import.meta.url)), 'generate.mjs');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ayar-fx-synth-'));
const walk = (dir) => { const out = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else out.push(p); } })(dir); return out.sort(); };
const hashDir = (dir) => { const h = crypto.createHash('sha256'); for (const f of walk(dir)) { h.update(path.relative(dir, f)); h.update(fs.readFileSync(f)); } return h.digest('hex'); };
try {
  const a = path.join(tmp, 'a');
  const r = spawnSync(process.execPath, [gen, '--files', '1000', '--out', a], { encoding: 'utf8' });
  const info = JSON.parse(r.stdout.trim().split('\n').pop());
  check('1000 ملف بالضبط', walk(a).length === 1000 && info.files === 1000, `${walk(a).length}`);
  const b = path.join(tmp, 'b');
  spawnSync(process.execPath, [gen, '--preset', 'small', '--out', b]);
  check('حتمي: البذرة نفسها تعطي شجرة مطابقة بايتًا لبايت', hashDir(a) === hashDir(b));
  const c = path.join(tmp, 'c');
  spawnSync(process.execPath, [gen, '--files', '1000', '--seed', '2', '--out', c]);
  check('بذرة مختلفة تعطي محتوى مختلفًا', hashDir(a) !== hashDir(c));
  check('لا .git ولا node_modules', !fs.existsSync(path.join(a, '.git')) && !fs.existsSync(path.join(a, 'node_modules')));
  check('أكبر ملف أقل من 2 كيلوبايت', walk(a).every((f) => fs.statSync(f).size < 2048));
  const d = path.join(tmp, 'd');
  const r10 = spawnSync(process.execPath, [gen, '--preset', 'medium', '--out', d], { encoding: 'utf8' });
  check('10000 ملف (medium)', JSON.parse(r10.stdout.trim().split('\n').pop()).files === 10000 && walk(d).length === 10000);
  const again = spawnSync(process.execPath, [gen, '--files', '10', '--out', a], { encoding: 'utf8' });
  check('يرفض مجلدًا غير فارغ', again.status === 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\nأخفق ${failed} فحص` : '\nنجحت فحوص مولّد المستودعات الاصطناعية');
process.exit(failed ? 1 : 0);
