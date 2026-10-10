// AT-13, the engine part (FR-25, NFR-02): the engine is killed while a long check runs. Its group keeps running,
// orphaned; the next engine on the same data folder ends it at boot — only after matching the leader's start time
// (a reused pid is never killed: boot.test.ts) — clears tmp/, and marks the check «انقطع» and the run interrupted.
// The state is consistent after opening, and «أعد غير المكتمل» offers the check again. Sleep is DEV-13's part.
import type { RunDetail, RunPlan } from '@ayar/protocol';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, alive, approveAll, check, connectEngine, ledgerTokens, loginShell, materialize, ok, plan, processesWithTokens, startRun, tempDir, until } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
const groups: number[] = [];
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at13-')));
afterEach(() => {
  for (const g of groups.splice(0)) {
    try {
      process.kill(-g, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  cleanup();
});

describe('AT-13 (engine): killed mid-run, recovered at the next boot', () => {
  it('ends the orphaned group after matching its start time, marks the check interrupted, and offers it again', async () => {
    const project = materialize('FX-PROC', 'long-running', join(root, 'fx'));
    const dataDir = join(root, 'AYAR');
    const shell = loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' });
    const first = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: shell } });
    let runId: string;
    let projectId: string;
    let leader: number;
    try {
      await first.waitForEvent('engine.health');
      ({ projectId } = await addProject(first, project));
      ok(await first.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { explicitEnv: { FX_PROC_SECONDS: '60' } } } } }));
      await approveAll(first, projectId);
      const p = await plan(first, projectId, { kind: 'check', instance: 'beh.unit@.' });
      runId = (await startRun(first, p.id)).runId;
      // The check is running: its ledger row names its group, with the start time the system reported.
      const row = await (async () => {
        let r: { pid: number; os_start_time: string } | undefined;
        await until(() => {
          const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
          try {
            r = db.prepare("SELECT pid, os_start_time FROM process_ledger WHERE kind = 'check' AND state = 'running' AND pid > 0").get() as typeof r;
          } finally {
            db.close();
          }
          return r !== undefined;
        }, 30_000);
        return r!;
      })();
      leader = row.pid;
      groups.push(leader);
      expect(row.os_start_time).not.toBe('');
      await first.waitForEvent('check.progress', (e) => e.payload.runId === runId, 15_000);
      expect(readdirSync(join(dataDir, 'tmp')).length).toBeGreaterThan(0);
    } finally {
      // The engine dies without a word (SIGKILL): nothing of it can clean up.
      first.process.child.kill('SIGKILL');
      await first.process.exited;
    }
    expect(alive(leader)).toBe(true); // orphaned, still running

    const second = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: shell } });
    try {
      const health = await second.waitForEvent('engine.health');
      expect(health.payload).toMatchObject({ state: 'ready', reason: null }); // integrity_check passed at boot
      expect(await until(() => !alive(leader), 5000)).toBe(true);
      expect(readdirSync(join(dataDir, 'tmp'))).toEqual([]);
      const detail = ok<RunDetail>(await second.invoke('run.get', { runId }));
      expect(detail.run.state).toBe('interrupted');
      expect(check(detail, 'beh.unit@.')).toMatchObject({ state: 'finished', outcome: 'interrupted', outcomeReason: { key: 'run.reason.engineStopped' } });
      // «أعد غير المكتمل» offers it again, linked to the interrupted execution.
      const again = ok<RunPlan>(await second.invoke('run.rerun', { runId, filter: { mode: 'incomplete' } }));
      expect(again.items.find((i) => i.instance === 'beh.unit@.')?.status).toBe('run');
      expect(again.previousRunId).toBe(runId);
      const list = ok<{ runs: { runId: string; state: string }[] }>(await second.invoke('runs.list', { projectId }));
      expect(list.runs.map((r) => r.state)).toEqual(['interrupted']);
    } finally {
      await second.close();
    }
    expect(processesWithTokens(ledgerTokens(dataDir))).toEqual([]);
  }, 120_000);
});
