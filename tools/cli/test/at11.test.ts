// AT-11 (FR-23, NFR-02, T12, E-22), through tools/cli on FX-PROC: cancelling a check ends its whole group within
// 15 s — a grandchild that ignores SIGINT and SIGTERM included, so the escalation goes to SIGKILL — keeps its
// partial log, and skips what depends on it; cancelling a whole run also ends the descendants that left the group
// (setsid, a double fork) by their AYAR_CHECK_TOKEN, and what escaped through launchd or a cleared environment is
// either ended or named in the note «تعذّر التحقق من إنهاء كل العمليات». Nothing else is left, by the tokens.
import type { RunDetail } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, alive, approveAll, check, connectEngine, FIXTURES, ledgerTokens, loginShell, materialize, ok, plan, processesWithTokens, startRun, tempDir, until, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
const leftovers: number[] = [];
const labels: string[] = [];
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at11-')));
afterEach(() => {
  // The test's own cleaning (FX-PROC's warning): whatever a scenario left, and the launchd job.
  for (const pid of leftovers.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  for (const label of labels.splice(0)) execFileSync('/bin/launchctl', ['remove', label], { stdio: 'ignore' });
  cleanup();
});

const pidsOf = (file: string): number[] => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(Number) : []);
const PATH = '/opt/homebrew/bin:/usr/bin:/bin';

