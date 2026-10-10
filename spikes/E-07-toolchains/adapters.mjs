// E-07 (4): رموز الخروج الفعلية لكل أداة باستدعاء المحول كما في C-15 (بأعلام التقارير)، على مشاريع المحولات FX-ADAPTERS
// بنسخها (سليمة ومعيبة وخطأ إعداد وبلا مدخلات …). لكل تشغيل: رمز الخروج، وهل كُتب التقرير وهل يُقرأ، وما تغيّر في شجرة المشروع
// (الآثار الجانبية خارج node_modules/.venv). المخرج: results/exit-codes.json وresults/exit-codes.md (مرجع خرائط C-15 في DEV-6).
//   node spikes/E-07-toolchains/adapters.mjs [tool ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { FIXTURES, NVM_NODE, baseEnv, diffSnapshot, excerpt, materialize, resultsDir, rmrf, run, snapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const only = process.argv.slice(2);
const PNPM = 'pnpm install --frozen-lockfile --silent';
const UV = 'UV_PYTHON_PREFERENCE=only-system uv sync --frozen -q';

// استدعاء كل محول كما في C-15 (R = مجلد التقارير المؤقت خارج المشروع، T = مجلد مؤقت للأداة)
const adapters = {
  vitest: { setup: PNPM, cmd: 'pnpm exec vitest run --reporter=default --reporter=json --reporter=junit --outputFile.json=$R/vitest.json --outputFile.junit=$R/junit.xml --update=none', reports: ['vitest.json', 'junit.xml'] },
  jest: { setup: PNPM, cmd: 'pnpm exec jest --ci --json --outputFile=$R/jest.json --testLocationInResults', reports: ['jest.json'] },
  'node-test': { cmd: 'node --test --test-reporter=junit --test-reporter-destination=$R/junit.xml --test-reporter=spec --test-reporter-destination=stdout', reports: ['junit.xml'] },
  playwright: { setup: PNPM, cmd: 'pnpm exec playwright test --reporter=list,json,junit --update-snapshots=none --output=$T/pw-out', env: { PLAYWRIGHT_JSON_OUTPUT_FILE: '$R/playwright.json', PLAYWRIGHT_JUNIT_OUTPUT_FILE: '$R/junit.xml' }, reports: ['playwright.json', 'junit.xml'] },
  eslint: { setup: PNPM, cmd: 'pnpm exec eslint src -f json -o $R/eslint.json', reports: ['eslint.json'] },
  biome: { setup: PNPM, cmd: 'pnpm exec biome lint --reporter=json --reporter-file=$R/biome.json src', reports: ['biome.json'] },
  tsc: { setup: PNPM, cmd: 'pnpm exec tsc --noEmit -p tsconfig.json --pretty false', reports: [] },
  knip: { setup: PNPM, cmd: 'pnpm exec knip --reporter json > $R/knip.json', reports: ['knip.json'] },
  pyright: { setup: PNPM, cmd: 'pnpm exec pyright --outputjson > $R/pyright.json', reports: ['pyright.json'] },
  pytest: { setup: UV, cmd: '.venv/bin/python -m pytest --junit-xml=$R/junit.xml -p no:cacheprovider', reports: ['junit.xml'] },
  ruff: { setup: UV, cmd: '.venv/bin/ruff check --output-format json --output-file $R/ruff.json --no-cache src', reports: ['ruff.json'] },
  mypy: { setup: UV, cmd: '.venv/bin/python -m mypy --show-column-numbers --no-error-summary --no-color-output --cache-dir $T/mypy-cache > $R/mypy.txt; c=$?; .venv/bin/python -m mypy --show-column-numbers --no-error-summary --no-color-output --cache-dir $T/mypy-cache -O json > $R/mypy.json; echo "json_exit=$?"; exit $c', reports: ['mypy.txt', 'mypy.json'] },
  semgrep: { cmd: 'semgrep scan --no-git-ignore --config rules/ayar-eval.yml --metrics=off --disable-version-check --json-output=$R/semgrep.json --sarif-output=$R/semgrep.sarif --quiet src', reports: ['semgrep.json', 'semgrep.sarif'] },
  osv: { cmd: 'osv-scanner scan source -r . --offline --format json --output $R/osv.json', env: { OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: '$T/osv-db-empty' }, reports: ['osv.json'] },
  gitleaks: { cmd: 'gitleaks dir . --config gitleaks.toml --redact=100 --no-banner --report-format json --report-path $R/secrets.json --exit-code 42', reports: ['secrets.json'] },
  lychee: { cmd: 'lychee --format json --output $R/links.json --max-concurrency 4 --max-retries 0 --timeout 3 --config lychee.toml README.md', bg: 'node server.mjs', reports: ['links.json'] },
};

