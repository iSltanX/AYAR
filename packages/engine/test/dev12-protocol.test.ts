// Protocol 1.7 (DEV-12, D-DEV12-01): what the remaining screens read from the engine. check.report — a check
// execution's unified report without its findings, and the declared outputs it wrote with their sizes now and at the
// end of the previous complete round; profile.versions — the saved versions and what each changed; reports.copies —
// «انسخ للنموذج» counted from the audit records; data.purge — everything AYAR keeps about the projects and what it
// fetched, the settings kept; the narrow-scope threshold as a setting; and the safe stop when the disk runs low (13.5).
import type { CheckReport, ProfileVersion, ReportBuilt, RunDetail } from '@ayar/protocol';
import { GLOBAL_TARGET } from '@ayar/protocol';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmationGrant } from '../../../tools/cli/src/grants.ts';
import { addProject, approveAll, plan, rescan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, LOGIN_PATH, ok, tempDir, type EngineConnection } from './support/scan.ts';

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
let projectId: string;
let path: string;

/** A project with a custom «build» that writes declared outputs, and a local reference the refs analyzer reads. */
function makeProject(dir: string): string {
  const p = join(dir, 'project');
  mkdirSync(join(p, 'docs'), { recursive: true });
  writeFileSync(join(p, 'README.md'), '# A project\n\nSee [setup](docs/setup.md) and [gone](docs/gone.md).\n');
  writeFileSync(join(p, 'docs', 'setup.md'), 'setup\n');
  return p;
}

const BUILD = (bytes: number) => ({ argv: ['sh', '-c', `mkdir -p dist && head -c ${bytes} /dev/zero > dist/app.js && echo built`], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } });

async function runCheck(instance: string): Promise<RunDetail> {
  const p = await plan(engine, projectId, { kind: 'check', instance });
  return waitRun(engine, (await startRun(engine, p.id)).runId);
}

beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-12-proto-'));
  engine = await engineFor(root, { path: LOGIN_PATH });
  path = makeProject(root);
  ({ projectId } = await addProject(engine, path));
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

describe('profile.versions', () => {
  it('lists the versions newest first, with what each added, changed and removed, and what was approved in it', async () => {
    ok(await engine.invoke('profile.update', { projectId, patch: { references: { outputs: ['dist'] }, custom: { build: BUILD(1000) } } }));
    await approveAll(engine, projectId);
    const { versions } = ok<{ versions: ProfileVersion[] }>(await engine.invoke('profile.versions', { projectId }));
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions.map((v) => v.version)).toEqual([...versions.map((v) => v.version)].sort((a, b) => b - a));
    const latest = versions[0]!;
    expect(latest.changes.added).toContain('custom.build@.');
    expect(latest.approved).toContain('custom.build@.');
    // The first version added every instance it has; nothing was removed from nothing.
    const first = versions.at(-1)!;
    expect(first.changes.removed).toEqual([]);
    expect(first.changes.added.length).toBeGreaterThan(0);
    expect((await engine.invoke('profile.versions', { projectId: 'prj_missing' })).ok).toBe(false);
  });
});

describe('check.report', () => {
  it('returns an analyzer’s report without its findings, and null for an unknown kind of evidence', async () => {
    const d = await runCheck('code.refs.local@.');
    const c = d.checks.find((x) => x.instance === 'code.refs.local@.')!;
    const report = ok<CheckReport | null>(await engine.invoke('check.report', { checkRunId: c.checkRunId }));
    expect(report).not.toBeNull();
    expect(report!.findingsCount).toBeGreaterThanOrEqual(1);
    expect(report).not.toHaveProperty('findings');
    expect(typeof report!.info.files).toBe('number');
    expect(report!.outputs).toEqual([]);
    expect((await engine.invoke('check.report', { checkRunId: 'chk_missing' })).ok).toBe(false);
  });

  it('sizes the declared outputs a check wrote, at the end of its run and of the previous complete round', async () => {
    // A complete round with a 1000-byte output, then a check run with a 3000-byte one.
    const fullPlan = await plan(engine, projectId, { kind: 'full' });
    await waitRun(engine, (await startRun(engine, fullPlan.id)).runId, 120_000);
    ok(await engine.invoke('profile.update', { projectId, patch: { custom: { build: BUILD(3000) } } }));
    await approveAll(engine, projectId);
    const d = await runCheck('custom.build@.');
    const c = d.checks.find((x) => x.instance === 'custom.build@.')!;
    const report = ok<CheckReport | null>(await engine.invoke('check.report', { checkRunId: c.checkRunId }));
    expect(report?.outputs).toEqual([{ path: 'dist/app.js', sizeBytes: 3000, previousBytes: 1000 }]);
  }, 180_000);
});

