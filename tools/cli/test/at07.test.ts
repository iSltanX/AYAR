// AT-07 (FR-19, FR-20, D-24, D-45), through tools/cli: the full scan's plan. «يشمل» removes the duplicate — with
// beh.stability included, beh.unit is «مشمول بـ beh.stability», inherits its execution, and the tests do not run
// a second time; a dependency is added with a note; special resources and needs are tagged before anything runs;
// an optional check is «غير مضمّن بقرار الملف», a conditional one shows what it lacks; excluding a required check is
// refused with a reason; and FX-MONO's packages are components with their own instances.
import type { RunDetail, RunPlan } from '@ayar/protocol';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, approveAll, check, connectEngine, loginShell, materialize, ok, plan, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at07-')));
afterEach(() => cleanup());

const item = (p: RunPlan, instance: string) => p.items.find((i) => i.instance === instance);

describe('AT-07: composing the full scan without duplicates', () => {
  it('FX-EXT and FX-MONO: optional, conditional, dependencies, tags, components, and the required check kept', async () => {
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    try {
      await engine.waitForEvent('engine.health');
      const ext = await addProject(engine, materialize('FX-EXT', 'good', join(root, 'ext')));
      const full = await plan(engine, ext.projectId, { kind: 'full' });
      // Never twice: each instance once in the plan, and in the order at most once.
      expect(new Set(full.items.map((i) => i.instance)).size).toBe(full.items.length);
      expect(new Set(full.order).size).toBe(full.order.length);
      // The optional check is out «by the profile», with the reason; a conditional one says what it lacks.
      expect(item(full, 'beh.stability@.')?.status).toBe('not_included');
      expect(item(full, 'beh.stability@.')?.reasons).toContainEqual({ key: 'plan.reason.notIncludedByProfile' });
      expect(item(full, 'design.tokens.static@.')?.status).toBe('not_included');
      expect(item(full, 'design.tokens.static@.')?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'profile.reason.conditionUnmet', refs: ['profile.ref.tokens'] })]));
      expect(full.willNotRun.map((w) => w.instance)).toEqual(expect.arrayContaining(['beh.stability@.', 'design.tokens.static@.']));
      // Tags before the start: the extension host needs the browser, alone (heavy), after the build it depends on.
      expect(item(full, 'beh.ext.host@.')).toMatchObject({ dependsOn: ['code.build@.'], locks: ['browser', 'heavy'], needs: { dataAsset: 'browser' } });
      expect(full.order.indexOf('code.build@.')).toBeLessThan(full.order.indexOf('beh.ext.host@.'));
      // A dependency is added, with its note, when only the dependant is chosen.
      const host = await plan(engine, ext.projectId, { kind: 'check', instance: 'beh.ext.host@.' });
      expect(item(host, 'code.build@.')).toMatchObject({ origin: 'dependency', addedFor: ['beh.ext.host@.'] });
      expect(item(host, 'code.build@.')?.reasons).toContainEqual({ key: 'plan.reason.addedAsDependency', params: { for: 'beh.ext.host@.' } });
      // Excluding a required check is refused, with the instance named.
      expect(await engine.invoke('run.plan', { projectId: ext.projectId, selection: { kind: 'fullExcluding', exclude: ['beh.unit@.'] } })).toMatchObject({ ok: false, error: { code: 'plan_invalid', details: { reason: 'required_excluded', instance: 'beh.unit@.' } } });
      // An optional check excluded is fine.
      expect((await plan(engine, ext.projectId, { kind: 'fullExcluding', exclude: ['beh.stability@.'] })).items.some((i) => i.instance === 'beh.stability@.')).toBe(false);
      // beh.stability included but not ready (not approved, dependencies not installed): it covers nothing (9.4
      // point 5, ORG-15 K1), and beh.unit gives its own reason. Both ready, beh.unit is covered: the next test.
      ok(await engine.invoke('profile.update', { projectId: ext.projectId, patch: { checks: { 'beh.stability@.': { included: true } } } }));
      const withStability = await plan(engine, ext.projectId, { kind: 'full' });
      expect(item(withStability, 'beh.stability@.')?.status).toBe('missing');
      expect(item(withStability, 'beh.unit@.')).toMatchObject({ status: 'missing', coveredBy: null });
      expect(item(withStability, 'beh.unit@.')?.reasons.some((r) => r.key === 'plan.reason.coveredBy')).toBe(false);

      // FX-MONO: the packages are components, each with its own instances.
      const mono = await addProject(engine, materialize('FX-MONO', 'good', join(root, 'mono')));
      const monoPlan = await plan(engine, mono.projectId, { kind: 'full' });
      for (const c of ['packages/core', 'packages/web']) expect(item(monoPlan, `beh.unit@${c}`)?.component).toBe(c);
      expect(new Set(monoPlan.items.map((i) => i.component))).toEqual(new Set(['.', 'packages/core', 'packages/web']));
    } finally {
      await engine.close();
    }
  }, 120_000);

  it('the covered check inherits the covering execution: one process, the same raw result, linked', async () => {
    const dataDir = join(root, 'AYAR');
    const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
    let runId: string;
    try {
      await engine.waitForEvent('engine.health');
      const { projectId } = await addProject(engine, materialize('FX-PROC', 'good', join(root, 'proc')));
      ok(await engine.invoke('profile.update', { projectId, patch: { checks: { 'beh.stability@.': { included: true } } } }));
      await approveAll(engine, projectId);
      const p = await plan(engine, projectId, { kind: 'group', instances: ['beh.unit@.', 'beh.stability@.'] });
      expect(item(p, 'beh.unit@.')?.status).toBe('covered');
      runId = (await startRun(engine, p.id)).runId;
      const d: RunDetail = await waitRun(engine, runId);
      const stability = check(d, 'beh.stability@.');
      const unit = check(d, 'beh.unit@.');
      expect(stability.raw).toMatchObject({ ended: 'exited', exitCode: 0 });
      expect(unit).toMatchObject({ state: 'finished', coveredByCheckRunId: stability.checkRunId });
      expect(unit.raw).toMatchObject({ sharedFrom: stability.checkRunId, exitCode: 0, checkRunId: unit.checkRunId });
      expect(unit.evidence).toEqual([]);
    } finally {
      await engine.close();
    }
    // Only one process was launched for the two (the ledger names each launch).
    const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
    try {
      expect((db.prepare("SELECT count(*) AS n FROM process_ledger WHERE kind = 'check' AND run_id = ?").get(runId) as { n: number }).n).toBe(1);
    } finally {
      db.close();
    }
  }, 120_000);
});
