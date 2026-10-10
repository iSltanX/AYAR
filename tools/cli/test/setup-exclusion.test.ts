// ORG-15 review of DEV-5, K3 and K4: a setup command («ثبّت التبعيات») is a project's process like a check. While it
// runs, no run of that project starts and the project is not removed (its dependencies are half installed); and when
// the app quits (internal.prepareQuit, or the engine told to stop), it ends the short way — never left writing into
// the project after the app is gone (C-12 point 11, T12). The package manager here is a stand-in that answers its
// version and then works for a minute, so the setup is reliably in progress.
import type { ReadinessReport, SetupExecuteResult } from '@ayar/protocol';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../src/grants.ts';
import { addProject, approveAll, connectEngine, ledgerTokens, loginShell, materialize, ok, plan, processesWithTokens, tempDir, until, type EngineConnection } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-setupx-')));
afterEach(() => cleanup());

/** A pnpm that answers 12.8.1 and otherwise marks that it started and works for a minute. */
function slowPnpm(): { bin: string; started: string } {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const started = join(root, 'pnpm-started');
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nif [ "$1" = "--version" ] || [ "$1" = "-v" ]; then echo 12.8.1; exit 0; fi\necho started > "${started}"\nexec "${process.execPath}" -e "setTimeout(() => {}, 60000)"\n`);
  chmodSync(join(bin, 'pnpm'), 0o755);
  return { bin, started };
}

/** Confirms «ثبّت التبعيات» and returns the pending call (wrapped, so awaiting this does not wait for the setup). */
async function startInstall(engine: EngineConnection, projectId: string): Promise<{ done: ReturnType<EngineConnection['invoke']> }> {
  const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
  const install = readiness.actions.find((a) => a.kind === 'install_dependencies')!;
  expect(install.preview.command).toEqual(['pnpm', 'install', '--frozen-lockfile']);
  const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: install.id }));
  const g = confirmationGrant('setup.execute', install.id, preview.digest);
  return { done: engine.invoke('setup.execute', { actionId: install.id, confirmationToken: g.token }, g.grants) };
}

describe('setup commands, runs and quitting (K3, K4)', () => {
  it('while «ثبّت التبعيات» runs, no run starts and the project is not removed; at quit it ends the short way', async () => {
    const pnpm = slowPnpm();
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: `${pnpm.bin}:/opt/homebrew/bin:/usr/bin:/bin` }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'fx')));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'code.lint@.' });
      const setup = await startInstall(engine, projectId);
      expect(await until(() => existsSync(pnpm.started), 20_000)).toBe(true);

      expect(processesWithTokens(ledgerTokens(dataDir)).length).toBeGreaterThan(0);
      // K4: the run of that project waits for the setup; so does removing the project.
      expect(await engine.invoke('run.start', { planId: p.id })).toMatchObject({ ok: false, error: { code: 'busy', details: { reason: 'setup_running' } } });
      const c = confirmationGrant('project.remove', projectId);
      expect(await engine.invoke('project.remove', { projectId, confirmationToken: c.token }, c.grants)).toMatchObject({ ok: false, error: { code: 'busy', details: { reason: 'setup_running' } } });

      // K3: quitting ends it the short way (SIGTERM, 2 s, SIGKILL), recorded «أُلغي».
      const t0 = Date.now();
      expect(ok(await engine.invoke('internal.prepareQuit', {}))).toMatchObject({ cancelledRuns: 0, cancelledSetups: 1 });
      expect(Date.now() - t0).toBeLessThan(6000);
      const done = ok<SetupExecuteResult>(await setup.done);
      expect(done.action.state).toBe('failed');
      expect(processesWithTokens(ledgerTokens(dataDir))).toEqual([]);
    } finally {
      await engine.close();
    }
  }, 90_000);

  it('the engine told to stop while a setup command runs leaves no process of it behind', async () => {
    const pnpm = slowPnpm();
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: `${pnpm.bin}:/opt/homebrew/bin:/usr/bin:/bin` }) } });
    await engine.waitForEvent('engine.health');
    const { projectId } = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'fx')));
    await approveAll(engine, projectId);
    void (await startInstall(engine, projectId)).done.catch(() => null);
    expect(await until(() => existsSync(pnpm.started), 20_000)).toBe(true);
    const tokens = ledgerTokens(dataDir);
    expect(processesWithTokens(tokens).length).toBeGreaterThan(0);
    await engine.close();
    // The stop waited for the short ending: nothing carries the setup's token any more.
    expect(await until(() => processesWithTokens(tokens).length === 0, 8000)).toBe(true);
  }, 90_000);
});
