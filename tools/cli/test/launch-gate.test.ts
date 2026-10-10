// C-12 point 3 and FR-55 at the launch (independent review of DEV-5): the spec that runs is the one the project's
// files give now, and it runs only if it may — never a command that became refused (sudo) after the plan, never
// anything when the files cannot be read again (a root replaced by a link, D-05), never a project command of a
// run that waited in the queue while the project became «غير موثوق», and never a project command that was not
// approved, even when it is chosen explicitly without being included in the profile [D-DEV5-12].
import type { RunPlan } from '@ayar/protocol';
import { readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, approveAll, check, connectEngine, loginShell, materialize, ok, plan, startRun, tempDir, waitRun, type EngineConnection } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-gate-')));
afterEach(() => cleanup());

/** The processes a run launched, from the ledger (services included). */
const launches = (dataDir: string, runId: string): unknown[] => {
  const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
  try {
    return db.prepare('SELECT id FROM process_ledger WHERE run_id = ?').all(runId);
  } finally {
    db.close();
  }
};

async function withEngine(fn: (engine: EngineConnection, dataDir: string) => Promise<void>): Promise<void> {
  const dataDir = join(root, 'AYAR');
  const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
  try {
    await engine.waitForEvent('engine.health');
    await fn(engine, dataDir);
  } finally {
    await engine.close();
  }
}

describe('the launch gate (C-12 point 3, FR-55)', () => {
  it('a script that became refused (sudo) after the plan is not run', async () => {
    await withEngine(async (engine, dataDir) => {
      const project = materialize('FX-PROC', 'good', join(root, 'fx'));
      const { projectId } = await addProject(engine, project);
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'beh.unit@.' });
      expect(p.items.find((i) => i.instance === 'beh.unit@.')?.status).toBe('run');
      const pkg = join(project, 'package.json');
      writeFileSync(pkg, readFileSync(pkg, 'utf8').replace('"test": "node --test"', '"test": "sudo node --test"'));
      const { runId } = await startRun(engine, p.id);
      const d = await waitRun(engine, runId);
      expect(check(d, 'beh.unit@.')).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'setup.reason.refused' }, raw: null });
      expect(launches(dataDir, runId)).toEqual([]);
    });
  }, 60_000);

  it('fails closed when the project root was replaced by a link: nothing runs, no snapshot follows it', async () => {
    await withEngine(async (engine, dataDir) => {
      const project = materialize('FX-PROC', 'good', join(root, 'fx'));
      const { projectId } = await addProject(engine, project);
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'beh.unit@.' });
      renameSync(project, join(root, 'elsewhere'));
      symlinkSync(join(root, 'elsewhere'), project);
      const started = await engine.invoke('run.start', { planId: p.id });
      if (!started.ok) {
        // Refused at the start is as good: nothing ran.
        expect(started.error.code).toBe('path_missing');
        return;
      }
      const runId = (started.result as { runId: string }).runId;
      const d = await waitRun(engine, runId);
      expect(check(d, 'beh.unit@.')).toMatchObject({ outcome: 'unavailable', outcomeReason: { key: 'run.reason.specNotVerified' }, raw: null });
      expect(launches(dataDir, runId)).toEqual([]);
      const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
      try {
        expect(db.prepare('SELECT snapshot_start_id AS s, snapshot_end_id AS e FROM runs WHERE id = ?').get(runId)).toEqual({ s: null, e: null });
      } finally {
        db.close();
      }
    });
  }, 60_000);

  it('a run queued while the project became «غير موثوق» launches none of its project commands', async () => {
    await withEngine(async (engine, dataDir) => {
      const { projectId } = await addProject(engine, materialize('FX-PROC', 'good', join(root, 'fx')));
      ok(await engine.invoke('profile.update', {
        projectId,
        patch: {
          custom: {
            wait: { argv: ['node', '-e', 'setTimeout(() => {}, 3000)'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } },
            hello: { argv: ['node', '-e', '1'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } },
          },
        },
      }));
      await approveAll(engine, projectId);
      // A plan not started is replaced by the next one of the same project: each is started before the next.
      const first: RunPlan = await plan(engine, projectId, { kind: 'check', instance: 'custom.wait@.' });
      const a = await startRun(engine, first.id);
      const second: RunPlan = await plan(engine, projectId, { kind: 'check', instance: 'custom.hello@.' });
      const b = await startRun(engine, second.id);
      // D-33: one active run; the second waits in the queue.
      expect(b.state).toBe('queued');
      ok(await engine.invoke('project.setTrust', { projectId, trusted: false }));
      await waitRun(engine, a.runId);
      const d = await waitRun(engine, b.runId);
      expect(check(d, 'custom.hello@.')).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'setup.reason.untrusted' }, raw: null });
      expect(launches(dataDir, b.runId)).toEqual([]);
    });
  }, 60_000);

  it('a project command chosen explicitly but not included in the profile needs its approval first [D-DEV5-12]', async () => {
    await withEngine(async (engine) => {
      const { projectId } = await addProject(engine, materialize('FX-PROC', 'good', join(root, 'fx')));
      ok(await engine.invoke('profile.update', {
        projectId,
        patch: {
          custom: { optional: { argv: ['node', '-e', '1'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } },
          checks: { 'custom.optional@.': { included: false } },
        },
      }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'custom.optional@.' });
      const item = p.items.find((i) => i.instance === 'custom.optional@.');
      expect(item).toMatchObject({ status: 'missing', readiness: 'needs_approval' });
      expect(item?.reasons).toContainEqual({ key: 'setup.reason.notApproved' });
      // Included and approved, it runs.
      ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'custom.optional@.': { included: true } } } }));
      await approveAll(engine, projectId);
      const again = await plan(engine, projectId, { kind: 'check', instance: 'custom.optional@.' });
      expect(again.items.find((i) => i.instance === 'custom.optional@.')?.status).toBe('run');
      const d = await waitRun(engine, (await startRun(engine, again.id)).runId);
      expect(check(d, 'custom.optional@.').raw).toMatchObject({ ended: 'exited', exitCode: 0 });
    });
  }, 60_000);

  it('a covered check whose covering check is stopped at its launch runs on its own (9.4 point 5)', async () => {
    await withEngine(async (engine, dataDir) => {
      const { projectId } = await addProject(engine, materialize('FX-PROC', 'good', join(root, 'fx')));
      ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.stability@.': { included: true } } } }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'group', instances: ['beh.unit@.', 'beh.stability@.'] });
      expect(p.items.find((i) => i.instance === 'beh.unit@.')).toMatchObject({ status: 'covered', coveredBy: 'beh.stability@.' });
      // Between the plan and «ابدأ», beh.stability loses its approval (as a changed spec would).
      const db = new DatabaseSync(join(dataDir, 'ayar.db'));
      try {
        db.prepare("DELETE FROM approvals WHERE project_id = ? AND check_id = 'beh.stability'").run(projectId);
      } finally {
        db.close();
      }
      const d = await waitRun(engine, (await startRun(engine, p.id)).runId);
      expect(check(d, 'beh.stability@.')).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'run.reason.specChangedSinceApproval' }, raw: null });
      // beh.unit does not inherit «ناقص»: it ran its own tests.
      expect(check(d, 'beh.unit@.').raw).toMatchObject({ ended: 'exited', exitCode: 0 });
      expect(check(d, 'beh.unit@.').outcome).not.toBe('missing');
    });
  }, 60_000);
});