const project = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'FX-ADAPTERS', 'project.json'), 'utf8'));
const variants = Object.keys(project.variants);
const rows = [];
const NODE24 = path.join(NVM_NODE, 'v24.16.0', 'bin');

for (const [tool, a] of Object.entries(adapters)) {
  if (only.length && !only.includes(tool)) continue;
  const kinds = ['good', ...variants.filter((v) => v.startsWith(`${tool}--`))];
  for (const kind of kinds) {
    const variant = kind === 'good' ? 'good' : kind;
    const { base, root } = await materialize('FX-ADAPTERS', variant, 'ayar-e07');
    const dir = path.join(root, tool);
    const R = tmpdir('ayar-e07-reports'); const T = tmpdir('ayar-e07-tmp');
    const sub = (s) => s.replaceAll('$R', R).replaceAll('$T', T);
    const env = baseEnv({ PATH: `${NODE24}:${baseEnv().PATH}`, CI: '1' });
    for (const [k, v] of Object.entries(a.env ?? {})) env[k] = sub(v);
    let setupCode = null;
    if (a.setup) { const s = await run(a.setup, { cwd: dir, env, timeout: 600 }); setupCode = s.code; }
    const before = snapshot(dir);
    let bg = null;
    if (a.bg) { bg = spawn('/bin/sh', ['-c', a.bg], { cwd: dir, detached: true, stdio: 'ignore', env }); await new Promise((r) => setTimeout(r, 700)); }
    const isTimeoutCase = kind.endsWith('--timeout');
    const r = await run(sub(a.cmd), { cwd: dir, env, timeout: isTimeoutCase ? 15 : 240 });
    if (bg) { try { process.kill(-bg.pid, 'SIGKILL'); } catch { /* انتهى */ } }
    const d = diffSnapshot(before, snapshot(dir));
    const reports = {};
    for (const f of a.reports) {
      const p = path.join(R, f);
      if (!fs.existsSync(p)) { reports[f] = 'غير موجود'; continue; }
      const txt = fs.readFileSync(p, 'utf8');
      if (f.endsWith('.json') || f.endsWith('.sarif')) { try { JSON.parse(txt); reports[f] = `JSON صالح (${txt.length} بايت)`; } catch { reports[f] = `JSON غير صالح (${txt.length} بايت)`; } }
      else if (f.endsWith('.xml')) reports[f] = /^\s*<\?xml|<testsuites?/.test(txt) ? `XML (${txt.length} بايت)` : `ليس XML (${txt.length} بايت)`;
      else reports[f] = `${txt.length} بايت`;
    }
    const row = { tool, variant: kind, setupCode, exit: r.timedOut ? 'مهلة' : r.code, signal: r.signal, ms: r.ms, reports, sideEffects: { added: d.added, changed: d.changed, removed: d.removed }, stdout: excerpt(r.out, 500), stderr: excerpt(r.err, 500), cmd: a.cmd };
    rows.push(row);
    console.log(`• ${tool}/${kind}: exit=${row.exit} ${r.ms}ms setup=${setupCode} reports=${JSON.stringify(reports)} side=${d.added.length + d.changed.length + d.removed.length}`);
    rmrf(base); rmrf(R); rmrf(T);
  }
}

const file = path.join(results, 'exit-codes.json');
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).rows ?? [] : [];
const merged = only.length ? [...prev.filter((p) => !only.includes(p.tool)), ...rows] : rows;
writeJson(file, { at: new Date().toISOString(), rows: merged });
const md = ['| الأداة | النسخة | الخروج | الزمن (مللي ثانية) | التقارير | آثار في شجرة المشروع |', '|---|---|---|---|---|---|'];
for (const r of merged) md.push(`| ${r.tool} | ${r.variant} | ${r.exit}${r.signal ? ` (${r.signal})` : ''} | ${r.ms} | ${Object.entries(r.reports).map(([k, v]) => `${k}: ${v}`).join('؛ ') || '—'} | ${[...r.sideEffects.added, ...r.sideEffects.changed].slice(0, 4).join('، ') || 'لا شيء'} |`);
fs.writeFileSync(path.join(results, 'exit-codes.md'), `${md.join('\n')}\n`);
console.log(`\nكُتب ${file} و exit-codes.md (${merged.length} صفًّا)`);
