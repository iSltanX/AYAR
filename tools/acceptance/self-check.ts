#!/usr/bin/env node
// Plan 25 «الاستخدام الذاتي» (DEV-13): AYAR checks its own repository through its engine, as the app would — the
// repository is added, the proposed standards profile approved as proposed, the full scan run — and the outcome is
// written for the acceptance report: the verdict and karat, every check with its outcome and reason, the blocking
// failures still open (must be none), and every required check that did not run, with its reason (must be explained).
//
//   node tools/acceptance/self-check.ts --repo <path to the repository> --out docs/acceptance/self-check
//
// The engine runs with its own temporary data folder (ayar-DEV-13-self-*), removed at the end; the project's commands
// (the repository's own scripts) run inside the repository as any project's would.
import type { ProfileView, ResultsPage, RunDetail } from '@ayar/protocol';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEngine } from '@ayar/cli';
import { addProject, approveAll, ok, plan, startRun, waitRun } from '../cli/test/support/fixtures.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const repo = realpathSync(resolve(opt('repo', ROOT)));
const out = resolve(ROOT, opt('out', 'docs/acceptance/self-check'));
const timeoutMs = Number(opt('timeout-min', '90')) * 60_000;

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-13-self-')));
try {
  const engine = await connectEngine({ dataDir: join(temp, 'AYAR') });
  await engine.waitForEvent('engine.health', (e) => e.payload.state === 'ready', 30_000);
  ok(await engine.invoke('settings.set', { key: 'run.notify', value: false }));
  const { projectId, snapshot } = await addProject(engine, repo);
  const proposed = ok<ProfileView>(await engine.invoke('profile.get', { projectId }));
  const profile = await approveAll(engine, projectId);
  const p = await plan(engine, projectId, { kind: 'full' });
  process.stderr.write(`self-check: ${p.items.length} plan items; running…\n`);
  const started = Date.now();
  const d: RunDetail = await waitRun(engine, (await startRun(engine, p.id)).runId, timeoutMs);
  const results = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: d.run.runId, includeExcluded: true, limit: 2000 } }));
  const report = ok<{ human: { text: string }; report: unknown }>(await engine.invoke('report.build', { target: { kind: 'run', runId: d.run.runId }, options: { lang: 'ar' } }));
  await engine.close();

  const checks = d.checks.map((c) => ({ instance: c.instance, checkId: c.checkId, component: c.component, outcome: c.outcome, reason: c.outcomeReason, readiness: c.readiness, durationMs: c.durationMs }));
  const blockingOpen = results.findings.filter((f) => f.effect === 'violation' && (f.severity === 'critical' || f.severity === 'high'));
  const required = profile.checks.filter((c) => c.required);
  const notRun = required.filter((r) => {
    const c = d.checks.find((x) => x.instance === r.instance);
    return !c || c.outcome === null || ['missing', 'unavailable', 'skipped', 'not_applicable'].includes(c.outcome);
  }).map((r) => ({ instance: r.instance, outcome: d.checks.find((x) => x.instance === r.instance)?.outcome ?? 'not planned', reason: d.checks.find((x) => x.instance === r.instance)?.outcomeReason ?? null }));
  const summary = {
    repo,
    at: new Date().toISOString(),
    durationMs: Date.now() - started,
    discovery: { facts: snapshot.facts.length, components: snapshot.components.length },
    proposedChecks: proposed.checks.length,
    approvedChecks: profile.checks.length,
    verdict: d.run.verdict,
    purity: d.purity,
    outcomes: Object.fromEntries(['passed', 'failed', 'warning', 'needs_review', 'missing', 'unavailable', 'skipped', 'cancelled', 'not_applicable', 'flaky'].map((o) => [o, d.checks.filter((c) => c.outcome === o).length])),
    checks,
    findings: results.findings.length,
    blockingOpen: blockingOpen.map((f) => ({ id: f.displayId, checkId: f.checkId, rule: f.ruleId, severity: f.severity, location: f.location })),
    requiredNotRun: notRun,
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'self-check.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(out, 'report-ar.md'), `${report.human.text}\n`);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report.report, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: summary.verdict, karat: d.purity?.karat ?? null, outcomes: summary.outcomes, blockingOpen: blockingOpen.length, requiredNotRun: notRun }, null, 2));
  process.exit(blockingOpen.length ? 1 : 0);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
