// The verdict through the engine (C-15, C-16, C-19 in DEV-6), on plan 20's projects:
// - AT-03 (FR-19, FR-32, FR-40): FX-NOTEST has no tests: beh.unit is «ناقص: لا توجد اختبارات», never a pass, and the
//   round of a full scan is «غير مكتمل» because of it, with the reason first;
// - AT-47 (FR-05, FR-47): FX-MONO's two packages are two independent instances of beh.unit: the criterion counts
//   n_k = 2 with one passed, the failure stays in its own instance, «أعد الفاشل» reruns that instance alone, and
//   the same command text in two packages is never shared (D-45);
// - AT-34 (FR-15, FR-22, FR-36), its DEV-6 part (G-DEV5-02): FX-NOISY's composite test script runs as approved with
//   the report flags reaching node:test, the direct call is suggested, and a file changed during the full scan
//   makes the round «غير مكتمل» («تغيرت الحالة أثناء الفحص»);
// - AT-21 (FR-40 to FR-42), the engine's part: a full scan makes a round (ROUND-NNN) whose index is never the number
//   alone (the verdict, K and |R| with it), a section run computes its karat marked «جزئي» with no verdict, other
//   runs compute none, run.summary carries it; and the findings keep their display ids and status across runs.
import type { ProfileView, ReadinessReport, ResultsPage, RunDetail, RunPlan, SetupExecuteResult } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../../../tools/cli/src/grants.ts';
import { addProject, approveAll, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, execOf, installDependencies, LOGIN_PATH, materialize, ok, PNPM, tempDir, type EngineConnection } from './support/scan.ts';
import { systemBin } from './support/variants.ts';

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-6-verdicts-'));
  engine = await engineFor(root, { path: `${systemBin(root)}:${LOGIN_PATH}` });
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

async function run(projectId: string, selection: Parameters<typeof plan>[2]): Promise<RunDetail> {
  const p = await plan(engine, projectId, selection);
  return waitRun(engine, (await startRun(engine, p.id)).runId, 300_000);
}

const results = async (projectId: string, runId: string) => ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId, includeExcluded: true } }));

