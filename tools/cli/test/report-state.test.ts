// AUD-04, AUD-05, AUD-06 and AUD-07 (the independent audit of 2026-10-12), through tools/cli and the engine's protocol:
// - AUD-07: a report, and the purity index, keep the Git head their run recorded when it started, whatever the project
//   becomes after (a new commit, a new discovery); a run that recorded none says so and borrows nothing;
// - AUD-05: a work tree with an uncommitted change is never called clean because the run changed nothing: Git's state
//   is unknown to AYAR (it never runs Git in a project), and the run's own stability is told apart;
// - AUD-06: the reproduction command of a finding runs the same file, in the same folder, and fails the same way;
// - AUD-04: an inventory that did not see part of the project (past the depth limit, unreadable) never proves the state
//   stable, while one that saw it all still detects the change; what is left out on purpose (.gitignore) is no gap.
// The projects are synthetic, in a temp folder. Their Git repositories are made here with no hooks, no global or system
// configuration and no signing, and Git runs in them only (never in a fixture, D-38).
import type { ReportBuilt, RunDetail, RunPlan } from '@ayar/protocol';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, approveAll, check, connectEngine, loginShell, ok, plan, rescan, startRun, tempDir, waitRun, type EngineConnection } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
/** A project folder with a space and Arabic letters in its name. */
const PROJECT = 'مشروع التدقيق project';
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-AUD-report-state-')));
afterEach(() => {
  // A folder this test made unreadable is opened again, so the temp folder can go.
  try {
    chmodSync(join(root, PROJECT, 'locked'), 0o700);
  } catch {
    /* none */
  }
  cleanup();
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgSign=false', '-c', 'user.name=AYAR Test', '-c', 'user.email=test@ayar.invalid', ...args], {
    cwd,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  });

interface Ctx {
  engine: EngineConnection;
  project: string;
  projectId: string;
  dataDir: string;
}

/** A small project, its engine, and the project added. */
async function withProject(body: (c: Ctx) => Promise<void>, prepare: (project: string) => void = () => {}): Promise<void> {
  const project = join(root, PROJECT);
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'aud-report-state', version: '1.0.0', type: 'module' }));
  writeFileSync(join(project, 'src', 'value.js'), 'export const value = 1;\n');
  prepare(project);
  const dataDir = join(root, 'AYAR');
  const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: '/opt/homebrew/bin:/usr/bin:/bin' }) } });
  try {
    await engine.waitForEvent('engine.health');
    const { projectId } = await addProject(engine, project);
    await body({ engine, project, projectId, dataDir });
  } finally {
    await engine.close();
  }
}

/** Custom checks defined, approved, and run together (one check: its own plan). */
async function runCustom(c: Ctx, custom: Record<string, { argv: string[]; cwd?: string }>, extra: string[] = []): Promise<RunDetail> {
  ok(await c.engine.invoke('profile.update', { projectId: c.projectId, patch: { custom: Object.fromEntries(Object.entries(custom).map(([n, x]) => [n, { argv: x.argv, cwd: x.cwd ?? '.', timeoutMin: 1, success: { exitCode: 0 } }])) } }));
  await approveAll(c.engine, c.projectId);
  const instances = [...Object.keys(custom).map((n) => `custom.${n}@.`), ...extra];
  const p: RunPlan = await plan(c.engine, c.projectId, instances.length === 1 ? { kind: 'check', instance: instances[0]! } : { kind: 'group', instances });
  return waitRun(c.engine, (await startRun(c.engine, p.id)).runId);
}

const build = async (c: Ctx, runId: string, lang: 'ar' | 'en' = 'en') => ok<ReportBuilt>(await c.engine.invoke('report.build', { target: { kind: 'run', runId }, options: { lang, scope: 'wholeRun' } }));
const stateLine = (b: ReportBuilt) => b.model.text.split('\n').find((l) => l.startsWith(b.lang === 'ar' ? '- الحالة المفحوصة' : '- Checked state'));

