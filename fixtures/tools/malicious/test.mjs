#!/usr/bin/env node
// اختبار مولّد FX-MALICIOUS (DEV-1، المهمة 7): يثبت أن المولّد لا يشغّل `git` في المستودع المولَّد بعد ضبط الفخاخ،
// وأن الفخاخ موجودة ومكتوبة صحيحة، وأن ملفات العلامة غائبة، وأن بنية المستودع سليمة (على نسخة بلا فخاخ فقط).
//
//   node fixtures/tools/malicious/test.mjs
//
// ما يُشغَّل وما لا يُشغَّل:
//   - على المستودع المفخخ: لا شيء إطلاقًا عدا قراءة الملفات بـ fs (لا git ولا أي أمر).
//   - نص أمر كل فخ يُنفَّذ مباشرة بـ sh (لا عبر git) في مجلد العلامات لإثبات أنه صحيح وأنه يكتب علامته، ثم تُحذف العلامة.
//   - أوامر git تُشغَّل على نسخة بلا فخاخ مولَّدة بـ --no-traps فقط (الكائنات والمراجع مطابقة بايتًا لبايت).

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const generator = path.join(here, 'generate.mjs');
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ayar-fx-malicious-test-'));

try {
  // 1) المصدر لا يستورد child_process ولا يذكر استدعاء أوامر
  const code = fs.readFileSync(generator, 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  check('المولّد لا يستورد child_process ولا يستدعي أمرًا (الشيفرة بلا تعليقاتها)', !/child_process|execSync|spawnSync|execFile|\bspawn\(/.test(code));

  // 2) مولّد تحت PATH فيه git مزيف يسجل كل استدعاء: يجب ألا يُستدعى أبدًا
  const shim = path.join(tmp, 'shim');
  fs.mkdirSync(shim);
  const gitLog = path.join(tmp, 'git-calls.log');
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\necho "$@" >> "${gitLog}"\nexit 99\n`, { mode: 0o755 });
  const armedDir = path.join(tmp, 'armed');
  const run = spawnSync(process.execPath, [generator, '--out', armedDir, '--huge-mb', '8'], { env: { ...process.env, PATH: `${shim}:${process.env.PATH}` }, encoding: 'utf8' });
  check('المولّد ينتهي بنجاح', run.status === 0, run.stderr);
  check('لم يُستدعَ git أثناء التوليد (سجل الـshim فارغ)', !fs.existsSync(gitLog) || fs.readFileSync(gitLog, 'utf8') === '');

  // 3) الفخاخ موجودة ومطابقة لما في MANIFEST
  const manifest = JSON.parse(fs.readFileSync(path.join(armedDir, 'MANIFEST.json'), 'utf8'));
  const repo = path.join(armedDir, 'repo');
  const cfgText = fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8');
  check('core.fsmonitor معرّف في .git/config', /^\tfsmonitor = "/m.test(cfgText));
  check('[diff "evildiff"] command معرّف', /\[diff "evildiff"\]\n\tcommand = "/.test(cfgText));
  check('[diff "eviltext"] textconv معرّف', /\[diff "eviltext"\]\n\ttextconv = "/.test(cfgText));
  const attrs = fs.readFileSync(path.join(repo, '.gitattributes'), 'utf8');
  check('.gitattributes يربط *.js بالفرق و*.py بالتحويل النصي', /\*\.js diff=evildiff/.test(attrs) && /\*\.py diff=eviltext/.test(attrs));

  // 4) ملفات العلامة غائبة بعد التوليد
  const listMarkers = (dir) => { const out = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) w(p); else if (e.name.endsWith('.marker')) out.push(p); } })(dir); return out; };
  check('لا ملفات علامة في أي مكان بعد التوليد', listMarkers(armedDir).length === 0, listMarkers(armedDir).join(','));
  check('مجلد العلامات فارغ', fs.readdirSync(manifest.markers_dir).length === 0);

  // 5) نص كل فخ صحيح: يُقرأ من نسخة من ملف الإعداد خارج المستودع (لا git على المستودع)، ثم يُنفَّذ بـ sh مباشرة
  const cfgCopy = path.join(tmp, 'config-copy');
  fs.copyFileSync(path.join(repo, '.git', 'config'), cfgCopy);
  const read = (key) => spawnSync('git', ['config', '--file', cfgCopy, '--get', key], { encoding: 'utf8' }).stdout.replace(/\n$/, '');
  for (const [key, id, extra] of [['core.fsmonitor', 'fsmonitor', ''], ['diff.evildiff.command', 'diff-driver', ''], ['diff.eviltext.textconv', 'textconv', ' /dev/null']]) {
    const value = read(key);
    const trap = manifest.traps.find((t) => t.id === id);
    check(`${key}: القيمة المقروءة من الإعداد = أمر MANIFEST`, value === trap.command, value.slice(0, 80));
    const r = spawnSync('/bin/sh', ['-c', `${value}${extra}`], { encoding: 'utf8' });
    const wrote = fs.existsSync(trap.marker);
    check(`${key}: تنفيذ نص الأمر بـ sh يكتب علامته (إثبات أن الفخ فعّال لو استدعاه git)`, r.status === 0 && wrote && /^\d+$/.test(fs.readFileSync(trap.marker, 'utf8').trim()));
    if (wrote) fs.rmSync(trap.marker);
  }
  check('العلامات حُذفت بعد التجربة', listMarkers(armedDir).length === 0);

  // 6) الشجرة: ملفات الفحص الساكن، و.env، والرابط الرمزي، والملف الضخم، والسر القديم غائب عن الشجرة
  check('src/app.js وsrc/util.py موجودان', fs.existsSync(path.join(repo, 'src/app.js')) && fs.existsSync(path.join(repo, 'src/util.py')));
  check('.env بقيمة مصطنعة معروفة', fs.readFileSync(path.join(repo, '.env'), 'utf8').includes(manifest.fake_secrets.env));
  check('.env مستبعد بـ .gitignore', fs.readFileSync(path.join(repo, '.gitignore'), 'utf8').split('\n').includes('.env'));
  const link = path.join(repo, 'external');
  check('external رابط رمزي إلى خارج الجذر', fs.lstatSync(link).isSymbolicLink() && fs.readlinkSync(link) === path.join('..', 'outside') && fs.existsSync(path.join(armedDir, 'outside', 'outside-secret.txt')));
  check('huge.bin بالحجم المطلوب', fs.statSync(path.join(repo, 'huge.bin')).size === 8 * 1024 * 1024);
  check('السر القديم غائب عن الشجرة الحالية', !fs.existsSync(path.join(repo, 'config')) && !JSON.stringify([...fs.readdirSync(path.join(repo, 'src'))]).includes('credentials'));

  // 7) نسخة بلا فخاخ: كائنات ومراجع مطابقة بايتًا لبايت، والإعداد وحده يختلف
  const plainDir = path.join(tmp, 'plain');
  const run2 = spawnSync(process.execPath, [generator, '--out', plainDir, '--huge-mb', '8', '--no-traps'], { encoding: 'utf8' });
  check('النسخة بلا فخاخ تولَّد', run2.status === 0, run2.stderr);
  const hashTree = (dir) => { const h = crypto.createHash('sha256'); (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); } } })(dir); return h.digest('hex'); };
  const plainRepo = path.join(plainDir, 'repo');
  check('.git/objects مطابقة بايتًا لبايت', hashTree(path.join(repo, '.git', 'objects')) === hashTree(path.join(plainRepo, '.git', 'objects')));
  check('HEAD والمراجع مطابقة', hashTree(path.join(repo, '.git', 'refs')) === hashTree(path.join(plainRepo, '.git', 'refs')) && fs.readFileSync(path.join(repo, '.git', 'HEAD'), 'utf8') === fs.readFileSync(path.join(plainRepo, '.git', 'HEAD'), 'utf8'));
  check('ملف config وحده يختلف (الفخاخ)', fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8') !== fs.readFileSync(path.join(plainRepo, '.git', 'config'), 'utf8'));

  // 8) صحة بنية المستودع بأوامر git الآمنة على النسخة بلا فخاخ فقط
  const g = (args) => spawnSync('git', ['-C', plainRepo, ...args], { encoding: 'utf8' });
  const fsck = g(['fsck', '--full', '--strict']);
  check('git fsck --full --strict نظيف', fsck.status === 0 && !/error|missing|corrupt/i.test(fsck.stdout + fsck.stderr), fsck.stderr);
  const log = g(['log', '--format=%H %s']).stdout.trim().split('\n');
  check('التزامان: الأول يضم المفتاح، والثاني يحذفه', log.length === 2 && log[0].startsWith(manifest.head) && log[1].startsWith(manifest.first_commit), log.join(' | '));
  check('السر القديم في التزام الأول', g(['show', `${manifest.first_commit}:config/old-credentials.js`]).stdout.includes(manifest.fake_secrets.history));
  check('السر القديم غائب عن شجرة HEAD', !g(['ls-tree', '-r', '--name-only', 'HEAD']).stdout.includes('config/'));
  check('محتوى HEAD:src/app.js مطابق للملف', g(['show', 'HEAD:src/app.js']).stdout === fs.readFileSync(path.join(plainRepo, 'src/app.js'), 'utf8'));
  check('لا مستودع متداخل غير .git الجذري', !fs.existsSync(path.join(plainRepo, 'src', '.git')));

  // 9) فاحص الأسرار يكشف السر القديم في التاريخ (AT-42) على النسخة بلا فخاخ
  const report = path.join(tmp, 'gl.json');
  const gl = spawnSync('gitleaks', ['git', plainRepo, '--redact=100', '--no-banner', '--exit-code', '42', '--report-format', 'json', '--report-path', report], { encoding: 'utf8' });
  if (gl.error) console.log('⏸ gitleaks غير متاح: لم يُشغَّل فحص التاريخ');
  else {
    const found = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : [];
    check('gitleaks git يكشف السر القديم (رمز 42) في config/old-credentials.js', gl.status === 42 && found.some((f) => f.File === 'config/old-credentials.js' && f.Commit === manifest.first_commit), `status=${gl.status} ${found.length}`);
    check('تقرير gitleaks مُخفى القيمة (لا يحوي السر)', !fs.readFileSync(report, 'utf8').includes(manifest.fake_secrets.history));
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\nأخفق ${failed} فحص` : '\nنجحت كل فحوص مولّد FX-MALICIOUS');
process.exit(failed ? 1 : 0);
