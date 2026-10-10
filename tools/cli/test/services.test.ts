// FR-21 (C-12 point 10): companion services start before the checks that need them, are ready by a URL on this
// machine or a pattern in their log, stop after the last of those checks, and their redacted log is kept as
// evidence. One that never becomes ready makes its dependants «تعذّر: الخدمة المرافقة لم تجهز».
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, approveAll, check, connectEngine, ledgerTokens, loginShell, materialize, ok, plan, processesWithTokens, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-services-')));
afterEach(() => cleanup());

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => resolve(typeof a === 'object' && a ? a.port : 0));
    });
  });

describe('FR-21: companion services', () => {
  it('starts, waits for, stops, and keeps the log of the services; a service never ready fails its dependants', async () => {
    const port = await freePort();
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-PROC', 'good', join(root, 'fx')));
      const http = `require('http').createServer((q, s) => s.end('ok')).listen(${port}, '127.0.0.1', () => console.log('listening'));`;
      // A readiness pattern that is not a regular expression is refused when the profile is saved.
      expect(await engine.invoke('profile.update', { projectId, patch: { services: { bad: { argv: ['node', '-e', '1'], cwd: '.', readyUrl: null, readyPattern: '(unclosed', readyTimeoutSec: 5, ports: [] } } } })).toMatchObject({
        ok: false,
        error: { code: 'profile_invalid', details: { rule: 'service_pattern', name: 'bad' } },
      });
      ok(await engine.invoke('profile.update', {
        projectId,
        patch: {
          services: {
            web: { argv: ['node', '-e', http], cwd: '.', readyUrl: `http://127.0.0.1:${port}/`, readyPattern: null, readyTimeoutSec: 20, ports: [port] },
            silent: { argv: ['node', '-e', 'setInterval(() => {}, 1000)'], cwd: '.', readyUrl: null, readyPattern: 'never printed', readyTimeoutSec: 2, ports: [] },
          },
          custom: {
            uses: { argv: ['node', '-e', `require('http').get('http://127.0.0.1:${port}/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(2))`], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } },
            waits: { argv: ['node', '-e', '1'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } },
          },
          checks: { 'custom.uses@.': { services: ['web'] }, 'custom.waits@.': { services: ['silent'] } },
        },
      }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'group', instances: ['custom.uses@.', 'custom.waits@.'] });
      // The services are part of the plan's needs, and their ports are locks (C-10 point 7).
      expect(p.items.find((i) => i.instance === 'custom.uses@.')).toMatchObject({ locks: [`port:${port}`], needs: { services: [expect.objectContaining({ id: 'web' })] } });
      const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 60_000);
      const uses = check(d, 'custom.uses@.');
      expect(uses.raw).toMatchObject({ ended: 'exited', exitCode: 0 });
      const logRef = uses.evidence.find((x) => x.relPath.endsWith('service-web.log'))!;
      expect(readFileSync(join(dataDir, 'evidence', logRef.relPath), 'utf8')).toContain('listening');
      expect(check(d, 'custom.waits@.')).toMatchObject({ outcome: 'unavailable', outcomeReason: { key: 'run.reason.serviceNotReady', params: { service: 'silent' } } });
    } finally {
      await engine.close();
    }
    // Both services were stopped with their checks: nothing carries their tokens any more.
    expect(processesWithTokens(ledgerTokens(dataDir))).toEqual([]);
  }, 90_000);

  it('a cancel does not wait for a service that is not ready yet: the wait ends and the service stops (9.7)', async () => {
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-PROC', 'good', join(root, 'fx')));
      ok(await engine.invoke('profile.update', {
        projectId,
        patch: {
          services: { slow: { argv: ['node', '-e', 'setInterval(() => {}, 1000)'], cwd: '.', readyUrl: null, readyPattern: 'never printed', readyTimeoutSec: 120, ports: [] } },
          custom: { needs: { argv: ['node', '-e', '1'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } },
          checks: { 'custom.needs@.': { services: ['slow'] } },
        },
      }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'custom.needs@.' });
      const { runId } = await startRun(engine, p.id);
      // The service has started (its ledger row) and the check waits for it.
      const running = await engine.waitForEvent('check.state', (e) => e.payload.runId === runId && e.payload.state === 'running', 20_000);
      await new Promise((r) => setTimeout(r, 1500));
      const t0 = Date.now();
      // The check itself, while it waits (no process yet): «يُلغى», not a «finished» that is not true yet.
      expect(ok(await engine.invoke('run.cancel', { target: { kind: 'checkRun', checkRunId: running.payload.checkRunId } }))).toEqual({ accepted: true, state: 'cancelling' });
      ok(await engine.invoke('run.cancel', { target: { kind: 'run', runId } }));
      const d = await waitRun(engine, runId, 20_000);
      expect(Date.now() - t0).toBeLessThan(15_000);
      expect(check(d, 'custom.needs@.')).toMatchObject({ outcome: 'cancelled', outcomeReason: { key: 'run.reason.cancelledByUser' }, raw: null });
    } finally {
      await engine.close();
    }
    expect(processesWithTokens(ledgerTokens(dataDir))).toEqual([]);
  }, 60_000);
});