describe('check.report on a build', () => {
  it('keeps the files of the ignored output folder with their sizes, against the previous complete round', async () => {
    const { dir, cleanup: done } = tempDir('ayar-DEV-12-build-');
    const e = await engineFor(dir, { path: LOGIN_PATH });
    try {
      const p = join(dir, 'app');
      mkdirSync(p);
      const pkg = (bytes: number) => JSON.stringify({ name: 'app', version: '1.0.0', private: true, scripts: { build: `mkdir -p dist && head -c ${bytes} /dev/zero > dist/app.js` } });
      writeFileSync(join(p, 'package.json'), pkg(1000));
      writeFileSync(join(p, '.gitignore'), 'dist/\n');
      const { projectId: id } = await addProject(e, p);
      ok(await e.invoke('profile.update', { projectId: id, patch: { references: { outputs: ['dist'] } } }));
      await approveAll(e, id);
      const round = await plan(e, id, { kind: 'full' });
      const first = await waitRun(e, (await startRun(e, round.id)).runId, 120_000);
      expect(first.checks.find((c) => c.checkId === 'code.build')?.outcome).toBe('passed');
      writeFileSync(join(p, 'package.json'), pkg(2500));
      await rescan(e, id);
      await approveAll(e, id);
      const again = await plan(e, id, { kind: 'check', instance: 'code.build@.' });
      const d = await waitRun(e, (await startRun(e, again.id)).runId, 120_000);
      const c = d.checks.find((x) => x.instance === 'code.build@.')!;
      const report = ok<CheckReport | null>(await e.invoke('check.report', { checkRunId: c.checkRunId }));
      expect(report?.outputs).toEqual([{ path: 'dist/app.js', sizeBytes: 2500, previousBytes: 1000 }]);
    } finally {
      await e.close();
      done();
    }
  }, 300_000);
});