describe('AUD-07: a report names the Git head its run recorded', () => {
  it('a run on commit A keeps A after commit B and a new discovery, in both languages', async () => {
    await withProject(async (c) => {
      git(c.project, 'init', '--quiet', '--template=');
      git(c.project, 'add', '-A');
      git(c.project, 'commit', '--quiet', '-m', 'A');
      const a = git(c.project, 'rev-parse', 'HEAD').trim();
      await rescan(c.engine, c.projectId);
      const d = await runCustom(c, { pass: { argv: ['node', '-e', 'process.exit(0)'] } });
      expect(d.run.commit).toBe(a);
      expect((await build(c, d.run.runId)).report.head.state).toMatchObject({ commit: a, recorded: true });
      writeFileSync(join(c.project, 'src', 'value.js'), 'export const value = 2;\n');
      git(c.project, 'commit', '--quiet', '-am', 'B');
      const b = git(c.project, 'rev-parse', 'HEAD').trim();
      await rescan(c.engine, c.projectId);
      for (const lang of ['en', 'ar'] as const) {
        const again = await build(c, d.run.runId, lang);
        expect(again.report.head.state, lang).toMatchObject({ commit: a, recorded: true });
        expect(stateLine(again), lang).toContain(a.slice(0, 12));
        expect(again.model.text, lang).not.toContain(b.slice(0, 12));
      }
      expect(ok<RunDetail>(await c.engine.invoke('run.get', { runId: d.run.runId })).run.commit).toBe(a);
    });
  }, 60_000);

  it('the purity index of a round keeps the commit its base run recorded when it is computed again later', async () => {
    await withProject(async (c) => {
      git(c.project, 'init', '--quiet', '--template=');
      git(c.project, 'add', '-A');
      git(c.project, 'commit', '--quiet', '-m', 'A');
      const a = git(c.project, 'rev-parse', 'HEAD').trim();
      await rescan(c.engine, c.projectId);
      ok(await c.engine.invoke('profile.update', { projectId: c.projectId, patch: { custom: { pass: { argv: ['node', '-e', 'process.exit(0)'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
      await approveAll(c.engine, c.projectId);
      const p = await plan(c.engine, c.projectId, { kind: 'full' });
      const full = await waitRun(c.engine, (await startRun(c.engine, p.id)).runId, 300_000);
      expect(full.purity?.meta.commit).toBe(a);
      git(c.project, 'commit', '--quiet', '--allow-empty', '-m', 'B');
      await rescan(c.engine, c.projectId);
      // A review computes the round again (G-17), from its base run.
      const recorded = ok<{ check: { roundRecomputed: boolean } }>(await c.engine.invoke('review.record', { target: { type: 'check', id: check(full, 'custom.pass@.').checkRunId }, decision: 'accept', note: 'AUD-07: the round computed again after a later commit' }));
      expect(recorded.check.roundRecomputed).toBe(true);
      expect(ok<RunDetail>(await c.engine.invoke('run.get', { runId: full.run.runId })).purity?.meta.commit).toBe(a);
    });
  }, 360_000);

  it('a run that recorded no head (an older one) says so, and borrows none; outside a repository, none is recorded as such', async () => {
    await withProject(async (c) => {
      const d = await runCustom(c, { pass: { argv: ['node', '-e', 'process.exit(0)'] } });
      // Outside a repository: the run recorded that it is not one.
      expect((await build(c, d.run.runId)).report.head.state).toMatchObject({ branch: null, commit: null, recorded: true });
      git(c.project, 'init', '--quiet', '--template=');
      git(c.project, 'add', '-A');
      git(c.project, 'commit', '--quiet', '-m', 'later');
      await rescan(c.engine, c.projectId);
      // An older run's row, as before AUD-07: no head recorded.
      const db = new DatabaseSync(join(c.dataDir, 'ayar.db'));
      try {
        db.prepare('UPDATE runs SET git_json = NULL WHERE id = ?').run(d.run.runId);
      } finally {
        db.close();
      }
      for (const lang of ['en', 'ar'] as const) {
        const b = await build(c, d.run.runId, lang);
        expect(b.report.head.state, lang).toMatchObject({ branch: null, commit: null, recorded: false });
        expect(stateLine(b), lang).toContain(lang === 'ar' ? 'لم يسجّل هذا التشغيل فرعه ولا التزامه' : 'this run did not record its branch or commit');
      }
    });
  }, 60_000);
});

describe('AUD-05: a modified work tree is never called clean', () => {
  it('an uncommitted change before the run: Git state unknown, the run unchanged; a change during the run is told apart', async () => {
    await withProject(async (c) => {
      git(c.project, 'init', '--quiet', '--template=');
      git(c.project, 'add', '-A');
      git(c.project, 'commit', '--quiet', '-m', 'base');
      writeFileSync(join(c.project, 'src', 'value.js'), 'export const value = 999;\n');
      expect(git(c.project, 'status', '--porcelain', '--untracked-files=no')).toContain('M src/value.js');
      await rescan(c.engine, c.projectId);
      const d = await runCustom(c, { pass: { argv: ['node', '-e', 'process.exit(0)'] } });
      for (const lang of ['en', 'ar'] as const) {
        const b = await build(c, d.run.runId, lang);
        expect(b.report.head.state, lang).toMatchObject({ dirty: null, changedDuringRun: false });
        expect(stateLine(b), lang).toContain(lang === 'ar' ? 'تغييرات غير ملتزمة: غير معروف' : 'uncommitted changes: unknown');
        expect(stateLine(b), lang).toContain(lang === 'ar' ? 'تغيّر المصدر أثناء الفحص: لا' : 'source changed during the scan: no');
      }
      const changing = await runCustom(c, { touch: { argv: ['node', '-e', "require('fs').appendFileSync('src/value.js','// during\\n')"] } });
      const b = await build(c, changing.run.runId);
      expect(b.report.head.state).toMatchObject({ dirty: null, changedDuringRun: true });
      expect(stateLine(b)).toContain('source changed during the scan: yes');
    });
  }, 60_000);
});

describe('AUD-06: the reproduction command runs the same file, in the same folder', () => {
  it('a file name with a space, Arabic letters and quotes, in a folder with a space: the copied command fails as the check did', async () => {
    await withProject(async (c) => {
      const dir = join(c.project, 'أدوات الفحص');
      mkdirSync(dir);
      for (const name of ['إثبات الفشل.mjs', `it's "quoted".mjs`]) writeFileSync(join(dir, name), "console.error('expected failure');process.exitCode=7;\n");
      const d = await runCustom(c, { spaced: { argv: ['node', 'إثبات الفشل.mjs'], cwd: 'أدوات الفحص' }, quoted: { argv: ['node', `it's "quoted".mjs`], cwd: 'أدوات الفحص' } });
      for (const name of ['spaced', 'quoted']) expect(check(d, `custom.${name}@.`).raw?.exitCode, name).toBe(7);
      for (const lang of ['en', 'ar'] as const) {
        const b = await build(c, d.run.runId, lang);
        const commands = b.report.findings.map((f) => f.reproduce.command);
        expect(commands.length, lang).toBe(2);
        for (const command of commands) {
          expect(command, lang).toMatch(/^cd 'أدوات الفحص' && node '/);
          expect(b.model.text, lang).toContain(command!);
          // Run only this fixture's own command, from the project's root, as the report says to.
          for (const shell of ['/bin/sh', '/bin/zsh']) {
            const r = spawnSync(shell, ['-c', command!], { cwd: c.project, encoding: 'utf8', env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, timeout: 10_000 });
            expect({ status: r.status, stderr: r.stderr.trim() }, `${shell}: ${command}`).toEqual({ status: 7, stderr: 'expected failure' });
          }
        }
      }
    });
  }, 60_000);
});

describe('AUD-04: an incomplete inventory never proves the state stable', () => {
  const deep = (project: string) => {
    mkdirSync(join(project, 'deep', 'nested'), { recursive: true });
    writeFileSync(join(project, 'deep', 'nested', 'value.js'), 'export const value = 1;\n');
  };
  const mutate = { argv: ['node', '-e', "require('fs').writeFileSync('deep/nested/value.js','export const value = 2;\\n')"] };
  const noop = { argv: ['node', '-e', 'process.exit(0)'] };

  it('past the depth limit: a change it could not see leaves integ.state «تعذّر», naming what was not observed, and the run unknown', async () => {
    await withProject(async (c) => {
      ok(await c.engine.invoke('settings.set', { key: 'discovery.maxDepth', value: 1 }));
      for (const [name, x] of [['mutate', mutate], ['noop', noop]] as const) {
        const d = await runCustom(c, { [name]: x }, ['integ.state@.']);
        expect(check(d, 'integ.state@.'), name).toMatchObject({ outcome: 'unavailable', outcomeReason: { key: 'integrity.reason.stateUnverified', params: { depth: 1, unreadable: 0, truncated: 'no' } } });
        expect(d.run.stateChanged, name).toBe(false);
        const b = await build(c, d.run.runId, 'ar');
        expect(b.report.head.state.changedDuringRun, name).toBeNull();
        expect(b.report.integrity.checks.find((x) => x.checkId === 'integ.state'), name).toMatchObject({ outcome: 'unavailable' });
        expect(b.human.text, name).toContain('الجرد ناقص فلا يُثبت ثبات الحالة');
      }
      expect(readFileSync(join(c.project, 'deep', 'nested', 'value.js'), 'utf8')).toContain('value = 2');
    }, deep);
  }, 60_000);

  it('a whole inventory detects the same change, and passes when nothing changed; a folder left out on purpose is no gap', async () => {
    await withProject(async (c) => {
      ok(await c.engine.invoke('settings.set', { key: 'discovery.maxDepth', value: 64 }));
      const changed = await runCustom(c, { mutate }, ['integ.state@.']);
      expect(check(changed, 'integ.state@.')).toMatchObject({ outcome: 'needs_review', outcomeReason: { key: 'integrity.reason.stateChanged' } });
      expect(changed.run.stateChanged).toBe(true);
      const stable = await runCustom(c, { noop }, ['integ.state@.']);
      expect(check(stable, 'integ.state@.')).toMatchObject({ outcome: 'passed', outcomeReason: { key: 'integrity.reason.stateStable' } });
      expect((await build(c, stable.run.runId)).report.head.state.changedDuringRun).toBe(false);
      // .gitignore leaves deep/ out on purpose: with the depth limit at 1 again, nothing is missing that was wanted.
      writeFileSync(join(c.project, '.gitignore'), 'deep/\n');
      ok(await c.engine.invoke('settings.set', { key: 'discovery.maxDepth', value: 1 }));
      const ignored = await runCustom(c, { noop }, ['integ.state@.']);
      expect(check(ignored, 'integ.state@.')).toMatchObject({ outcome: 'passed' });
    }, deep);
  }, 60_000);

  it.runIf(process.getuid?.() !== 0)('an unreadable folder is a gap too, and the verdict of a full scan is never «نقي» through it', async () => {
    await withProject(
      async (c) => {
        chmodSync(join(c.project, 'locked'), 0o000);
        const d = await runCustom(c, { noop }, ['integ.state@.']);
        expect(check(d, 'integ.state@.')).toMatchObject({ outcome: 'unavailable', outcomeReason: { key: 'integrity.reason.stateUnverified', params: { depth: 0, unreadable: 1 } } });
        ok(await c.engine.invoke('profile.update', { projectId: c.projectId, patch: { custom: { noop: { ...noop, cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
        await approveAll(c.engine, c.projectId);
        const p = await plan(c.engine, c.projectId, { kind: 'full' });
        const full = await waitRun(c.engine, (await startRun(c.engine, p.id)).runId, 300_000);
        expect(check(full, 'integ.state@.')).toMatchObject({ outcome: 'unavailable' });
        expect(full.purity?.verdict).not.toBe('pure');
        expect(full.purity?.incompleteReasons).toContainEqual({ key: 'purity.reason.integrityCheck', params: { check: 'integ.state', outcome: 'unavailable' } });
      },
      (project) => {
        mkdirSync(join(project, 'locked'));
        writeFileSync(join(project, 'locked', 'value.js'), 'export const value = 1;\n');
      },
    );
  }, 360_000);
});
