// The fix cycle and the integrity guard through the engine on FX-EXT (AT-24, AT-25, AT-22 and AT-46 in their engine
// parts; FR-33, FR-34, FR-39, FR-47, FR-48, D-12, D-31, D-35, G-17):
// - a base run with a failing test and a lint error, then each version of AT-24 applied over the same project and
//   re-checked: (أ) the real fix is «زال» and the checks pass; (ب) it.skip, (ج) eslint-disable, (د) a changed
//   snapshot, (هـ) a lowered threshold each make the touched check «يحتاج مراجعة» with the guard's finding at its
//   place; (و) the guard works in a new full scan too and the verdict is not «نقي»; (ز) an accepted review makes
//   the check «اجتاز (بمراجعة)» with its automatic outcome kept and the round computed again, and a change in a file
//   of its scope expires it so the check goes back to «يحتاج مراجعة»; (ح) a false-alarm review excludes a suspected
//   finding now, its count shown, and the check judged again;
// - AT-25 on the good variant with a toggle test: a full scan with the dependencies missing, their setup, «أعد غير المكتمل» merged
//   into the same round with the karat updated; a source change then «أعد الفاشل» as a targeted run with the karat
//   unchanged; and on the unchanged state a failure then a pass merged as «متذبذب», both attempts kept;
// - compare.runs between two of these runs (AT-22), and the integrity panel of the report (AT-46).
import type { ReportBuilt, ResultsPage, ReviewRecorded, RunComparison, RunDetail, RunPlan } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addProject, approveAll, plan, rescan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, execOf, installDependencies, materialize, ok, PNPM, tempDir, type EngineConnection } from './support/scan.ts';

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-9-integrity-'));
  engine = await engineFor(root);
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

/** The project as another variant of FX-EXT, in place (AT-24: «طبّق كل نسخة على حدة» on the same project). */
function overlay(project: string, variant: string): void {
  const from = materialize('FX-EXT', variant, join(root, `v-${variant}-${Date.now()}`));
  execFileSync('/usr/bin/rsync', ['-a', '--delete', '--exclude', 'node_modules', '--exclude', '.git', '--exclude', '.ayar', `${from}/`, `${project}/`]);
}

async function runGroup(projectId: string, instances: string[], timeout = 600_000): Promise<RunDetail> {
  const p = await plan(engine, projectId, { kind: 'group', instances });
  return waitRun(engine, (await startRun(engine, p.id)).runId, timeout);
}

const results = async (projectId: string, runId: string) => ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId, includeExcluded: true, limit: 1000 } }));

