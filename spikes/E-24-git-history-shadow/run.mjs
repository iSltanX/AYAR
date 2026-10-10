// E-24: فحص تاريخ Git دون تنفيذ إعدادات المستودع (الخطة 22، D-38، AT-42، C-15 صف فاحص الأسرار).
// على FX-MALICIOUS المولَّد (مفخخ: core.fsmonitor وبرنامج فرق وtextconv تكتب ملفات علامة) ونسخة --no-traps نظيفة:
//   (أ) بناء مستودع ظلي عارٍ بإعداد فارغ: objects/info/alternates → كائنات المفخخ، ونسخ refs وpacked-refs وHEAD ملفات، بلا خطافات
//       ولا سمات، دون أي أمر git على المفخخ. (ب) تشغيل betterleaks git وgitleaks git على الظلي ببيئة Git معزولة
//       (GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_ATTR_NOSYSTEM=1) مع مغلّف git يسجل كل استدعاء (المجلد والوسائط)
//       ثم ينفذ git الحقيقي. (ج) التحقق: لا ملف علامة، ولا كتابة في المفخخ، والسر القديم مكشوف بالالتزام والملف وقيمته مُخفاة،
//       والنتيجة مطابقة للتشغيل المعتاد على النسخة النظيفة. (د) ضابط إيجابي: التشغيل المعتاد على المفخخ نفسه (في نسخة مستقلة)
//       يكتب العلامات، فيثبت أن الحماية ضرورية.
//   node spikes/E-24-git-history-shadow/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DEV2_CACHE, FIXTURES, baseEnv, diffSnapshot, excerpt, resultsDir, rmrf, run, snapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const scanners = { betterleaks: path.join(DEV2_CACHE, 'betterleaks', 'bin', 'betterleaks'), gitleaks: '/opt/homebrew/bin/gitleaks' };
const out = { at: new Date().toISOString(), steps: [] };

