// E-09 (2): القاعدة المصغرة (fixtures/tools/osv-mini-db) مع osv-scanner 2.6.0 دون اتصال على مشاريع الاختبار التي تعتمد
// ayar-vuln-fake@1.0.0: FX-ADAPTERS (قفل npm بسجل وهمي)، وFX-EXT (pnpm-lock بتبعية file:)، وFX-PY (uv.lock بتبعية directory)،
// ونسخها السليمة ضابطًا سلبيًّا. --all-packages ليظهر ما استخرجه من كل قفل، وHTTPS_PROXY وهمي لإثبات عدم الاتصال.
//   node spikes/E-09-osv-offline/mini-db.mjs
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, baseEnv, excerpt, materialize, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const cache = tmpdir('ayar-e09-minidb');
const build = await run(process.execPath, { args: [path.join(FIXTURES, 'tools', 'osv-mini-db', 'build.mjs'), '--out', cache] });
const zips = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else zips.push({ path: path.relative(cache, p), bytes: fs.statSync(p).size }); } }; walk(cache);
const unzipTest = await run(`for z in $(find "${cache}" -name all.zip); do unzip -tq "$z"; done`);
const out = { at: new Date().toISOString(), build: { code: build.code, out: build.out.trim().replaceAll(process.env.HOME, '~') }, zips, unzipTest: unzipTest.out.trim(), cases: [] };
console.log('build:', build.out.trim(), '\nunzip -t:', unzipTest.out.trim());

const env = baseEnv({ OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: cache, HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9' });
const CMD = 'osv-scanner scan source -r . --offline --no-call-analysis=all --all-packages --format json --output-file $R/osv.json';
const cases = [
  ['FX-ADAPTERS', 'osv--bad', 'osv', 'npm: قفل بسجل وهمي ayar-vuln-fake@1.0.0 → يجب أن يكشف AYAR-2026-0001'],
  ['FX-ADAPTERS', 'good', 'osv', 'npm: left-pad وحدها → صفر ثغرات'],
  ['FX-EXT', 'vuln-dep', '', 'pnpm-lock: ayar-vuln-fake بتبعية file: (بلا رقم إصدار في القفل) → هل يستخرجها؟'],
  ['FX-EXT', 'good', '', 'pnpm-lock السليم → صفر ثغرات'],
  ['FX-PY', 'vuln-dep', '', 'uv.lock: ayar-vuln-fake 1.0.0 بمصدر directory → هل يستخرجها ويطابقها؟'],
  ['FX-PY', 'good', '', 'uv.lock السليم → صفر ثغرات'],
];
for (const [id, variant, sub, why] of cases) {
  const { base, root } = await materialize(id, variant, 'ayar-e09');
  const dir = path.join(root, sub);
  const R = tmpdir('ayar-e09-r');
  const r = await run(CMD.replaceAll('$R', R), { cwd: dir, env, timeout: 120 });
  let report = null;
  const f = path.join(R, 'osv.json');
  if (fs.existsSync(f)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    report = (j.results ?? []).map((s) => ({ source: path.basename(s.source?.path ?? '?'), packages: (s.packages ?? []).map((p) => `${p.package?.name}@${p.package?.version || '∅'}${(p.vulnerabilities ?? []).length ? ` ← ${p.vulnerabilities.map((v) => v.id).join(',')}` : ''}`) }));
  }
  const row = { project: id, variant, cwd: sub || '.', why, exit: r.code, ms: r.ms, report, stderr: excerpt(r.err.split('\n').filter((l) => !/^(Scanning dir|Starting filesystem|End status|Loaded .* local db)/.test(l)).join('\n'), 600) };
  out.cases.push(row);
  console.log(`• ${id}/${variant}${sub ? '/' + sub : ''}: exit=${r.code} ${r.ms}ms ${JSON.stringify(report)}`);
  rmrf(base); rmrf(R);
}
// الحجم مقابل القاعدة الكاملة
out.sizes = { miniKB: Number((await run(`du -sk "${cache}" | cut -f1`)).out.trim()) };
rmrf(cache);
writeJson(path.join(results, 'mini-db.json'), out);
console.log(`\nكُتب ${path.join(results, 'mini-db.json')}`);
