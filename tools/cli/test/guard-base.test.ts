// C-22 (integ.guard, 11.4 rule 9): when the guard had a base to compare against and its snapshot is gone (a manifest
// blob lost, a snapshot removed), integrity cannot be verified: the check is «يحتاج مراجعة» with that reason, never
// «اجتاز». Found while following the audit of 2026-10-12: judgement() turned a «needs review» with no effect into a
// pass «all its effects (0) were excluded by your review». And a lost base stays unverified after its carried effects
// are reviewed as false alarms: the execution, judged again from its report (11.4 rule 7), neither passes nor lets the
// round be «نقي». An older execution whose base cannot be shown intact (no `baseLost` in its kept report, its integrity
// evidence gone) is treated alike: a new full scan settles it, no review of its effects or of the check itself does.
import type { ReportBuilt, ResultsPage, RunDetail } from '@ayar/protocol';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, approveAll, check, connectEngine, loginShell, ok, plan, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-AUDIT-FIX-guard-')));
afterEach(() => cleanup());

describe('C-22: a lost base is never a pass', () => {
  it('the round\'s base snapshot unreadable: integ.guard «يحتاج مراجعة» (guardBaseLost), in the results and the report', async () => {
    const project = join(root, 'project');
    mkdirSync(join(project, 'src'), { recursive: true });
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'aud-guard', version: '1.0.0', type: 'module' }));
    writeFileSync(join(project, 'src', 'value.js'), 'export const value = 1;\n');
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('profile.update', { projectId, patch: { custom: { pass: { argv: ['node', '-e', 'process.exit(0)'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
      await approveAll(engine, projectId);
      // The first round: the guard has no base yet, and passes on its inventory.
      const full = await waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'full' })).id)).runId, 300_000);
      expect(check(full, 'integ.guard@.')).toMatchObject({ outcome: 'passed', outcomeReason: { key: 'integrity.reason.guardNoBaseline' } });
      // Its base snapshot is lost: the manifest blob of the round's snapshot is gone from the store.
      const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
      const sha = (db.prepare('SELECT s.manifest_blob_sha AS sha FROM rounds r JOIN snapshots s ON s.id = r.snapshot_id WHERE r.project_id = ?').get(projectId) as { sha: string }).sha;
      db.close();
      rmSync(join(dataDir, 'snapshots', 'blobs', sha.slice(0, 2), `${sha}.gz`));
      const d: RunDetail = await waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'group', instances: ['custom.pass@.', 'integ.guard@.'] })).id)).runId);
      expect(check(d, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.guardBaseLost' } });
      const b = ok<ReportBuilt>(await engine.invoke('report.build', { target: { kind: 'run', runId: d.run.runId }, options: { lang: 'ar', scope: 'wholeRun' } }));
      expect(b.report.integrity.checks.find((c) => c.checkId === 'integ.guard')).toMatchObject({ outcome: 'needs_review', reason: { key: 'integrity.reason.guardBaseLost' } });
      expect(b.report.integrity.blocksPure).toBeGreaterThan(0);
    } finally {
      await engine.close();
    }
  }, 360_000);

  it('the base lost with a carried effect: reviewing every effect as a false alarm leaves integ.guard unverified, and the round never «نقي»', async () => {
    const project = join(root, 'project');
    mkdirSync(join(project, 'src'), { recursive: true });
    mkdirSync(join(project, 'test'), { recursive: true });
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'aud-guard-review', version: '1.0.0', type: 'module' }));
    writeFileSync(join(project, 'src', 'value.js'), 'export const value = 1;\n');
    const testFile = join(project, 'test', 'value.test.js');
    writeFileSync(testFile, "import { test } from 'node:test';\ntest('value', () => {});\n");
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('profile.update', { projectId, patch: { custom: { pass: { argv: ['node', '-e', 'process.exit(0)'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
      await approveAll(engine, projectId);
      const full = async () => waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'full' })).id)).runId, 300_000);
      // Round 1, then a skipped test: the guard records the effect against its base.
      await full();
      writeFileSync(testFile, "import { test } from 'node:test';\ntest.skip('value', () => {});\n");
      const effect = await waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'group', instances: ['custom.pass@.', 'integ.guard@.'] })).id)).runId);
      expect(check(effect, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.guardFindings' } });
      // Every base snapshot is lost (their manifests gone from the store), the skip still in place.
      const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
      const shas = (db.prepare('SELECT manifest_blob_sha AS sha FROM snapshots WHERE project_id = ?').all(projectId) as { sha: string }[]).map((r) => r.sha);
      db.close();
      for (const sha of shas) rmSync(join(dataDir, 'snapshots', 'blobs', sha.slice(0, 2), `${sha}.gz`), { force: true });
      const lost = await full();
      const guard = check(lost, 'integ.guard@.');
      expect(guard.outcome).toBe('needs_review');
      expect(lost.purity?.verdict).not.toBe('pure');
      // The carried effect reviewed as a false alarm: the execution is judged again from its report.
      const page = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: lost.run.runId, includeExcluded: true, limit: 1000 } }));
      const carried = page.findings.filter((f) => f.checkId === 'integ.guard');
      expect(carried.length).toBeGreaterThan(0);
      for (const f of carried) ok(await engine.invoke('review.record', { target: { type: 'finding', id: f.id }, decision: 'false_positive', note: 'reviewed: a false alarm' }));
      const after = ok<RunDetail>(await engine.invoke('run.get', { runId: lost.run.runId }));
      expect(check(after, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.guardBaseLost' } });
      expect(after.purity?.verdict).not.toBe('pure');
      expect(after.purity?.incompleteReasons).toContainEqual({ key: 'purity.reason.integrityCheck', params: { check: 'integ.guard', outcome: 'needs_review' } });
      const b = ok<ReportBuilt>(await engine.invoke('report.build', { target: { kind: 'run', runId: lost.run.runId }, options: { lang: 'ar', scope: 'wholeRun' } }));
      expect(b.report.integrity.checks.find((c) => c.checkId === 'integ.guard')).toMatchObject({ outcome: 'needs_review', reason: { key: 'integrity.reason.guardBaseLost' } });
    } finally {
      await engine.close();
    }
  }, 600_000);

  /** A project, its engine, round 1, then a skipped test and a full scan: integ.guard «يحتاج مراجعة» with its effect. */
  async function withEffect(body: (o: { engine: Awaited<ReturnType<typeof connectEngine>>; projectId: string; dataDir: string; round: RunDetail }) => Promise<void>): Promise<void> {
    const project = join(root, 'project');
    mkdirSync(join(project, 'src'), { recursive: true });
    mkdirSync(join(project, 'test'), { recursive: true });
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'aud-guard-old', version: '1.0.0', type: 'module' }));
    writeFileSync(join(project, 'src', 'value.js'), 'export const value = 1;\n');
    const testFile = join(project, 'test', 'value.test.js');
    writeFileSync(testFile, "import { test } from 'node:test';\ntest('value', () => {});\n");
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('profile.update', { projectId, patch: { custom: { pass: { argv: ['node', '-e', 'process.exit(0)'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
      await approveAll(engine, projectId);
      const full = async () => waitRun(engine, (await startRun(engine, (await plan(engine, projectId, { kind: 'full' })).id)).runId, 300_000);
      await full();
      writeFileSync(testFile, "import { test } from 'node:test';\ntest.skip('value', () => {});\n");
      const round = await full();
      expect(check(round, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.guardFindings' } });
      await body({ engine, projectId, dataDir, round });
    } finally {
      await engine.close();
    }
  }
  const reviewEffects = async (engine: Awaited<ReturnType<typeof connectEngine>>, projectId: string, runId: string) => {
    const page = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId, includeExcluded: true, limit: 1000 } }));
    const effects = page.findings.filter((f) => f.checkId === 'integ.guard');
    expect(effects.length).toBeGreaterThan(0);
    for (const f of effects) ok(await engine.invoke('review.record', { target: { type: 'finding', id: f.id }, decision: 'false_positive', note: 'reviewed: a false alarm' }));
  };

  it('control: with its base shown whole, a guard whose every effect is a false alarm passes (D-35)', async () => {
    await withEffect(async ({ engine, projectId, round }) => {
      await reviewEffects(engine, projectId, round.run.runId);
      const after = ok<RunDetail>(await engine.invoke('run.get', { runId: round.run.runId }));
      expect(check(after, 'integ.guard@.').outcome).toBe('passed');
    });
  }, 600_000);

  it('an older execution whose base cannot be shown intact: «يحتاج مراجعة» asking for a new scan, no review passes it, the round never «نقي»', async () => {
    await withEffect(async ({ engine, projectId, dataDir, round }) => {
      const guard = check(round, 'integ.guard@.');
      // As an execution from before this version, with its integrity evidence lost: its kept report says nothing of its base.
      const parsed = join(dataDir, 'evidence', guard.evidence.find((e) => e.kind === 'parsed')!.relPath);
      const report = JSON.parse(readFileSync(parsed, 'utf8')) as { info: Record<string, unknown> };
      delete report.info.baseLost;
      chmodSync(parsed, 0o600); // evidence is kept read-only
      writeFileSync(parsed, JSON.stringify(report));
      rmSync(join(dataDir, 'evidence', guard.evidence.find((e) => e.kind === 'integrity')!.relPath));
      await reviewEffects(engine, projectId, round.run.runId);
      const after = ok<RunDetail>(await engine.invoke('run.get', { runId: round.run.runId }));
      expect(check(after, 'integ.guard@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.guardBaseUnverified' } });
      // Accepting the check by hand is refused too: a new full scan settles it.
      expect(await engine.invoke('review.record', { target: { type: 'check', id: guard.checkRunId }, decision: 'accept', note: 'accepted by hand' })).toMatchObject({ ok: false, error: { code: 'invalid_payload', details: { reason: 'guard_base_unverified' } } });
      const final = ok<RunDetail>(await engine.invoke('run.get', { runId: round.run.runId }));
      expect(check(final, 'integ.guard@.').outcome).toBe('needs_review');
      expect(final.purity?.verdict).not.toBe('pure');
      expect(final.purity?.incompleteReasons).toContainEqual({ key: 'purity.reason.integrityCheck', params: { check: 'integ.guard', outcome: 'needs_review' } });
      const b = ok<ReportBuilt>(await engine.invoke('report.build', { target: { kind: 'run', runId: round.run.runId }, options: { lang: 'ar', scope: 'wholeRun' } }));
      expect(b.human.text).toContain('تعذّر إثبات سلامة أساس المقارنة لهذا التنفيذ، فلا تحسمه مراجعة. أعد فحصًا كاملًا');
    });
  }, 600_000);
});
