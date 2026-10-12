// C-22 (integ.guard, 11.4 rule 9): when the guard had a base to compare against and its snapshot is gone (a manifest
// blob lost, a snapshot removed), integrity cannot be verified: the check is «يحتاج مراجعة» with that reason, never
// «اجتاز». Found while following the audit of 2026-10-12: judgement() turned a «needs review» with no effect into a
// pass «all its effects (0) were excluded by your review».
import type { ReportBuilt, RunDetail } from '@ayar/protocol';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
});