describe.runIf(existsSync(PNPM))('the verdict through the engine', () => {
  it('AT-03: no tests is «ناقص», never a pass, and the full scan is «غير مكتمل» because of it', async () => {
    const path = materialize('FX-NOTEST', 'good', join(root, 'notest'));
    const { projectId } = await addProject(engine, path);
    await approveAll(engine, projectId);
    const d = await run(projectId, { kind: 'full' });
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'setup.reason.missing.tests' } });
    expect(d.run.verdict).toBe('incomplete');
    expect(d.run.purity).toMatchObject({ formula: 'purity/1', verdict: 'incomplete', partial: false });
    expect(d.purity?.incompleteReasons[0]).toMatchObject({ key: 'purity.reason.missing' });
    expect(d.purity?.checks.find((c) => c.instance === 'beh.unit@.')).toMatchObject({ outcome: 'missing', credit: 0 });
    // The round is kept, by its display id, with the run that made it.
    const round = d.purity?.scope;
    expect(round).toMatchObject({ kind: 'round' });
    const summary = engine.events.find((e) => e.topic === 'run.summary' && (e.payload as { runId: string }).runId === d.run.runId);
    expect(summary?.payload).toMatchObject({ purity: { verdict: 'incomplete', karat: d.purity!.karat } });
  }, 300_000);

  it('AT-47: two packages, two instances; n_k = 2; the failure in its own instance; «أعد الفاشل» reruns it alone; no sharing across packages', async () => {
    const path = materialize('FX-MONO', 'failing-core', join(root, 'mono'));
    installDependencies(path);
    const { projectId } = await addProject(engine, path);
    const profile = await approveAll(engine, projectId);
    const core = profile.checks.find((c) => c.instance === 'beh.unit@packages/core')!;
    const web = profile.checks.find((c) => c.instance === 'beh.unit@packages/web')!;
    // The same command text in two packages: two invocations, never one (D-45).
    expect(core.command?.argv).toEqual(web.command?.argv);
    const p: RunPlan = await plan(engine, projectId, { kind: 'section', section: 'behavior' });
    // The root has no tests of its own: its instance does not apply; each package's runs on its own.
    expect(p.items.find((i) => i.instance === 'beh.unit@.')?.status).toBe('not_applicable');
    expect(p.items.filter((i) => i.checkId === 'beh.unit' && i.component !== '.').map((i) => [i.instance, i.status, i.sharedInvocationKey])).toEqual([
      ['beh.unit@packages/core', 'run', null],
      ['beh.unit@packages/web', 'run', null],
    ]);
    const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 300_000);
    expect(execOf(d, 'beh.unit@packages/core')).toMatchObject({ outcome: 'failed', origin: 'project' });
    expect(execOf(d, 'beh.unit@packages/web')).toMatchObject({ outcome: 'passed' });
    const r = await results(projectId, d.run.runId);
    expect(r.findings.filter((f) => f.effect === 'violation').map((f) => [f.component, f.location?.path])).toEqual([['packages/core', 'packages/core/test/index.test.js']]);
    // The section's karat: «جزئي», no verdict word; behavior counts its two instances (n_k = 2, one passed).
    expect(d.run.purity).toMatchObject({ partial: true, section: 'behavior', verdict: null });
    expect(d.purity?.criteria.find((k) => k.id === 'behavior')).toMatchObject({ n: 2, passed: 1 });
    // «أعد الفاشل»: the failing instance alone.
    const again = ok<RunPlan>(await engine.invoke('run.rerun', { runId: d.run.runId, filter: { mode: 'failed' } }));
    expect(again.items.filter((i) => i.status === 'run').map((i) => i.instance)).toEqual(['beh.unit@packages/core']);
    const d2 = await waitRun(engine, (await startRun(engine, again.id)).runId, 300_000);
    expect(execOf(d2, 'beh.unit@packages/core')).toMatchObject({ outcome: 'failed', attempt: 2 });
    // The same failure again: the same display id, «مستمر».
    const r2 = await results(projectId, d2.run.runId);
    const before = r.findings.find((f) => f.effect === 'violation')!;
    expect(r2.findings.find((f) => f.fingerprint === before.fingerprint)).toMatchObject({ displayId: before.displayId, crossRunStatus: 'persisting', firstSeenRunId: d.run.runId });
    // A rerun computes no index of its own (9.10).
    expect(d2.run.purity).toBeNull();
  }, 300_000);

  it('AT-34 (DEV-6): the composite script gets the report flags and the direct call is suggested; a change during the full scan makes it «غير مكتمل»', async () => {
    const path = materialize('FX-NOISY', 'good', join(root, 'noisy'));
    for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=fx', '-c', 'user.email=fx@ayar.local', 'commit', '-q', '-m', 'base']]) execFileSync('git', args, { cwd: path });
    const { projectId } = await addProject(engine, path);
    const profile: ProfileView = await approveAll(engine, projectId);
    const unit = profile.checks.find((c) => c.instance === 'beh.unit@.')!;
    // The approved command is the script as written, with the flags that reach node:test after it (C-15).
    expect(unit.invocation?.argv.slice(0, 3)).toEqual(['npm', 'run', 'test']);
    expect(unit.invocation?.reports).toEqual(['junit.xml']);
    expect(unit.invocation?.suggestion).toMatchObject({ argv: ['node', '--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', '--test-reporter-destination={reports}/junit.xml'], reason: 'adapter.suggest.directCall' });
    expect(unit.reasons.map((r) => r.key)).toContain('adapter.reason.compositeScript');
    // .nvmrc's version, accepted once (G-25), as AT-34 does.
    const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
    for (const a of readiness.actions.filter((x) => x.kind === 'accept_tool_version')) {
      const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: a.id }));
      const g = confirmationGrant('setup.execute', a.id, preview.digest);
      ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId: a.id, confirmationToken: g.token }, g.grants));
    }
    const d = await run(projectId, { kind: 'full' });
    const c = execOf(d, 'beh.unit@.');
    expect(c).toMatchObject({ outcome: 'passed' });
    expect(c.notes).toContain('adapter.note.directCallSuggested');
    expect(c.evidence.some((e) => e.relPath.endsWith('reports/junit.xml'))).toBe(true);
    // FX-NOISY's test writes a tracked file: the state changed during the scan, so the round is not «نقي».
    expect(d.run.stateChanged).toBe(true);
    expect(d.run.verdict).toBe('incomplete');
    expect(d.purity?.incompleteReasons.map((r) => r.key)).toContain('purity.reason.stateChanged');
  }, 300_000);

  it('AT-21 (engine): a full scan makes a round; a section has its karat «جزئي»; other runs none; the findings keep their ids', async () => {
    const path = materialize('FX-NOTEST', 'broken-anchor', join(root, 'rounds'));
    const { projectId } = await addProject(engine, path);
    await approveAll(engine, projectId);
    const full = await run(projectId, { kind: 'full' });
    expect(full.purity?.scope).toMatchObject({ kind: 'round' });
    expect(full.run.purity).toMatchObject({ formula: 'purity/1', partial: false, roundId: expect.stringMatching(/^rnd_/) as string });
    // Never the number alone (11.5): the verdict, K and |R| come with the karat.
    expect(full.run.purity).toEqual(expect.objectContaining({ verdict: expect.any(String) as string, criteriaCount: expect.any(Number) as number, checksCount: expect.any(Number) as number }));
    const refs = execOf(full, 'code.refs.local@.');
    expect(refs).toMatchObject({ outcome: 'failed', origin: 'project' });
    const r1 = await results(projectId, full.run.runId);
    const broken = r1.findings.find((f) => f.checkId === 'code.refs.local' && f.effect === 'violation')!;
    expect(broken).toMatchObject({ ruleId: expect.stringMatching(/^ref\./) as string, crossRunStatus: 'new', displayId: expect.stringMatching(/^AYR-COD-REFL-\d{4}$/) as string });
    // A section: «جزئي», no verdict word.
    const section = await run(projectId, { kind: 'section', section: 'code' });
    expect(section.run.purity).toMatchObject({ partial: true, section: 'code', verdict: null });
    expect(section.run.verdict).toBeNull();
    // A single check: no index (9.10).
    const one = await run(projectId, { kind: 'check', instance: 'code.refs.local@.' });
    expect(one.run.purity).toBeNull();
    // The fix: the finding is gone («زال») against the previous comparable execution; its id is never given again.
    writeFileSync(join(path, broken.location!.path!), '# ok\n');
    const fixed = await run(projectId, { kind: 'check', instance: 'code.refs.local@.' });
    const r2 = await results(projectId, fixed.run.runId);
    expect(r2.resolved.map((x) => x.displayId)).toContain(broken.displayId);
    expect(r2.findings.some((f) => f.displayId === broken.displayId)).toBe(false);
    // finding.get: the finding with the executions that saw it.
    const detail = ok<{ finding: { displayId: string }; history: unknown[] }>(await engine.invoke('finding.get', { findingId: r1.findings.find((f) => f.displayId === broken.displayId)!.id }));
    expect(detail.finding.displayId).toBe(broken.displayId);
    expect(detail.history.length).toBeGreaterThanOrEqual(2);
  }, 300_000);
