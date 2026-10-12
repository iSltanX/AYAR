#!/usr/bin/env node
// Plan 25 «الاستخدام الذاتي» (DEV-13): AYAR checks its own repository through its engine, as its maintainer would:
// a clean clone of the commit (what the repository is, not a working folder with build output in it), its
// dependencies installed from the lock file, the project added, the proposed standards profile approved with the
// additions a maintainer writes for this repository (the outputs its commands write, a custom check for the type
// check the adapters do not recognize), the tools the profile needs provisioned the way the app does («جهّز»), a
// full scan, then the maintainer's reviews — the findings that are intentional (the fixtures' planted defects, the
// spikes' test tokens, the sample secrets inside the engine's own tests) recorded as false alarms with a note each —
// and a second full scan, whose outcome is written for the acceptance report: the verdict and karat, every check
// with its outcome and reason, the blocking failures still open (must be none), every required check that did not
// run with its reason and the maintainer's explanation (must all be explained), and the reviews recorded.
//
//   node tools/acceptance/self-check.ts [--repo <git repository>] [--commit <sha>] [--out docs/acceptance/self-check]
//
// The engine runs with its own temporary data folder and the clone beside it (ayar-DEV-13-self-*), removed at the
// end; the project's commands (the repository's own scripts) run inside the clone as any project's would. Needs the
// network once for `npm ci`, the managed Semgrep and the OSV databases (ORG-09).
import type { ProfileView, ResultsPage, RunDetail } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEngine } from '@ayar/cli';
import { confirmationGrant } from '../cli/src/grants.ts';
import { addProject, approveAll, ok, plan, startRun, waitRun } from '../cli/test/support/fixtures.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const sourceRepo = resolve(opt('repo', ROOT));
const commit = opt('commit', execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
const out = resolve(ROOT, opt('out', 'docs/acceptance/self-check'));
const timeoutMs = Number(opt('timeout-min', '90')) * 60_000;
const log = (s: string) => process.stderr.write(`self-check: ${s}\n`);

/** The maintainer's additions to the proposed profile for this repository. */
const PROFILE_PATCH = {
  references: {
    // FR-36: what the repository's build writes (code.build checks the declared outputs exist afterwards).
    outputs: ['apps/desktop/dist'],
  },
  custom: {
    // The packages type-check through the root script (TypeScript 7's native binary and `npm run --workspaces`,
    // E-13), which no adapter recognizes: the maintainer declares it as the custom check it is.
    typecheck: { argv: ['npm', 'run', 'typecheck'], cwd: '.', timeoutMin: 30, success: { exitCode: 0 }, title: 'الأنواع: npm run typecheck (TypeScript 7 وsvelte-check)' },
  },
};

/** The findings a maintainer records as false alarms, by where they are, with the note recorded on each. */
const INTENTIONAL: { test: (path: string, checkId: string) => boolean; note: string }[] = [
  { test: (p) => p.startsWith('fixtures/'), note: 'مشروع اختبار بعيوب مزروعة عمدًا (الخطة 20): الأسرار والمراجع المكسورة والألوان خارج النطاق هي ما يُختبر كشفه، لا عيب في عِيَار' },
  { test: (p) => p.startsWith('spikes/'), note: 'نتائج تجربة بيئة (E-22): علامات AYAR_CHECK_TOKEN لعمليات تجريبية، لا أسرار' },
  { test: (p, c) => c === 'sec.secrets.files' && /\/test\//.test(p), note: 'قيمة على شكل سر في اختبار الإخفاء أو الواجهة (تُركَّب وقت التشغيل من أجزاء أو تُستعمل لإثبات التنقيح)، لا سر' },
  { test: (p, c) => c === 'sec.sast' && /(^|\/)test\//.test(p), note: 'شيفرة اختبار تشغّل أدوات وعمليات تجريبية عمدًا (أوامر صدفة متغيرة، وFunction لبناء ادعاء نموذج مزيف)، لا تُشحن' },
  { test: (p, c) => c === 'sec.sast' && p.startsWith('tools/packaging/'), note: 'أداة تغليف تشغّل الملف التنفيذي للحزمة المبنية بمسارها، لا تُشحن' },
  { test: (p, c) => c === 'sec.sast' && p === 'packages/engine/src/node/network.ts', note: 'التحقق من شهادة TLS معطّل في طلب جاهزية واحد إلى localhost وحده (خدمة مرافقة بشهادة ذاتية، FR-21)؛ لا بيانات تُرسل ولا مضيف خارجي يُقبل (المضيف يُفحص قبله)' },
];

/** Why a required check that did not run on this repository does not run, by instance. */
const EXPLANATIONS: { test: (instance: string) => boolean; reason: string }[] = [
  { test: (i) => i.startsWith('code.types@'), reason: 'لا محوّل للأنواع يعرف TypeScript 7 الأصلي (@typescript/native) ولا سكربت الجذر الذي يشغّل مساحات العمل (E-13)؛ يغطيه الفحص المخصص «typecheck» (npm run typecheck) في الملف نفسه' },
  { test: (i) => i.startsWith('beh.unit@') && i !== 'beh.unit@.', reason: 'اختبارات كل الحزم تُشغَّل من الجذر (vitest run على مساحات العمل) ولا سكربت اختبار في الحزمة نفسها؛ يغطيها beh.unit@. في الجذر' },
  { test: (i) => i === 'design.a11y@apps/desktop', reason: 'واجهة Electron لا تُقدَّم عبر رابط (لا renderTarget)؛ axe يفحص كل شاشة على الحزمة المشتقة في اختبارات E2E (AT-40)' },
  { test: (i) => i === 'sec.sast@.', reason: 'تُجهَّز أداته في هذا الفحص بإجراء التجهيز نفسه الذي يعرضه التطبيق؛ وإن غاب التجهيز فلا شبكة' },
  { test: (i) => i === 'sec.deps@.', reason: 'osv-scanner يمسح الجذر كله فيبلغ ملفات قفل PyPI داخل مشاريع الاختبار (fixtures/) ويطلب قاعدتها، والجاهزية تعرض قواعد الأنظمة التي اكتشفتها المكوّنات وحدها (npm)، فيخرج 127 «قاعدة ناقصة» (G-DEV13-06)' },
  { test: (i) => i === 'design.rtl.static@.', reason: 'صفحة الواجهة في src/renderer (جذر Vite) خارج المجلدات التي يقرأ منها الاكتشاف صفحات الدخول، والاتجاه يُضبط وقت التشغيل بحسب اللغة؛ الاتجاه يُثبت في E2E (AT-28 وAT-41)' },
];

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-13-self-')));
const repo = join(temp, 'repo');
try {
  log(`clone of ${commit.slice(0, 7)} from ${sourceRepo}`);
  execFileSync('git', ['clone', '--quiet', '--no-local', sourceRepo, repo], { stdio: 'pipe' });
  execFileSync('git', ['-C', repo, 'checkout', '--quiet', commit], { stdio: 'pipe' });
  log('npm ci');
  execFileSync('/opt/homebrew/bin/npm', ['ci', '--no-audit', '--no-fund'], { cwd: repo, stdio: 'pipe', env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` } });

  const engine = await connectEngine({ dataDir: join(temp, 'AYAR') });
  await engine.waitForEvent('engine.health', (e) => e.payload.state === 'ready', 30_000);
  ok(await engine.invoke('settings.set', { key: 'run.notify', value: false }));
  const { projectId, snapshot } = await addProject(engine, repo);
  const proposed = ok<ProfileView>(await engine.invoke('profile.get', { projectId }));
  ok(await engine.invoke('profile.update', { projectId, patch: PROFILE_PATCH }));
  let profile = await approveAll(engine, projectId);

  // «جهّز»: the tools the profile needs (the managed Semgrep, the OSV databases), as the app's setup screen does.
  const setup: unknown[] = [];
  for (let round = 0; round < 4; round++) {
    const readiness = ok<{ actions: { id: string; kind: string; target: { tool: string | null; ecosystem: string | null } }[] }>(await engine.invoke('readiness.evaluate', { projectId }));
    const actions = readiness.actions.filter((a) => a.kind === 'install_tool' || a.kind === 'download_osv_db');
    if (!actions.length) break;
    for (const a of actions) {
      log(`setup: ${a.kind} ${a.target.tool ?? a.target.ecosystem ?? ''}`);
      const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: a.id }));
      const g = confirmationGrant('setup.execute', a.id, preview.digest);
      const r = await engine.invoke('setup.execute', { actionId: a.id, confirmationToken: g.token }, g.grants);
      setup.push({ kind: a.kind, target: a.target, ok: r.ok, result: r.ok ? (r.result as { install?: unknown; download?: unknown }) : r.error });
      if (!r.ok) log(`setup failed: ${JSON.stringify(r.error).slice(0, 300)}`);
    }
  }
  profile = await approveAll(engine, projectId);

  const findingsOf = async (runId: string): Promise<ResultsPage['findings']> => {
    const all: ResultsPage['findings'] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId, includeExcluded: true, limit: 1000, offset } }));
      all.push(...page.findings);
      if (all.length >= page.total || page.findings.length === 0) break;
    }
    return all;
  };
  const fullRun = async (label: string): Promise<{ d: RunDetail; findings: ResultsPage['findings']; ms: number }> => {
    const p = await plan(engine, projectId, { kind: 'full' });
    log(`${label}: ${p.items.length} plan items; running…`);
    const started = Date.now();
    const d = await waitRun(engine, (await startRun(engine, p.id)).runId, timeoutMs);
    return { d, findings: await findingsOf(d.run.runId), ms: Date.now() - started };
  };
  const blocking = (fs: ResultsPage['findings']) => fs.filter((f) => f.effect === 'violation' && (f.severity === 'critical' || f.severity === 'high'));

  // The first scan, then the maintainer's reviews of what is intentional, then the scan that counts.
  const first = await fullRun('first scan');
  const reviews: { displayId: string; checkId: string; path: string; note: string; excluded: boolean }[] = [];
  for (const f of first.findings) {
    if (f.effect !== 'violation') continue;
    const path = f.location?.path ?? '';
    const rule = INTENTIONAL.find((r) => r.test(path, f.checkId));
    if (!rule) continue;
    const r = ok<{ finding: { excluded: boolean } | null }>(await engine.invoke('review.record', { target: { type: 'finding', id: f.id }, decision: 'false_positive', note: rule.note }));
    reviews.push({ displayId: f.displayId, checkId: f.checkId, path, note: rule.note, excluded: r.finding?.excluded ?? false });
  }
  log(`reviews recorded: ${reviews.length}`);
  const second = await fullRun('second scan');
  const d = second.d;
  const report = ok<{ human: { text: string }; report: unknown }>(await engine.invoke('report.build', { target: { kind: 'run', runId: d.run.runId }, options: { lang: 'ar' } }));
  await engine.close();

  const checks = d.checks.map((c) => ({ instance: c.instance, checkId: c.checkId, component: c.component, outcome: c.outcome, reason: c.outcomeReason, readiness: c.readiness, durationMs: c.durationMs }));
  const required = profile.checks.filter((c) => c.required);
  const notRun = required
    .filter((r) => {
      const c = d.checks.find((x) => x.instance === r.instance);
      return !c || c.outcome === null || ['missing', 'unavailable', 'skipped', 'not_applicable'].includes(c.outcome);
    })
    .map((r) => {
      const c = d.checks.find((x) => x.instance === r.instance);
      return { instance: r.instance, outcome: c?.outcome ?? 'not planned', reason: c?.outcomeReason ?? null, explanation: EXPLANATIONS.find((e) => e.test(r.instance))?.reason ?? null };
    });
  const unexplained = notRun.filter((n) => n.outcome !== 'not_applicable' && !n.explanation);
  const open = blocking(second.findings.filter((f) => !f.excludedByReview));
  const summary = {
    repo: sourceRepo,
    commit,
    at: new Date().toISOString(),
    discovery: { facts: snapshot.facts.length, components: snapshot.components.length },
    proposedChecks: proposed.checks.length,
    approvedChecks: profile.checks.length,
    profileAdditions: PROFILE_PATCH,
    setup,
    firstScan: { runId: first.d.run.runId, durationMs: first.ms, verdict: first.d.run.verdict, findings: first.findings.length, blockingOpen: blocking(first.findings).length },
    reviews,
    verdict: d.run.verdict,
    purity: d.purity,
    durationMs: second.ms,
    outcomes: Object.fromEntries(['passed', 'failed', 'warning', 'needs_review', 'missing', 'unavailable', 'skipped', 'cancelled', 'not_applicable', 'flaky'].map((o) => [o, d.checks.filter((c) => c.outcome === o).length])),
    checks,
    findings: second.findings.length,
    findingsExcludedByReview: second.findings.filter((f) => f.excludedByReview).length,
    blockingOpen: open.map((f) => ({ id: f.displayId, checkId: f.checkId, rule: f.ruleId, severity: f.severity, location: f.location })),
    requiredNotRun: notRun,
    unexplained: unexplained.map((n) => n.instance),
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'self-check.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(out, 'report-ar.md'), `${report.human.text}\n`);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report.report, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: summary.verdict, karat: d.purity?.karat ?? null, outcomes: summary.outcomes, reviews: reviews.length, blockingOpen: open.length, requiredNotRun: notRun.length, unexplained: summary.unexplained }, null, 2));
  process.exit(open.length || unexplained.length ? 1 : 0);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