describe.runIf(existsSync(PNPM))('AT-24: the fix cycle and the integrity guard (C-22)', () => {
  let projectId: string;
  let project: string;
  let base: RunDetail;
  let full: RunDetail;

  it('the base round: a failing test and a lint error; the guard passes with no base to compare', async () => {
    project = materialize('FX-EXT', 'integrity-baseline', join(root, 'ext'));
    installDependencies(project);
    ({ projectId } = await addProject(engine, project));
    await approveAll(engine, projectId);
    base = await runGroup(projectId, ['beh.unit@.', 'code.lint@.', 'integ.guard@.', 'integ.state@.']);
    expect(execOf(base, 'beh.unit@.')).toMatchObject({ outcome: 'failed', origin: 'project' });
    expect(execOf(base, 'code.lint@.')).toMatchObject({ outcome: 'failed' });
    expect(execOf(base, 'integ.guard@.')).toMatchObject({ outcome: 'passed', outcomeReason: { key: 'integrity.reason.guardNoBaseline' } });
    expect(execOf(base, 'integ.state@.')).toMatchObject({ outcome: 'passed', outcomeReason: { key: 'integrity.reason.stateStable' } });
    const r = await results(projectId, base.run.runId);
    expect(r.findings.filter((f) => f.effect === 'violation').map((f) => [f.checkId, f.location?.path]).sort()).toEqual([
      ['beh.unit', 'src/lib/count.test.ts'],
      ['beh.unit', 'src/lib/stats.test.ts'],
      ['code.lint', 'src/popup.ts'],
    ]);
  }, 600_000);

  it('(أ) a real fix: the findings are «زال», the checks pass, and the guard finds no effect', async () => {
    overlay(project, 'integrity-real-fix');
    const again = ok<RunPlan>(await engine.invoke('run.rerun', { runId: base.run.runId, filter: { mode: 'failed' } }));
    expect(again.items.filter((i) => i.status === 'run').map((i) => i.instance).sort()).toEqual(['beh.unit@.', 'code.lint@.']);
    const d = await waitRun(engine, (await startRun(engine, again.id)).runId, 600_000);
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'passed', findings: { review: 0, violations: 0 } });
    expect(execOf(d, 'code.lint@.')).toMatchObject({ outcome: 'passed' });
    const r = await results(projectId, d.run.runId);
    expect(r.findings.filter((f) => f.effect !== 'note')).toEqual([]);
    expect(r.resolved.map((x) => [x.checkId, x.location?.path]).sort()).toEqual([
      ['beh.unit', 'src/lib/count.test.ts'],
      ['beh.unit', 'src/lib/stats.test.ts'],
      ['code.lint', 'src/popup.ts'],
    ]);
  }, 600_000);

  let skipRun: RunDetail;
  it('(ب) it.skip on the failing test: beh.unit «يحتاج مراجعة» with the guard’s finding at the skipped line, and integ.guard too', async () => {
    overlay(project, 'integrity-skip');
    skipRun = await runGroup(projectId, ['beh.unit@.', 'integ.guard@.']);
    expect(execOf(skipRun, 'beh.unit@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'verdict.reason.guardTouched' }, autoOutcome: 'needs_review' });
    expect(execOf(skipRun, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.guardFindings', params: { count: 1 } } });
    const r = await results(projectId, skipRun.run.runId);
    const onUnit = r.findings.find((f) => f.checkId === 'beh.unit' && f.ruleId === 'guard.skipped-test');
    expect(onUnit).toMatchObject({ proof: 'suspected', effect: 'review', location: { path: 'src/lib/stats.test.ts', line: 11 } });
    expect(onUnit!.displayId).toMatch(/^AYR-BEH-UNIT-\d{4}$/);
    expect(r.findings.find((f) => f.checkId === 'integ.guard')).toMatchObject({ ruleId: 'guard.skipped-test', location: { path: 'src/lib/stats.test.ts', line: 11 }, proof: 'suspected' });
    expect(r.findings.find((f) => f.checkId === 'integ.guard')!.displayId).toMatch(/^AYR-INT-GRD-\d{4}$/);
    // A group run computes no index; the guard's effect still counts for nothing until a review (D-12).
    expect(skipRun.run.purity).toBeNull();
  }, 600_000);

  it('(ح) a false-alarm review on the suspected finding excludes it now: the check is judged again and the count shows', async () => {
    const r = await results(projectId, skipRun.run.runId);
    const f = r.findings.find((x) => x.checkId === 'beh.unit' && x.ruleId === 'guard.skipped-test')!;
    const rec = ok<ReviewRecorded>(await engine.invoke('review.record', { target: { type: 'finding', id: f.id }, decision: 'false_positive', note: 'the skipped test is being rewritten on purpose' }));
    expect(rec.finding).toMatchObject({ findingId: f.id, excluded: true });
    expect(rec.review).toMatchObject({ decision: 'false_positive', scope: { files: ['src/lib/stats.test.ts'], fingerprint: f.fingerprint }, valid: true });
    const d = ok<RunDetail>(await engine.invoke('run.get', { runId: skipRun.run.runId }));
    // The only review item was excluded: the tests themselves passed, so the execution passes, with the excluded count shown.
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'passed', findings: { excludedByReview: 1, review: 0 }, autoOutcome: 'needs_review' });
    const after = await results(projectId, skipRun.run.runId);
    expect(after.findings.find((x) => x.id === f.id)).toMatchObject({ effect: 'excluded', excludedByReview: true, reviewId: rec.review.id });
    expect(after.excludedByReview).toBe(1);
  }, 60_000);

  it('(ج) eslint-disable: code.lint «يحتاج مراجعة» with guard.silenced-rule at popup.ts:8', async () => {
    overlay(project, 'integrity-eslint-disable');
    const d = await runGroup(projectId, ['code.lint@.', 'integ.guard@.']);
    expect(execOf(d, 'code.lint@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'verdict.reason.guardTouched' } });
    const r = await results(projectId, d.run.runId);
    expect(r.findings.find((f) => f.checkId === 'code.lint')).toMatchObject({ ruleId: 'guard.silenced-rule', location: { path: 'src/popup.ts', line: 8 }, proof: 'suspected', effect: 'review' });
    expect(r.findings.find((f) => f.checkId === 'integ.guard')).toMatchObject({ ruleId: 'guard.silenced-rule', location: { path: 'src/popup.ts', line: 8 } });
  }, 600_000);

  it('(د) an updated snapshot file: beh.unit «يحتاج مراجعة» with guard.snapshot-changed', async () => {
    overlay(project, 'integrity-snapshot-update');
    const d = await runGroup(projectId, ['beh.unit@.', 'integ.guard@.']);
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'needs_review' });
    const r = await results(projectId, d.run.runId);
    expect(r.findings.find((f) => f.checkId === 'beh.unit')).toMatchObject({ ruleId: 'guard.snapshot-changed', location: { path: 'src/lib/__snapshots__/count.test.ts.snap' } });
  }, 600_000);

  it('(هـ) a lowered coverage threshold: beh.unit «يحتاج مراجعة» with guard.threshold-lowered at vitest.config.ts', async () => {
    overlay(project, 'integrity-threshold-lowered');
    const d = await runGroup(projectId, ['beh.unit@.', 'integ.guard@.']);
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'needs_review' });
    const r = await results(projectId, d.run.runId);
    const f = r.findings.find((x) => x.checkId === 'beh.unit' && x.ruleId === 'guard.threshold-lowered');
    expect(f).toMatchObject({ location: { path: 'vitest.config.ts', line: 10 } });
    expect(f!.message).toContain('90 → 60');
  }, 600_000);

  it('(و) the guard works in a new full scan: code.lint «يحتاج مراجعة», the verdict not «نقي», and the integrity panel says why', async () => {
    overlay(project, 'integrity-eslint-disable');
    await approveAll(engine, projectId);
    const p = await plan(engine, projectId, { kind: 'full' });
    full = await waitRun(engine, (await startRun(engine, p.id)).runId, 900_000);
    expect(execOf(full, 'code.lint@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'verdict.reason.guardTouched' } });
    expect(execOf(full, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review' });
    expect(execOf(full, 'integ.state@.')).toMatchObject({ outcome: 'passed' });
    expect(full.run.verdict).not.toBe('pure');
    expect(full.purity?.integrity.guardUnreviewed).toBeGreaterThanOrEqual(1);
    expect(full.purity?.incompleteReasons.map((r) => r.key)).toEqual(expect.arrayContaining(['purity.reason.guardUnreviewed', 'purity.reason.integrityCheck']));
    // AT-46 (engine): the four panels, the hold count, and no change of the number by the integrity reasons themselves.
    const built = ok<ReportBuilt>(await engine.invoke('report.build', { target: { kind: 'run', runId: full.run.runId }, options: { lang: 'ar' } }));
    expect(built.parity.ok).toBe(true);
    expect(built.report.integrity.checks.map((c) => c.checkId).sort()).toEqual(['integ.guard', 'integ.model-claims', 'integ.reviews', 'integ.state']);
    expect(built.report.integrity.checks.find((c) => c.checkId === 'integ.guard')).toMatchObject({ outcome: 'needs_review' });
    expect(built.report.integrity.checks.find((c) => c.checkId === 'integ.model-claims')).toMatchObject({ outcome: 'not_applicable' });
    expect(built.report.integrity.blocksPure).toBeGreaterThanOrEqual(1);
    expect(built.human.text).toMatch(/يمنع حكم «نقي»: /);
    expect(built.report.integrity.guardUnreviewed).toBe(full.purity?.integrity.guardUnreviewed);
  }, 900_000);

  it('AT-22: comparing the base group run with the full scan sorts the findings and notes the different scope', async () => {
    const c = ok<RunComparison>(await engine.invoke('compare.runs', { fromRunId: base.run.runId, toRunId: full.run.runId }));
    expect(c.notes.map((n) => n.key)).toContain('compare.note.scopeDiffers');
    expect(c.karatChange).toBe('no_karat');
    expect(c.findings.resolved.map((f) => f.location?.path).sort()).toEqual(['src/lib/count.test.ts', 'src/lib/stats.test.ts', 'src/popup.ts']);
    // The guard's finding was first seen in (ج), so against the base it «عادت» rather than being new.
    expect(c.findings.reappeared.some((f) => f.ruleId === 'guard.silenced-rule')).toBe(true);
    expect(c.findings.new.some((f) => f.ruleId === 'guard.silenced-rule')).toBe(false);
    expect(c.checks.find((x) => x.instance === 'code.lint@.')).toEqual({ instance: 'code.lint@.', before: 'failed', after: 'needs_review', changed: true });
  });

  it('(ز) an accepted review: «اجتاز (بمراجعة)» with the automatic outcome kept and the round computed again; a change in its scope expires it', async () => {
    const lint = execOf(full, 'code.lint@.');
    const rec = ok<ReviewRecorded>(await engine.invoke('review.record', { target: { type: 'check', id: lint.checkRunId }, decision: 'accept', note: 'the console line is a deliberate diagnostic' }));
    expect(rec.check).toEqual({ checkRunId: lint.checkRunId, instance: 'code.lint@.', outcome: 'passed', autoOutcome: 'needs_review', roundRecomputed: true });
    expect(rec.review.scope.files).toEqual(['src/popup.ts']);
    const d = ok<RunDetail>(await engine.invoke('run.get', { runId: full.run.runId }));
    expect(execOf(d, 'code.lint@.')).toMatchObject({ outcome: 'passed', autoOutcome: 'needs_review', reviewId: rec.review.id });
    expect(d.purity?.checks.find((c) => c.instance === 'code.lint@.')).toMatchObject({ outcome: 'passed', reviewed: true, credit: 1 });
    expect(d.purity?.integrity.checks.find((c) => c.checkId === 'integ.guard')?.outcome).toBe('needs_review');
    // A change in a file of the review's scope: the review expires, integ.reviews says so, and the check goes back.
    const popup = join(project, 'src/popup.ts');
    writeFileSync(popup, `${readFileSync(popup, 'utf8')}\n// a later edit in the reviewed file\n`);
    // integ.reviews applies by the `state.reviews` signal: the profile is proposed again now that a review exists.
    await rescan(engine, projectId);
    await approveAll(engine, projectId);
    const again = await runGroup(projectId, ['code.lint@.', 'integ.reviews@.', 'integ.guard@.']);
    // Both reviews expired: this one by the edit, and (ح)'s by the later variants that replaced stats.test.ts.
    expect(execOf(again, 'integ.reviews@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.reviewsExpired', params: { count: 2, total: 2 } } });
    expect(execOf(again, 'code.lint@.')).toMatchObject({ outcome: 'needs_review' });
    const r = await results(projectId, again.run.runId);
    expect(r.findings.find((f) => f.checkId === 'code.lint' && f.ruleId === 'review.expired')).toMatchObject({ location: { path: 'src/popup.ts' }, effect: 'review' });
    expect(r.findings.find((f) => f.checkId === 'integ.reviews')).toMatchObject({ ruleId: 'review.expired' });
  }, 600_000);
});

describe.runIf(existsSync(PNPM))('AT-25: completing a round (D-31, FR-47)', () => {
  let projectId: string;
  let project: string;
  let first: RunDetail;

  it('1. a full scan with the dependencies missing, their setup, then «أعد غير المكتمل» merged into the same round with the karat updated', async () => {
    project = materialize('FX-EXT', 'good', join(root, 'round'));
    // A test that passes only when a marker exists under node_modules, which the state snapshot never includes: the
    // same state can then fail once and pass once (step 3). The flaky fixture cannot do this across executions, since
    // its counter lives in the TMPDIR the engine gives each execution (C-07 point 5).
    writeFileSync(join(project, 'src/lib/toggle.test.ts'), "import { existsSync } from 'node:fs';\nimport { expect, it } from 'vitest';\nit('sees the marker outside the state', () => {\n  expect(existsSync(new URL('../../node_modules/.ayar-at25-pass', import.meta.url))).toBe(true);\n});\n");
    ({ projectId } = await addProject(engine, project));
    await approveAll(engine, projectId);
    const p = await plan(engine, projectId, { kind: 'full' });
    expect(p.items.find((i) => i.instance === 'beh.unit@.')).toMatchObject({ status: 'missing', readiness: 'needs_setup' });
    first = await waitRun(engine, (await startRun(engine, p.id)).runId, 900_000);
    expect(execOf(first, 'beh.unit@.')).toMatchObject({ outcome: 'missing' });
    expect(first.run.purity).toMatchObject({ partial: false });
    const roundId = first.purity!.scope.kind === 'round' ? first.purity!.scope.roundId! : '';
    const karatBefore = first.purity!.karat;
    // «ثبّت التبعيات», then the round is completed on the same state (node_modules is outside the state).
    installDependencies(project);
    const cont = ok<RunPlan>(await engine.invoke('run.continueRound', { roundId }));
    expect(cont.items.filter((i) => i.status === 'run').map((i) => i.instance)).toContain('beh.unit@.');
    const d = await waitRun(engine, (await startRun(engine, cont.id)).runId, 900_000);
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'failed' }); // no marker yet
    expect(d.run.purity).toMatchObject({ roundId, partial: false });
    expect(d.purity?.checks.find((c) => c.instance === 'beh.unit@.')).toMatchObject({ outcome: 'failed' });
    // Other incomplete checks ran now (code.lint, code.types…): the karat moved within the same round.
    expect(d.purity!.karat).not.toBe(karatBefore);
    expect(d.purity!.checks.filter((c) => c.outcome === 'passed').length).toBeGreaterThan(first.purity!.checks.filter((c) => c.outcome === 'passed').length);
  }, 1_200_000);

  it('2. a source change then «أعد الفاشل»: a targeted run with no index, the round’s karat unchanged', async () => {
    const roundBefore = ok<RunDetail>(await engine.invoke('run.get', { runId: first.run.runId })).purity!;
    const file = join(project, 'src/lib/count.ts');
    const original = readFileSync(file, 'utf8');
    writeFileSync(file, `${original}\n// changed after the round\n`);
    try {
      const again = ok<RunPlan>(await engine.invoke('run.rerun', { runId: first.run.runId, filter: { mode: 'failed' } }));
      const d = await waitRun(engine, (await startRun(engine, again.id)).runId, 600_000);
      expect(d.run.purity).toBeNull();
      expect(d.run.verdict).toBeNull();
      const roundAfter = ok<RunDetail>(await engine.invoke('run.get', { runId: first.run.runId })).purity!;
      expect(roundAfter.karat).toBe(roundBefore.karat);
      expect(roundAfter.checks.find((c) => c.instance === 'beh.unit@.')?.outcome).toBe('failed');
    } finally {
      writeFileSync(file, original);
    }
  }, 600_000);

  it('3. on the unchanged state, a failure then a pass merge as «متذبذب», both attempts kept, the karat not raised', async () => {
    const roundBefore = ok<RunDetail>(await engine.invoke('run.get', { runId: first.run.runId })).purity!;
    writeFileSync(join(project, 'node_modules/.ayar-at25-pass'), ''); // outside the state: the toggle test passes now
    const again = ok<RunPlan>(await engine.invoke('run.rerun', { runId: first.run.runId, filter: { mode: 'failed' } }));
    const d = await waitRun(engine, (await startRun(engine, again.id)).runId, 600_000);
    expect(execOf(d, 'beh.unit@.')).toMatchObject({ outcome: 'passed' });
    // Merged into the round by D-31: «اجتاز» against «أخفق» on the same state is «متذبذب», never a pass.
    expect(d.run.purity).toMatchObject({ roundId: roundBefore.scope.kind === 'round' ? roundBefore.scope.roundId : null });
    const merged = d.purity!.checks.find((c) => c.instance === 'beh.unit@.');
    expect(merged).toMatchObject({ outcome: 'flaky', credit: 0 });
    expect(d.purity!.karat).toBe(roundBefore.karat);
    expect(d.purity!.incompleteReasons.map((r) => r.key)).toContain('purity.reason.flaky');
  }, 600_000);
});
