// E-10: تجهيز Semgrep وطريقة استدعائه (الخطة 22، C-15 صف Semgrep، G-DEV1-01).
//   1) التوفر من Homebrew (الإصدار والحالة)، والتثبيت المُدار في بيئة Python معزولة ببصمات (uv pip compile --generate-hashes)
//      مع قياس الزمن والحجم.
//   2) زمن حزمة قواعد تجريبية (8 قواعد) على FX-EXT وFX-PY وFX-MALICIOUS ومستودع اصطناعي 10 آلاف ملف.
//   3) تمرير الأهداف مع --no-git-ignore: مجلد الجذر مع --exclude، وقائمة ملفات صريحة حتى حد طول الأوامر (ARG_MAX)، والتقسيم.
//   4) تتبع العمليات على FX-MALICIOUS بأداة git مزيفة أول PATH: من داخل المستودع، ومن مجلد محايد بهدف مطلق، ومع قائمة ملفات،
//      ومع HOME مؤقت لرصد ما يكتبه Semgrep خارج المشروع. ولقطة حالة المستودع قبل/بعد.
//   node spikes/E-10-semgrep/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DEV2_CACHE, FIXTURES, TC_HOME, baseEnv, diffSnapshot, excerpt, gitShim, materialize, resultsDir, rmrf, run, snapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const RULES = path.join(here, 'rules', 'ayar-trial.yml');
const SEMGREP = path.join(TC_HOME, 'py', 'bin', 'semgrep');
const out = { at: new Date().toISOString(), homebrew: null, managed: null, timing: [], targets: [], git: [] };
const env0 = baseEnv({ SEMGREP_SEND_METRICS: 'off' });
const BASE_FLAGS = ['scan', '--no-git-ignore', '--config', RULES, '--metrics=off', '--disable-version-check', '--quiet'];
const sg = (args, opts = {}) => run(SEMGREP, { args: [...BASE_FLAGS, ...args], env: env0, timeout: 900, ...opts });

// ── 1) التوفر والتثبيت المُدار ──
{
  const b = await run('/opt/homebrew/bin/brew', { args: ['info', '--json=v2', 'semgrep'], timeout: 120 });
  try { const j = JSON.parse(b.out); const f = j.formulae[0]; out.homebrew = { stable: f.versions.stable, installed: f.installed.map((x) => x.version), pinnedWanted: '1.180.0', deps: f.dependencies.length }; } catch { out.homebrew = { error: excerpt(b.err, 200) }; }
  console.log('homebrew:', JSON.stringify(out.homebrew));
  const venv = path.join(DEV2_CACHE, 'semgrep-venv');
  rmrf(venv);
  const uv = path.join(TC_HOME, 'py', 'bin', 'uv');
  const req = path.join(DEV2_CACHE, 'semgrep-requirements.txt');
  const t0 = Date.now();
  const c = await run(uv, { args: ['pip', 'compile', '--generate-hashes', '--python-version', '3.12', '-o', req, '-'], input: 'semgrep==1.180.0\n', env: env0, timeout: 600 });
  const t1 = Date.now();
  const v = await run(uv, { args: ['venv', '--python', '/opt/homebrew/bin/python3.12', venv], env: env0, timeout: 120 });
  const i = await run(uv, { args: ['pip', 'install', '--python', path.join(venv, 'bin', 'python'), '--require-hashes', '-r', req], env: env0, timeout: 900 });
  const t2 = Date.now();
  const ver = await run(path.join(venv, 'bin', 'semgrep'), { args: ['--version'], env: env0 });
  const du = await run(`du -sk "${venv}" | cut -f1`);
  const hashes = fs.existsSync(req) ? (fs.readFileSync(req, 'utf8').match(/--hash=sha256:/g) ?? []).length : 0;
  out.managed = { compileMs: t1 - t0, compileExit: c.code, venvExit: v.code, installMs: t2 - t1, installExit: i.code, version: ver.out.trim(), sizeKB: Number(du.out.trim()), hashesPinned: hashes, requirementsFile: req.replaceAll(process.env.HOME, '~'), installTail: excerpt(i.err.split('\n').slice(-3).join('\n'), 300) };
  console.log('managed:', JSON.stringify(out.managed));
}

