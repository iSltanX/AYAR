// AT-34 (FR-15, FR-22, FR-36), the engine part, through tools/cli on FX-NOISY: the .nvmrc version that is not
// installed is a readiness gap before anything starts (accepted once, G-25, it runs); the evidence lists the files
// the check created, modified and deleted, the declared outputs apart and the modified tracked file highlighted
// (from Git's index, without running git); a source file changed while a run is on marks it «تغيرت الحالة أثناء
// الفحص»; and the composite test script is seen literally in the approval. The direct-call suggestion for the
// composite script is the adapter's (C-15, DEV-6), and the «غير مكتمل» verdict is C-19's (DEV-6).
import type { ProfileView, ReadinessReport, RunPlan, SetupExecuteResult } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../src/grants.ts';
import { addProject, approveAll, check, connectEngine, loginShell, materialize, ok, plan, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at34-')));
afterEach(() => cleanup());

describe('AT-34 (engine): side effects and readiness', () => {
  it('a readiness gap for .nvmrc, the side effects with the tracked file highlighted, and a state changed during the run', async () => {
    const project = materialize('FX-NOISY', 'good', join(root, 'fx'));
    // FX-NOISY's «prepare»: the copy is a Git repository, so data/runs.json is tracked.
    for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=fx', '-c', 'user.email=fx@ayar.local', 'commit', '-q', '-m', 'base']]) execFileSync('git', args, { cwd: project });
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const { projectId, profile } = await addProject(engine, project);
      // The composite script is in the approval literally.
      const unitSpec = profile.checks.find((c) => c.instance === 'beh.unit@.')!;
      expect(unitSpec.command?.script).toMatchObject({ name: 'test', composite: true, text: 'node scripts/prepare.mjs && node --test --test-reporter=spec' });
      expect(profile.pending.items.find((i) => i.instance === 'beh.unit@.')?.fields).toContainEqual(expect.objectContaining({ field: 'command.script.text', after: 'node scripts/prepare.mjs && node --test --test-reporter=spec' }));
      // The outputs the project declares (FR-36): written during a check, apart from the rest.
      ok(await engine.invoke('profile.update', { projectId, patch: { references: { outputs: ['.cache', 'reports'] }, custom: { wait: { argv: ['node', '-e', 'setTimeout(() => {}, 4000)'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
      await approveAll(engine, projectId);

      // .nvmrc asks for 22.11.0, which is not installed: «يحتاج تجهيزًا» before anything starts, never installed.
      const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
      const unit = readiness.items.find((i) => i.instance === 'beh.unit@.')!;
      expect(unit).toMatchObject({ readiness: 'needs_setup' });
      expect(unit.reasons[0]).toMatchObject({ key: 'setup.reason.runtimeMismatch', params: { tool: 'node', required: '22.11.0', from: 'nvmrc' } });
      const before = await plan(engine, projectId, { kind: 'check', instance: 'beh.unit@.' });
      expect(before.items.find((i) => i.instance === 'beh.unit@.')).toMatchObject({ status: 'missing', readiness: 'needs_setup' });
      // G-25: accepted once, by an explicit action; then it runs, and readiness says why.
      const accept = readiness.actions.find((a) => a.kind === 'accept_tool_version')!;
      const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: accept.id }));
      const g = confirmationGrant('setup.execute', accept.id, preview.digest);
      const done = ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId: accept.id, confirmationToken: g.token }, g.grants));
      const after = done.readiness.find((r) => r.instance === 'beh.unit@.');
      expect(after?.readiness).toBe('ready');
      expect(after?.reasons.map((r) => r.key)).toContain('setup.reason.versionAccepted');

      // The side effects of beh.unit: two new files under the declared outputs, the tracked data/runs.json modified.
      const p = await plan(engine, projectId, { kind: 'check', instance: 'beh.unit@.' });
      const run = await waitRun(engine, (await startRun(engine, p.id)).runId);
      const c = check(run, 'beh.unit@.');
      expect(c.raw).toMatchObject({ ended: 'exited', exitCode: 0 });
      expect(c.raw?.sideEffects).toMatchObject({
        created: ['.cache/last-run.json', 'reports/summary.txt'],
        modified: ['data/runs.json'],
        deleted: [],
        trackedModified: ['data/runs.json'],
        declared: ['.cache/last-run.json', 'reports/summary.txt'],
      });
      expect(c.evidence.some((x) => x.kind === 'side_effects')).toBe(true);
      // The tracked file changed outside the declared outputs: the run's state changed (9.9).
      expect(run.run.stateChanged).toBe(true);
      expect(run.stateChange?.trackedModified).toEqual(['data/runs.json']);

      // A source file edited while a run is on: «تغيرت الحالة أثناء الفحص».
      const p2: RunPlan = await plan(engine, projectId, { kind: 'check', instance: 'custom.wait@.' });
      const r2 = await startRun(engine, p2.id);
      await engine.waitForEvent('check.state', (e) => e.payload.runId === r2.runId && e.payload.state === 'running', 20_000);
      appendFileSync(join(project, 'src/counter.js'), '\n// edited during the run\n');
      const d2 = await waitRun(engine, r2.runId);
      expect(d2.run.stateChanged).toBe(true);
      expect(d2.stateChange?.modified).toEqual(['src/counter.js']);
      expect(d2.stateChange?.trackedModified).toEqual(['src/counter.js']);
      // Never AYAR's doing: nothing was written into the project by the engine itself.
      expect(readFileSync(join(project, '.nvmrc'), 'utf8').trim()).toBe('22.11.0');
      const prof = ok<ProfileView>(await engine.invoke('profile.get', { projectId }));
      expect(prof.references.outputs).toEqual(['.cache', 'reports']);
    } finally {
      await engine.close();
    }
  }, 120_000);
});