describe('AT-11: cancelling ends the tree, within 15 s, and says what it could not verify', () => {
  it('cancels one check: its group (SIGINT, SIGTERM, SIGKILL) within 15 s, the partial log kept, the dependent skipped', async () => {
    const project = materialize('FX-PROC', 'sigterm-grandchild', join(root, 'fx'));
    const pids = join(root, 'pids.txt');
    // A build that launches the stubborn grandchild and waits, and a size budget, so code.size depends on it.
    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as Record<string, unknown>;
    pkg.scripts = { ...(pkg.scripts as object), build: 'node procs/spawn-grandchild.mjs' };
    pkg['size-limit'] = [{ path: 'dist/index.js', limit: '10 kB' }];
    writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2));
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: PATH }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'code.build@.': { explicitEnv: { FX_PROC_PIDS: pids } } } } }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'group', instances: ['code.build@.', 'code.size@.'] });
      expect(p.items.find((i) => i.instance === 'code.size@.')).toMatchObject({ status: 'run', dependsOn: ['code.build@.'] });
      const run = await startRun(engine, p.id);
      // Running, with the child and the grandchild recorded.
      await until(() => pidsOf(pids).length >= 2, 30_000);
      const recorded = pidsOf(pids);
      leftovers.push(...recorded);
      expect(recorded.length).toBeGreaterThanOrEqual(2);
      const detail = ok<RunDetail>(await engine.invoke('run.get', { runId: run.runId }));
      const build = check(detail, 'code.build@.');
      expect(build.state).toBe('running');
      const psBefore = execFileSync('/bin/ps', ['-o', 'pid=,pgid=,command=', '-p', recorded.join(',')], { encoding: 'utf8' });
      const t0 = Date.now();
      expect(ok(await engine.invoke('run.cancel', { target: { kind: 'checkRun', checkRunId: build.checkRunId } }))).toEqual({ accepted: true, state: 'cancelling' });
      await engine.waitForEvent('check.state', (e) => e.payload.checkRunId === build.checkRunId && e.payload.state === 'cancelling', 5000);
      await engine.waitForEvent('check.state', (e) => e.payload.checkRunId === build.checkRunId && e.payload.outcome === 'cancelled', 20_000);
      expect(await until(() => recorded.every((x) => !alive(x)), 15_000 - (Date.now() - t0))).toBe(true);
      expect(Date.now() - t0).toBeLessThan(15_000);
      const done = await waitRun(engine, run.runId);
      const b = check(done, 'code.build@.');
      expect(b).toMatchObject({ state: 'finished', outcome: 'cancelled', outcomeReason: { key: 'run.reason.cancelledByUser' } });
      // The partial log is kept; the escalation went all the way, since the grandchild ignores SIGINT and SIGTERM.
      expect(b.evidence.map((x) => x.relPath.split('/').pop())).toEqual(expect.arrayContaining(['stdout.log', 'stderr.log', 'meta.json']));
      const metaRef = b.evidence.find((x) => x.relPath.endsWith('meta.json'))!;
      const meta = JSON.parse(readFileSync(join(dataDir, 'evidence', metaRef.relPath), 'utf8')) as { escalation: { signal: string }[] };
      expect(meta.escalation.map((s) => s.signal)).toEqual(['SIGINT', 'SIGTERM', 'SIGKILL']);
      expect(check(done, 'code.size@.')).toMatchObject({ outcome: 'skipped', outcomeReason: { key: 'run.reason.dependencyFailed', params: { dependency: 'code.build@.' } } });
      console.log(`AT-11 ps before the cancel:\n${psBefore}AT-11 after: ${recorded.map((x) => `${x}:${alive(x) ? 'alive' : 'gone'}`).join(' ')}; ended in ${Date.now() - t0} ms`);
    } finally {
      await engine.close();
    }
    expect(processesWithTokens(ledgerTokens(dataDir))).toEqual([]);
  }, 120_000);

  it('cancels a whole run: the detached descendants end by their token, the launchd job and the cleared environment are noted', async () => {
    const project = materialize('FX-PROC', 'good', join(root, 'fx'));
    for (const v of ['setsid-detach', 'double-fork', 'launchctl-submit', 'env-cleared-detach', 'hanging-test']) {
      copyFileSync(join(FIXTURES, 'FX-PROC', 'variants', v, 'overlay', 'test', `${v}.test.js`), join(project, 'test', `${v}.test.js`));
    }
    const pids = join(root, 'pids.txt');
    const labelFile = join(root, 'label.txt');
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: PATH }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, project);
      ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.unit@.': { explicitEnv: { FX_PROC_PIDS: pids, FX_PROC_LABEL: labelFile } } } } }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'check', instance: 'beh.unit@.' });
      const run = await startRun(engine, p.id);
      // The three detached processes recorded their pids, and the launchd job its label.
      await until(() => pidsOf(pids).length >= 3 && existsSync(labelFile), 40_000);
      const recorded = pidsOf(pids);
      leftovers.push(...recorded);
      const label = readFileSync(labelFile, 'utf8').trim();
      labels.push(label);
      expect(recorded.length).toBeGreaterThanOrEqual(3);
      const psBefore = execFileSync('/bin/ps', ['-E', '-o', 'pid=,ppid=,pgid=,command=', '-p', recorded.join(',')], { encoding: 'utf8' });
      // Which of them carry the token: setsid and the double fork do; the cleared environment does not.
      const tokens = ledgerTokens(dataDir);
      const carriers = processesWithTokens(tokens).map((x) => x.pid);
      const t0 = Date.now();
      expect(ok(await engine.invoke('run.cancel', { target: { kind: 'run', runId: run.runId } }))).toMatchObject({ accepted: true });
      await engine.waitForEvent('run.state', (e) => e.payload.runId === run.runId && e.payload.state === 'cancelling', 5000);
      const done = await waitRun(engine, run.runId, 30_000);
      const elapsed = Date.now() - t0;
      const unit = check(done, 'beh.unit@.');
      expect(unit).toMatchObject({ outcome: 'cancelled', outcomeReason: { key: 'run.reason.cancelledByUser' } });
      expect(done.run).toMatchObject({ state: 'finished', cancelReason: 'user', verdict: null });
      // The group and every token carrier are gone, within 15 s of the cancel.
      for (const pid of recorded.filter((x) => carriers.includes(x))) expect(alive(pid), `token carrier ${pid}`).toBe(false);
      expect(processesWithTokens(tokens)).toEqual([]);
      expect(elapsed).toBeLessThan(15_000);
      // What escaped (launchd, a cleared environment): ended, or named — never claimed clean (17, E-22).
      const escaped = recorded.filter((x) => !carriers.includes(x) && alive(x));
      const jobAlive = execFileSync('/bin/launchctl', ['list'], { encoding: 'utf8' }).includes(label);
      if (escaped.length || jobAlive) {
        expect(unit.notes).toContain('run.note.escapeSuspected');
        const named = unit.raw?.leftovers.escapeSuspected ?? [];
        if (jobAlive) expect(named).toContainEqual({ kind: 'launchd_job', name: label });
        if (escaped.length) expect(named.some((x) => x.kind === 'launchd_child')).toBe(true);
      }
      expect(unit.raw?.leftovers.tokenKilled).toBeGreaterThanOrEqual(2);
      // The partial log is kept, and «أعد غير المكتمل» is there for the cancelled check.
      expect(unit.evidence.some((x) => x.relPath.endsWith('stdout.log'))).toBe(true);
      const again = ok<{ items: { instance: string; status: string }[] }>(await engine.invoke('run.rerun', { runId: run.runId, filter: { mode: 'incomplete' } }));
      expect(again.items.find((i) => i.instance === 'beh.unit@.')?.status).toBe('run');
      console.log(`AT-11 run cancel: ${elapsed} ms; ps before:\n${psBefore.slice(0, 1500)}\nescaped and noted: ${JSON.stringify(unit.raw?.leftovers)}`);
    } finally {
      await engine.close();
    }
  }, 150_000);
});
