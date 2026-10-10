// E-09 (1): تنزيل قاعدتي OSV (npm وPyPI) بأعلام osv-scanner 2.6.0 نفسها إلى مجلد خارج المستودع، وقياس الزمن والحجم والتخطيط.
// ثم فحص دون اتصال على المشروع نفسه وقياس زمنه. المجلد: ~/.cache/ayar-dev2/osv-db (OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY).
//   node spikes/E-09-osv-offline/download-db.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DEV2_CACHE, FIXTURES, baseEnv, excerpt, resultsDir, run, sha256File, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const dbDir = path.join(DEV2_CACHE, 'osv-db');
fs.mkdirSync(dbDir, { recursive: true });
// مشروع صغير فيه قفل npm وقفل uv (من مشاريع الاختبار) ليطلب osv-scanner القاعدتين
const proj = tmpdir('ayar-e09-proj');
fs.mkdirSync(path.join(proj, 'js')); fs.mkdirSync(path.join(proj, 'py'));
fs.copyFileSync(path.join(FIXTURES, 'FX-ADAPTERS', 'base', 'osv', 'package-lock.json'), path.join(proj, 'js', 'package-lock.json'));
fs.copyFileSync(path.join(FIXTURES, 'FX-ADAPTERS', 'base', 'osv', 'package.json'), path.join(proj, 'js', 'package.json'));
fs.copyFileSync(path.join(FIXTURES, 'FX-PY', 'base', 'uv.lock'), path.join(proj, 'py', 'uv.lock'));
fs.copyFileSync(path.join(FIXTURES, 'FX-PY', 'base', 'pyproject.toml'), path.join(proj, 'py', 'pyproject.toml'));

const env = baseEnv({ OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: dbDir });
const out = { at: new Date().toISOString(), dbDir: dbDir.replaceAll(process.env.HOME, '~'), steps: [] };
const step = async (name, cmd, extra = {}) => { const r = await run(cmd, { cwd: proj, env: { ...env, ...extra }, timeout: 1200 }); const row = { name, cmd, code: r.code, ms: r.ms, stdout: excerpt(r.out, 800), stderr: excerpt(r.err, 1200) }; out.steps.push(row); console.log(`• ${name}: exit=${r.code} ${(r.ms / 1000).toFixed(1)}s`); return r; };

// ترويسات HTTP للقاعدتين (التاريخ والحجم المعلنان)
for (const eco of ['npm', 'PyPI']) {
  const h = await run(`curl -sI https://osv-vulnerabilities.storage.googleapis.com/${eco}/all.zip | grep -iE "^(last-modified|content-length|etag)"`);
  out.steps.push({ name: `HEAD ${eco}/all.zip`, stdout: h.out.trim() });
}
// 1) التنزيل بأعلام الأداة (يُنزّل قواعد المنظومات التي يجدها في المشروع فقط)، مع تعطيل تحليل الاستدعاء
await step('download: scan source --download-offline-databases --offline-vulnerabilities', `osv-scanner scan source -r . --download-offline-databases --offline-vulnerabilities --no-call-analysis=all --format json --output ${path.join(proj, 'first.json')}`);
// 2) التخطيط والحجم والبصمات
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push({ path: path.relative(dbDir, p), bytes: fs.statSync(p).size, sha256: e.name.endsWith('.zip') ? sha256File(p) : undefined, mtime: fs.statSync(p).mtime.toISOString() }); } };
walk(dbDir);
out.layout = files;
const du = await run(`du -sk "${dbDir}" | cut -f1`);
out.totalKB = Number(du.out.trim());
console.log('layout:', JSON.stringify(files, null, 1));
// محتوى القاعدة: عدد السجلات وعيّنة أسماء (لمعرفة الصيغة التي تحتاجها القاعدة المصغرة)
for (const f of files.filter((x) => x.path.endsWith('.zip'))) {
  const l = await run(`unzip -l "${path.join(dbDir, f.path)}" | tail -1; unzip -l "${path.join(dbDir, f.path)}" | head -8`);
  out.steps.push({ name: `unzip -l ${f.path}`, stdout: excerpt(l.out, 600) });
  const one = await run(`unzip -p "${path.join(dbDir, f.path)}" "$(unzip -Z1 "${path.join(dbDir, f.path)}" | head -1)" | head -c 1500`);
  out.steps.push({ name: `عيّنة سجل من ${f.path}`, stdout: excerpt(one.out, 1500) });
}
// 3) فحص دون اتصال (القاعدة موجودة): --offline وحده، ثم --offline-vulnerabilities وحده
await step('offline scan: --offline', `osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output ${path.join(proj, 'offline.json')}`);
await step('offline scan: --offline-vulnerabilities (بلا --offline)', `osv-scanner scan source -r . --offline-vulnerabilities --no-call-analysis=all --format json --output ${path.join(proj, 'offline2.json')}`);
// 4) هل يحاول --offline الاتصال؟ نعيد الفحص بوكيل HTTP وهمي: أي محاولة اتصال تفشل فورًا وتظهر في الخرج
await step('offline scan مع HTTPS_PROXY وهمي (لا يجوز أن يتصل)', `osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output ${path.join(proj, 'offline3.json')}`, { HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9' });
for (const f of ['first.json', 'offline.json', 'offline3.json']) {
  const p = path.join(proj, f);
  if (!fs.existsSync(p)) { out.steps.push({ name: `report ${f}`, stdout: 'غير موجود' }); continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const pk = (j.results ?? []).flatMap((r) => r.packages ?? []);
  out.steps.push({ name: `report ${f}`, stdout: `sources=${(j.results ?? []).length} packages=${pk.length} withVulns=${pk.filter((x) => (x.vulnerabilities ?? []).length).length} sample=${pk.slice(0, 3).map((x) => `${x.package?.name}@${x.package?.version}:${(x.vulnerabilities ?? []).length}`).join(' ')}` });
}
writeJson(path.join(results, 'download-db.json'), out);
fs.rmSync(proj, { recursive: true, force: true });
console.log(`\nكُتب ${path.join(results, 'download-db.json')}; الحجم الكلي ${(out.totalKB / 1024).toFixed(1)} م.ب`);