function gitWrapper() {
  const dir = tmpdir('ayar-e24-gitwrap');
  const log = path.join(dir, 'git.log');
  fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\nprintf 'cwd=%s args=%s\\n' "$(pwd -P)" "$*" >> "${log}"\nexec /usr/bin/git "$@"\n`, { mode: 0o755 });
  return { dir, log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []) };
}
const isolated = (extra = {}) => ({ ...baseEnv(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', ...extra });

/** يبني المستودع الظلي بملفات فقط (لا git على المصدر): عارٍ، إعداد فارغ، كائنات بالإحالة، مراجع منسوخة. */
function buildShadow(srcRepo, dest) {
  const srcGit = path.join(srcRepo, '.git');
  fs.mkdirSync(path.join(dest, 'objects', 'info'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'refs'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'objects', 'info', 'alternates'), `${path.join(srcGit, 'objects')}\n`);
  fs.writeFileSync(path.join(dest, 'config'), '[core]\n\tbare = true\n\trepositoryformatversion = 0\n');
  fs.writeFileSync(path.join(dest, 'HEAD'), fs.readFileSync(path.join(srcGit, 'HEAD')));
  if (fs.existsSync(path.join(srcGit, 'packed-refs'))) fs.copyFileSync(path.join(srcGit, 'packed-refs'), path.join(dest, 'packed-refs'));
  if (fs.existsSync(path.join(srcGit, 'refs'))) fs.cpSync(path.join(srcGit, 'refs'), path.join(dest, 'refs'), { recursive: true });
  // لا hooks ولا info/attributes ولا index
  return { files: fs.readdirSync(dest) };
}

const findingsOf = (file) => { if (!fs.existsSync(file)) return null; const j = JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); return j.map((f) => ({ rule: f.RuleID, file: f.File, line: f.StartLine, commit: f.Commit?.slice(0, 12), secret: f.Secret, fingerprint: f.Fingerprint })); };

async function scanGit(name, scanner, repo, { env, wrap, timeout = 300 }) {
  const R = tmpdir('ayar-e24-r');
  const report = path.join(R, 'secrets.json');
  const t0 = Date.now();
  const r = await run(scanners[scanner], { args: ['git', repo, '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', report, '--exit-code', '42'], env: { ...env, PATH: `${wrap.dir}:${env.PATH}` }, timeout });
  const row = { name, scanner, exit: r.code, ms: Date.now() - t0, findings: findingsOf(report), gitCalls: wrap.calls().map((c) => c.replaceAll(process.env.HOME, '~')), stderrTail: excerpt(r.err.split('\n').slice(-3).join('\n'), 300) };
  rmrf(R);
  return row;
}

// ── التوليد ──
const trapped = tmpdir('ayar-e24-trapped');
const clean = tmpdir('ayar-e24-clean');
const trapped2 = tmpdir('ayar-e24-trapped-control');
for (const [d, extra] of [[trapped, []], [clean, ['--no-traps']], [trapped2, []]]) {
  const g = await run(process.execPath, { args: [path.join(FIXTURES, 'tools', 'malicious', 'generate.mjs'), '--out', d, '--huge-mb', '1', ...extra] });
  if (g.code !== 0) { console.error(g.err); process.exit(1); }
}
const trappedRepo = path.join(trapped, 'repo'); const trappedMarkers = path.join(trapped, 'markers');
const cleanRepo = path.join(clean, 'repo');
const manifest = JSON.parse(fs.readFileSync(path.join(trapped, 'MANIFEST.json'), 'utf8'));
out.manifest = { traps: Object.keys(manifest.traps ?? manifest), markersDir: 'markers/' };

// ── (أ) الظلي ──
const shadow = path.join(tmpdir('ayar-e24-shadow'), 'shadow.git');
const trappedBefore = snapshot(trapped, { skip: new Set(), hash: false });
const built = buildShadow(trappedRepo, shadow);
out.steps.push({ name: 'بناء الظلي (ملفات فقط)', shadowFiles: built.files, alternates: fs.readFileSync(path.join(shadow, 'objects', 'info', 'alternates'), 'utf8').trim().replaceAll(process.env.HOME, '~'), config: fs.readFileSync(path.join(shadow, 'config'), 'utf8') });

// ── (ب) الفحص على الظلي، ثم المعتاد على النظيف ──
for (const scanner of Object.keys(scanners)) {
  const wrap = gitWrapper();
  const rs = await scanGit(`ظلي (${scanner})`, scanner, shadow, { env: isolated(), wrap });
  const inTrapped = rs.gitCalls.filter((c) => c.includes(fs.realpathSync(trappedRepo)) && !c.includes('alternates'));
  rs.gitCallsOnTrapped = inTrapped.length; rs.markers = fs.readdirSync(trappedMarkers).length;
  rs.trappedWrites = diffSnapshot(trappedBefore, snapshot(trapped, { skip: new Set(), hash: false }));
  rs.trappedWrites = { added: rs.trappedWrites.added, changed: rs.trappedWrites.changed };
  out.steps.push(rs); rmrf(wrap.dir);
  console.log(`• ${rs.name}: exit=${rs.exit} findings=${rs.findings?.length} markers=${rs.markers} gitCalls=${rs.gitCalls.length} onTrapped=${rs.gitCallsOnTrapped} trappedWrites=${rs.trappedWrites.added.length + rs.trappedWrites.changed.length} ${rs.ms}ms`);
  const wrap2 = gitWrapper();
  const rc = await scanGit(`معتاد على النظيف (${scanner})`, scanner, cleanRepo, { env: isolated(), wrap: wrap2 });
  out.steps.push(rc); rmrf(wrap2.dir);
  console.log(`• ${rc.name}: exit=${rc.exit} findings=${rc.findings?.length} ${rc.ms}ms`);
  const same = JSON.stringify((rs.findings ?? []).map((f) => [f.rule, f.file, f.line, f.commit])) === JSON.stringify((rc.findings ?? []).map((f) => [f.rule, f.file, f.line, f.commit]));
  out.steps.push({ name: `مقارنة الظلي بالنظيف (${scanner})`, sameFindings: same, secretRedacted: (rs.findings ?? []).every((f) => f.secret === 'REDACTED'), oldSecretFound: (rs.findings ?? []).some((f) => f.file === 'config/old-credentials.js') });
  console.log(`• مقارنة ${scanner}: same=${same}`);
}

// ── هل تقرأ git سمات الشجرة في المستودع العاري؟ (مقارنة سلوك git نفسه على الظلي: log -p مباشرة) ──
{
  const wrap = gitWrapper();
  const r = await run('/usr/bin/git', { args: ['-C', shadow, 'log', '-p', '--all', '--format=%H', '--', 'src/app.js'], env: isolated(), timeout: 60 });
  out.steps.push({ name: 'git log -p على الظلي مباشرة', exit: r.code, markers: fs.readdirSync(trappedMarkers).length, usedExternalDiff: /evildiff|textconv/.test(r.out + r.err), outHead: excerpt(r.out, 200) });
  console.log(`• git log -p على الظلي: exit=${r.code} markers=${out.steps.at(-1).markers}`);
  rmrf(wrap.dir);
}

// ── (د) الضابط الإيجابي: المعتاد على المفخخ نفسه (نسخة مستقلة) ──
{
  const repo2 = path.join(trapped2, 'repo'); const markers2 = path.join(trapped2, 'markers');
  const wrap = gitWrapper();
  const r = await scanGit('معتاد على المفخخ نفسه (ضابط إيجابي، نسخة مستقلة)', 'gitleaks', repo2, { env: isolated(), wrap });
  r.markers = fs.readdirSync(markers2); r.markersCount = r.markers.length;
  out.steps.push(r); rmrf(wrap.dir);
  console.log(`• ضابط إيجابي (gitleaks git على المفخخ): exit=${r.exit} findings=${r.findings?.length} markers=${r.markersCount} ${JSON.stringify(r.markers)}`);
  // وبلا عزل البيئة (إعداد المستخدم العام يُقرأ)؟
  const wrapB = gitWrapper();
  const rb = await scanGit('معتاد على المفخخ ببيئة المستخدم (بلا عزل)', 'gitleaks', repo2, { env: baseEnv(), wrap: wrapB });
  rb.markersCount = fs.readdirSync(markers2).length; out.steps.push(rb); rmrf(wrapB.dir);
  console.log(`• ضابط إيجابي بلا عزل: exit=${rb.exit} markers=${rb.markersCount}`);
}
out.finalMarkersTrapped = fs.readdirSync(trappedMarkers);
rmrf(trapped); rmrf(clean); rmrf(trapped2); rmrf(path.dirname(shadow));
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}; markers في المفخخ المحمي = ${out.finalMarkersTrapped.length}`);