describe('the human accessibility review, item by item (10.3)', () => {
  it('stays «يحتاج مراجعة» until all four items are decided, then passes, and a rejected item fails it', async () => {
    const { dir, cleanup: done } = tempDir('ayar-DEV-12-review-');
    const e = await engineFor(dir, { path: LOGIN_PATH });
    try {
      const p = join(dir, 'site');
      mkdirSync(p);
      writeFileSync(join(p, 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>موقع</title></head><body><main><h1>مرحبًا</h1><button>ابدأ</button></main></body></html>\n');
      const { projectId: id } = await addProject(e, p);
      const prof = await approveAll(e, id);
      const spec = prof.checks.find((c) => c.checkId === 'design.a11y.review');
      expect(spec?.applicable).toBe(true);
      const runReview = async () => {
        const pl = await plan(e, id, { kind: 'check', instance: spec!.instance });
        const d = await waitRun(e, (await startRun(e, pl.id)).runId);
        return d.checks.find((c) => c.instance === spec!.instance)!;
      };
      const first = await runReview();
      expect(first.outcome).toBe('needs_review');
      const record = (item: string, decision: string) => e.invoke('review.record', { target: { type: 'check', id: first.checkRunId, item }, decision, note: '' });
      for (const item of ['keyboard', 'screenReader', 'zoom']) {
        const r = ok<{ check: { outcome: string | null } }>(await record(item, 'accept'));
        expect(r.check.outcome).toBe('needs_review');
      }
      const last = ok<{ check: { outcome: string | null }; review: { target: { item?: string } } }>(await record('colorIndependence', 'accept'));
      expect([last.check.outcome, last.review.target.item]).toEqual(['passed', 'colorIndependence']);
      expect((await runReview()).outcome).toBe('passed');
      ok(await record('zoom', 'reject'));
      const again = await runReview();
      // A rejected item is never a pass: the next run reads «يحتاج مراجعة» with why (DEV-7's rule for a decision).
      expect(again.outcome).toBe('needs_review');
      const listed = ok<{ reviews: { target: { item?: string } }[] }>(await e.invoke('reviews.list', { projectId: id }));
      expect(listed.reviews.filter((r) => r.target.item).length).toBe(5);
    } finally {
      await e.close();
      done();
    }
  }, 300_000);
});

describe('reports.copies', () => {
  it('counts «انسخ للنموذج» of the project from the audit records', async () => {
    expect(ok<{ count: number }>(await engine.invoke('reports.copies', { projectId, days: 30 })).count).toBe(0);
    const runs = ok<{ runs: { runId: string; state: string }[] }>(await engine.invoke('runs.list', { projectId })).runs;
    const built = ok<ReportBuilt>(await engine.invoke('report.build', { target: { kind: 'run', runId: runs[0]!.runId }, options: { lang: 'ar' } }));
    ok(await engine.invoke('internal.recordCopy', { kind: 'report', id: built.reportId, chars: 10 }));
    expect(ok<{ count: number }>(await engine.invoke('reports.copies', { projectId, days: 30 })).count).toBe(1);
  });
});

describe('the narrow-scope threshold setting', () => {
  it('is read by the index: below it the karat carries «نطاق ضيق»', async () => {
    ok(await engine.invoke('settings.set', { key: 'purity.narrowThreshold', value: 10 }));
    const p = await plan(engine, projectId, { kind: 'full' });
    const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 120_000);
    if (d.purity && d.purity.criteriaCount > 0) expect([d.purity.narrow, d.purity.narrowThreshold]).toEqual([true, 10]);
    ok(await engine.invoke('settings.set', { key: 'purity.narrowThreshold', value: 3 }));
  }, 180_000);
});

describe('data.purge', () => {
  it('needs its confirmation, then removes the projects and what AYAR fetched, and keeps the settings', async () => {
    expect((await engine.invoke('data.purge', { confirmationToken: confirmationGrant('data.purge', GLOBAL_TARGET).token })).ok).toBe(false);
    ok(await engine.invoke('settings.set', { key: 'run.parallel', value: 3 }));
    const g = confirmationGrant('data.purge', GLOBAL_TARGET);
    ok(await engine.invoke('data.purge', { confirmationToken: g.token }, g.grants));
    expect(ok<{ projects: unknown[] }>(await engine.invoke('project.list', {})).projects).toEqual([]);
    expect(readdirSync(join(root, 'AYAR', 'evidence'))).toEqual([]);
    expect(readdirSync(join(root, 'AYAR', 'backups'))).toEqual([]);
    expect(ok<{ values: Record<string, unknown> }>(await engine.invoke('settings.get', { keys: ['run.parallel'] })).values['run.parallel']).toBe(3);
    // The repository itself is never touched.
    expect(existsSync(join(path, 'README.md'))).toBe(true);
  });
});

describe('the safe stop when the disk runs low (13.5)', () => {
  it('starts no further check, ends the rest «أُلغي» with why, and records disk_full on the run', async () => {
    const { dir, cleanup: done } = tempDir('ayar-DEV-12-disk-');
    const low = await engineFor(dir, { path: LOGIN_PATH, env: { AYAR_TEST_FREE_BYTES: String(10 * 1000 * 1000) } });
    try {
      const { projectId: id } = await addProject(low, makeProject(dir));
      ok(await low.invoke('profile.update', { projectId: id, patch: { custom: { build: BUILD(10) } } }));
      await approveAll(low, id);
      const p = await plan(low, id, { kind: 'full' });
      const d = await waitRun(low, (await startRun(low, p.id)).runId, 60_000);
      expect(d.run.cancelReason).toBe('disk_full');
      const ran = d.checks.filter((c) => c.outcome === 'cancelled');
      expect(ran.length).toBeGreaterThan(0);
      expect(ran.every((c) => c.outcomeReason?.key === 'run.reason.diskFull')).toBe(true);
    } finally {
      await low.close();
      done();
    }
  }, 90_000);
});