// ── 2) زمن الحزمة التجريبية ──
const projects = [];
{ const { base, root } = await materialize('FX-EXT', 'good', 'ayar-e10'); projects.push({ name: 'FX-EXT/good', base, root, targets: ['src', 'e2e'] }); }
{ const { base, root } = await materialize('FX-PY', 'good', 'ayar-e10'); projects.push({ name: 'FX-PY/good', base, root, targets: ['src', 'tests'] }); }
{ const big = tmpdir('ayar-e10-synth'); await run(process.execPath, { args: [path.join(FIXTURES, 'tools', 'synth-repo', 'generate.mjs'), '--preset', 'medium', '--out', big], timeout: 300 }); projects.push({ name: 'synth-repo medium (10k)', base: big, root: big, targets: ['.'] }); }
for (const p of projects) {
  const R = tmpdir('ayar-e10-r');
  const r = await sg([`--json-output=${path.join(R, 's.json')}`, `--sarif-output=${path.join(R, 's.sarif')}`, ...p.targets], { cwd: p.root });
  const j = fs.existsSync(path.join(R, 's.json')) ? JSON.parse(fs.readFileSync(path.join(R, 's.json'), 'utf8')) : null;
  out.timing.push({ project: p.name, exit: r.code, ms: r.ms, findings: j?.results?.length ?? null, scanned: j?.paths?.scanned?.length ?? null, errors: j?.errors?.length ?? null, byRule: Object.entries((j?.results ?? []).reduce((m, x) => ((m[x.check_id.split('.').at(-1)] = (m[x.check_id.split('.').at(-1)] ?? 0) + 1), m), {})) });
  console.log(`• timing ${p.name}: exit=${r.code} ${r.ms}ms findings=${out.timing.at(-1).findings} scanned=${out.timing.at(-1).scanned}`);
  rmrf(R);
}

// ── 3) تمرير الأهداف ──
{
  const big = projects[2].root;
  const list = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(ts|js|py)$/.test(e.name)) list.push(p); } };
  walk(big);
  const bytes = list.reduce((n, p) => n + Buffer.byteLength(p) + 1, 0);
  const argMax = Number((await run('getconf ARG_MAX')).out.trim());
  out.targets.push({ name: 'قائمة ملفات صريحة كاملة (مسارات مطلقة)', files: list.length, argBytes: bytes, argMax });
  const R = tmpdir('ayar-e10-r');
  // (أ) الجذر مع --exclude لما يستثنيه جرد عِيَار
  let r = await sg([`--json-output=${path.join(R, 'a.json')}`, '--exclude', 'node_modules', '--exclude', 'dist', big], { cwd: big });
  let j = JSON.parse(fs.readFileSync(path.join(R, 'a.json'), 'utf8'));
  out.targets.push({ name: 'الجذر + --exclude node_modules/dist', exit: r.code, ms: r.ms, scanned: j.paths?.scanned?.length, findings: j.results?.length });
  // (ب) القائمة كاملة في أمر واحد (قد تتجاوز ARG_MAX)
  r = await sg([`--json-output=${path.join(R, 'b.json')}`, ...list], { cwd: big });
  j = fs.existsSync(path.join(R, 'b.json')) ? JSON.parse(fs.readFileSync(path.join(R, 'b.json'), 'utf8')) : null;
  out.targets.push({ name: `القائمة كاملة في أمر واحد (${list.length} ملف، ${bytes} بايت)`, exit: r.code, ms: r.ms, scanned: j?.paths?.scanned?.length ?? null, findings: j?.results?.length ?? null, err: excerpt(r.err, 200) });
  // (ج) القائمة مقسمة إلى دفعات تحت 200 كيلوبايت من الوسائط
  const chunks = []; let cur = [], curBytes = 0;
  for (const p of list) { const b = Buffer.byteLength(p) + 1; if (curBytes + b > 200 * 1024) { chunks.push(cur); cur = []; curBytes = 0; } cur.push(p); curBytes += b; }
  if (cur.length) chunks.push(cur);
  let total = 0, scanned = 0, findings = 0, exits = [];
  const t0 = Date.now();
  for (let k = 0; k < chunks.length; k++) {
    const f = path.join(R, `c${k}.json`);
    const rr = await sg([`--json-output=${f}`, ...chunks[k]], { cwd: big });
    exits.push(rr.code);
    const jj = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    scanned += jj?.paths?.scanned?.length ?? 0; findings += jj?.results?.length ?? 0;
  }
  total = Date.now() - t0;
  out.targets.push({ name: `القائمة مقسمة (${chunks.length} دفعة ≤ 200 كيلوبايت)`, exits: [...new Set(exits)], ms: total, scanned, findings });
  // (د) --include بأنماط من الجرد (امتدادات) مع الجذر
  r = await sg([`--json-output=${path.join(R, 'd.json')}`, '--include', '*.ts', '--include', '*.py', '--exclude', 'node_modules', big], { cwd: big });
  j = JSON.parse(fs.readFileSync(path.join(R, 'd.json'), 'utf8'));
  out.targets.push({ name: 'الجذر + --include *.ts *.py', exit: r.code, ms: r.ms, scanned: j.paths?.scanned?.length, findings: j.results?.length });
  console.log('targets:', JSON.stringify(out.targets, null, 1));
  rmrf(R);
}
for (const p of projects.slice(0, 2)) rmrf(p.base);
rmrf(projects[2].base);