it('D-35: a finding a review marked a false alarm does not count while its anchor is unchanged, and is always shown', async () => {
    const path = materialize('FX-NOTEST', 'broken-anchor', join(root, 'review'));
    const { projectId } = await addProject(engine, path);
    await approveAll(engine, projectId);
    const first = await run(projectId, { kind: 'check', instance: 'code.refs.local@.' });
    expect(execOf(first, 'code.refs.local@.')).toMatchObject({ outcome: 'failed' });
    const f = (await results(projectId, first.run.runId)).findings.find((x) => x.effect === 'violation')!;
    // DEV-9's review.record writes this row; here it is written as it would be (D-DEV6-14).
    const db = new DatabaseSync(join(root, 'AYAR', 'ayar.db'));
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.prepare("INSERT INTO reviews (id, project_id, target_type, target_ref, decision, scope_json, note, created_at) VALUES ('rev_test_false_alarm_000000000', ?, 'finding', ?, 'false_positive', '{}', 'test', ?)").run(projectId, f.id, new Date().toISOString());
    } finally {
      db.close();
    }
    const again = await run(projectId, { kind: 'check', instance: 'code.refs.local@.' });
    const c = execOf(again, 'code.refs.local@.');
    expect(c).toMatchObject({ outcome: 'passed', findings: { violations: 0, excludedByReview: 1 } });
    // Shown apart, never silently: counted in the page, listed with includeExcluded.
    const page = await results(projectId, again.run.runId);
    expect(page.excludedByReview).toBe(1);
    expect(page.findings.find((x) => x.fingerprint === f.fingerprint)).toMatchObject({ effect: 'excluded', excludedByReview: true, reviewId: 'rev_test_false_alarm_000000000', displayId: f.displayId });
    const hidden = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: again.run.runId } }));
    expect(hidden.findings.some((x) => x.fingerprint === f.fingerprint)).toBe(false);
    expect(hidden.excludedByReview).toBe(1);
  }, 300_000);
});
