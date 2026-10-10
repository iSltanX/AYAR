// FR-55 (G-20, G-DEV4-03, T1): in «مشروع غير موثوق» the planner leaves every project command out, with that reason,
// and the executor launches none — the project's scripts, its custom checks, its companion services, «ثبّت التبعيات».
// The reading tools still run. Trusting the project again brings them back.
import type { ReadinessReport, RunPlan } from '@ayar/protocol';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../src/grants.ts';
import { addProject, approveAll, check, connectEngine, loginShell, materialize, ok, plan, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-untrusted-')));
afterEach(() => cleanup());

describe('FR-55: «مشروع غير موثوق»', () => {
  it('leaves the project commands out of the plan and the run, keeps the reading tools, and lifts with trust', async () => {
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    let runId = '';
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'fx')));
      ok(await engine.invoke('profile.update', {
        projectId,
        patch: {
          custom: { hello: { argv: ['node', '-e', '1'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } },
          services: { dev: { argv: ['node', '-e', 'setInterval(() => {}, 1000)'], cwd: '.', readyUrl: null, readyPattern: 'never', readyTimeoutSec: 1, ports: [] } },
          checks: { 'code.lint@.': { services: ['dev'] } },
        },
      }));
      await approveAll(engine, projectId);
      ok(await engine.invoke('project.setTrust', { projectId, trusted: false }));

      const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
      const r = (i: string) => readiness.items.find((x) => x.instance === i)!;
      for (const i of ['beh.unit@.', 'code.build@.', 'code.lint@.', 'custom.hello@.']) expect(r(i), i).toMatchObject({ readiness: 'untrusted', reasons: [{ key: 'setup.reason.untrusted' }] });
      // A reading tool is not a project command (the secrets scanner).
      expect(r('sec.secrets.files@.').readiness).not.toBe('untrusted');
      // «ثبّت التبعيات» is refused too.
      const deps = readiness.actions.find((a) => a.kind === 'install_dependencies');
      if (deps) {
        const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: deps.id }));
        const g = confirmationGrant('setup.execute', deps.id, preview.digest);
        expect(await engine.invoke('setup.execute', { actionId: deps.id, confirmationToken: g.token }, g.grants)).toMatchObject({ ok: false, error: { code: 'untrusted_project' } });
      }

      const full = await plan(engine, projectId, { kind: 'full' });
      expect(full.untrusted).toBe(true);
      for (const i of ['beh.unit@.', 'code.build@.', 'code.lint@.', 'custom.hello@.']) {
        expect(full.items.find((x) => x.instance === i), i).toMatchObject({ status: 'untrusted', readiness: 'untrusted' });
        expect(full.willNotRun.find((x) => x.instance === i)?.reasons).toContainEqual({ key: 'setup.reason.untrusted' });
      }
      const d = await waitRun(engine, (runId = (await startRun(engine, full.id)).runId));
      for (const i of ['beh.unit@.', 'custom.hello@.']) expect(check(d, i)).toMatchObject({ outcome: 'missing', outcomeReason: { key: 'setup.reason.untrusted' }, raw: null });

      // Trusted again: they are back in the plan.
      ok(await engine.invoke('project.setTrust', { projectId, trusted: true }));
      const trusted: RunPlan = await plan(engine, projectId, { kind: 'full' });
      expect(trusted.untrusted).toBe(false);
      expect(trusted.items.find((x) => x.instance === 'custom.hello@.')?.status).toBe('run');
    } finally {
      await engine.close();
    }
    // Not one project command was launched in that run (the ledger names every launch, services included).
    const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
    try {
      const kinds = (db.prepare('SELECT l.kind, c.check_id FROM process_ledger l LEFT JOIN check_runs c ON c.id = l.check_run_id WHERE l.run_id = ?').all(runId) as { kind: string; check_id: string | null }[]);
      expect(kinds.filter((k) => k.kind === 'service' || ['beh.unit', 'code.build', 'code.lint', 'custom.hello'].includes(k.check_id ?? ''))).toEqual([]);
    } finally {
      db.close();
    }
  }, 120_000);
});