// ── 4) FX-MALICIOUS: تتبع git والكتابة ──
{
  const { base, root } = await materialize('FX-MALICIOUS', 'default', 'ayar-e10');
  const markers = path.join(base, 'p', 'markers');
  const neutral = tmpdir('ayar-e10-neutral');
  const home = tmpdir('ayar-e10-home');
  const cases = [
    ['من داخل المستودع (الأهداف نسبية)', root, ['src']],
    ['من مجلد محايد بهدف مطلق', neutral, [path.join(root, 'src')]],
    ['من مجلد محايد بقائمة ملفات مطلقة', neutral, [path.join(root, 'src', 'app.js'), path.join(root, 'src', 'util.py')]],
    ['من داخل المستودع مع git مزيف يفشل برمز 99 (هل يكمل Semgrep؟)', root, ['src']],
  ];
  for (const [name, cwd, targets] of cases) {
    const shim = gitShim();
    const R = tmpdir('ayar-e10-r');
    const before = snapshot(root);
    const homeBefore = snapshot(home);
    const r = await sg([`--json-output=${path.join(R, 'm.json')}`, ...targets], { cwd, env: { ...env0, PATH: `${shim.dir}:${env0.PATH}`, HOME: home } });
    const j = fs.existsSync(path.join(R, 'm.json')) ? JSON.parse(fs.readFileSync(path.join(R, 'm.json'), 'utf8')) : null;
    const calls = shim.calls();
    const inRepo = calls.filter((c) => c.includes(`cwd=${fs.realpathSync(root)}`));
    const d = diffSnapshot(before, snapshot(root));
    const dh = diffSnapshot(homeBefore, snapshot(home));
    out.git.push({ name, cwd: cwd === root ? 'repo' : 'neutral', exit: r.code, ms: r.ms, findings: j?.results?.length ?? null, gitCalls: calls.map((c) => c.replaceAll(root, '<repo>').replaceAll(process.env.HOME, '~')), gitCallsInRepo: inRepo.length, markers: fs.readdirSync(markers).length, repoWrites: [...d.added, ...d.changed], homeWrites: [...dh.added, ...dh.changed] });
    console.log(`• git ${name}: exit=${r.code} findings=${out.git.at(-1).findings} gitCalls=${calls.length} inRepo=${inRepo.length} markers=${out.git.at(-1).markers} repoWrites=${d.added.length + d.changed.length} homeWrites=${dh.added.length + dh.changed.length}`);
    rmrf(shim.dir); rmrf(R);
  }
  rmrf(base); rmrf(neutral); rmrf(home);
}
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
