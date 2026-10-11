// C-15 buildInvocation at the launch (executor/template.ts), what C-12 prepares for a template (executor/prepare.ts),
// and how the steps of one execution become one result (run.ts aggregate): the placeholders are AYAR's folders only,
// `{targets}` becomes absolute files in batches of at most the template's bytes (E-10), a repeated template runs its
// attempts as steps, the shadow repository of E-24 is built from the project's git files without its configuration,
// hooks or attributes, and the stand-in git records and fails.
import type { InvocationTemplate } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCatalog } from '@ayar/catalog';
import { aggregate } from '../src/executor/run.ts';
import { buildShadow, NOGIT_LOG, prepare } from '../src/executor/prepare.ts';
import type { ProcessResult } from '../src/executor/process.ts';
import { batches, expandTemplate } from '../src/executor/template.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { tempRoot } from './support/tmp.ts';

const T = (o: Partial<InvocationTemplate>): InvocationTemplate => ({ adapter: 'vitest', adapterVersion: '1.0.0', argv: ['x'], cwd: '{root}', env: {}, repeat: 1, prepare: [], targets: null, reports: [], stdoutReport: false, suggestion: null, ...o });
const ctx = { root: '/p', reportsDir: '/d/tmp/c/reports', tmpDir: '/d/tmp/c/tmp', tool: '/t/semgrep', path: '/usr/bin:/bin', osvDb: '/d/osv-db', inventory: ['src/a.js', 'src/b.ts', 'README.md', 'pkg/c.py', 'pkg/d.js'], component: '.' };

let dir: string;
let cleanup: () => void;
beforeEach(() => ({ dir, cleanup } = tempRoot('ayar-DEV-6-template-')));
afterEach(() => cleanup());

describe('the template at the launch (C-15)', () => {
  it('fills AYAR\'s placeholders, and a step\'s reports go to its own folder', () => {
    const x = expandTemplate(T({ argv: ['{tool}', '--json-output={reports}/s.json', '--config', '{tmp}/r.yml', '{root}/x', '{unknown}'], cwd: '{tmp}', env: { PATH: '{nogit}:{path}', DB: '{osvdb}', HOME: '{tmp}/home' } }), ctx);
    expect(x).toEqual({
      ok: true,
      steps: [{ n: 1, argv: ['/t/semgrep', '--json-output=/d/tmp/c/reports/1/s.json', '--config', '/d/tmp/c/tmp/r.yml', '/p/x', '{unknown}'], cwd: '/d/tmp/c/tmp', env: { PATH: '/d/tmp/c/tmp/nogit:/usr/bin:/bin', DB: '/d/osv-db', HOME: '/d/tmp/c/tmp/home' }, reportsDir: '/d/tmp/c/reports/1' }],
    });
  });

  it('runs a repeated template as its attempts, each a step with its own reports', () => {
    const x = expandTemplate(T({ argv: ['npm', 'test', '--', '--outputFile={reports}/v.json'], repeat: 3 }), ctx);
    expect(x.ok && x.steps.map((s) => [s.n, s.argv.at(-1)])).toEqual([
      [1, '--outputFile=/d/tmp/c/reports/1/v.json'],
      [2, '--outputFile=/d/tmp/c/reports/2/v.json'],
      [3, '--outputFile=/d/tmp/c/reports/3/v.json'],
    ]);
  });

  it('gives {targets} the inventory\'s files of the extensions, absolute, under the component, in batches (E-10)', () => {
    const x = expandTemplate(T({ argv: ['{tool}', '{targets}'], targets: { extensions: ['.js', '.py'], batchBytes: 4096 } }), ctx);
    expect(x.ok && x.steps[0]!.argv).toEqual(['/t/semgrep', '/p/pkg/c.py', '/p/pkg/d.js', '/p/src/a.js']);
    const sub = expandTemplate(T({ argv: ['{tool}', '{targets}'], targets: { extensions: ['.js'], batchBytes: 4096 } }), { ...ctx, component: 'pkg' });
    expect(sub.ok && sub.steps[0]!.argv).toEqual(['/t/semgrep', '/p/pkg/d.js']);
    // No file to read: «ناقص» with why, never an empty run that would pass.
    expect(expandTemplate(T({ argv: ['{tool}', '{targets}'], targets: { extensions: ['.rb'], batchBytes: 4096 } }), ctx)).toMatchObject({ ok: false, outcome: 'missing', reason: { key: 'adapter.reason.noTargets' } });
    // A tool the template needs and that is not there: «ناقص».
    expect(expandTemplate(T({ argv: ['{tool}'] }), { ...ctx, tool: null })).toMatchObject({ ok: false, outcome: 'missing' });
  });

  it('cuts the batches at the byte limit, a long path alone, none lost', () => {
    const paths = Array.from({ length: 50 }, (_, i) => `/p/${'x'.repeat(i % 7 === 0 ? 300 : 20)}${i}.js`);
    const b = batches(paths, 512);
    expect(b.flat()).toEqual(paths);
    for (const g of b) expect(g.length === 1 || g.reduce((n, p) => n + Buffer.byteLength(p) + 1, 0) <= 512).toBe(true);
  });

  it('runs a program of the project by its path from the command\'s folder', () => {
    const x = expandTemplate(T({ argv: ['.venv/bin/python', '-m', 'pytest'], cwd: '{root}/py' }), ctx);
    expect(x.ok && x.steps[0]).toMatchObject({ argv: ['/p/py/.venv/bin/python', '-m', 'pytest'], cwd: '/p/py' });
  });
});

describe('one execution of several steps (D-DEV6-05)', () => {
  const step = (o: Partial<ProcessResult>): ProcessResult => ({ ended: 'exited', exitCode: 0, signal: null, spawnError: null, pid: 1, startedAt: new Date(0), finishedAt: new Date(1000), durationMs: 1000, lastActivityAt: null, sleepGaps: [], resources: { samples: 1, peakRssKb: 10, maxCpuPercent: 5, lastCpuPercent: 1 }, leftovers: { groupKilled: 0, tokenKilled: 0, escapeSuspected: [] }, escalation: [], ...o });
  it('takes the first step that did not exit with 0, sums the time, keeps the peaks', () => {
    const r = aggregate([step({}), step({ exitCode: 1, resources: { samples: 2, peakRssKb: 30, maxCpuPercent: 50, lastCpuPercent: 3 } }), step({ exitCode: 0 })], null, new Date(0), new Date(5000));
    expect(r).toMatchObject({ ended: 'exited', exitCode: 1, durationMs: 3000, resources: { samples: 4, peakRssKb: 30, maxCpuPercent: 50 } });
  });
  it('a step ended by a timeout ends the execution as timed out; a cancel between steps as cancelled', () => {
    expect(aggregate([step({}), step({ ended: 'timed_out', exitCode: null, signal: 'SIGKILL' })], null, new Date(0), new Date(0)).ended).toBe('timed_out');
    expect(aggregate([step({})], 'cancelled', new Date(0), new Date(0)).ended).toBe('cancelled');
    expect(aggregate([], 'timed_out', new Date(0), new Date(0))).toMatchObject({ ended: 'timed_out', exitCode: null });
  });
});

describe('what a template asks AYAR to prepare (E-10, E-24)', () => {
  it('writes AYAR\'s Semgrep rules and a stand-in git that records and fails', async () => {
    const tmp = join(dir, 'tmp');
    mkdirSync(tmp);
    const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-11') });
    expect(await prepare({ fs: nodeFileSystem, catalog, template: T({ prepare: ['semgrep-rules', 'nogit'] }), tmpDir: tmp, root: dir })).toEqual({ ok: true });
    expect(readFileSync(join(tmp, 'ayar-rules.yml'), 'utf8')).toContain('ayar.js.eval-dynamic');
    expect(existsSync(join(tmp, 'home'))).toBe(true);
    let code = 0;
    try {
      execFileSync(join(tmp, 'nogit', 'git'), ['ls-remote', '--get-url'], { cwd: dir, stdio: 'pipe' });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code).toBe(1);
    expect(readFileSync(join(tmp, NOGIT_LOG), 'utf8')).toContain('args=ls-remote --get-url');
  });

  it('builds the shadow repository from the git files alone: no hooks, no configuration of the project, no attributes', async () => {
    const repo = join(dir, 'repo');
    mkdirSync(repo);
    for (const args of [['init', '-q'], ['-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '--allow-empty', '-m', 'x']]) execFileSync('git', args, { cwd: repo, env: { PATH: '/usr/bin:/bin', HOME: dir, GIT_CONFIG_NOSYSTEM: '1' } });
    writeFileSync(join(repo, '.git', 'config'), '[core]\n\tfsmonitor = touch /tmp/never\n');
    mkdirSync(join(repo, '.git', 'info'), { recursive: true });
    writeFileSync(join(repo, '.git', 'info', 'attributes'), '* diff=evil\n');
    writeFileSync(join(repo, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\ntouch /tmp/never\n');
    const dest = join(dir, 'shadow.git');
    expect(await buildShadow(nodeFileSystem, repo, dest)).toEqual({ ok: true });
    expect(readdirSync(dest).sort()).toEqual(['HEAD', 'config', 'objects', 'refs']);
    expect(readFileSync(join(dest, 'config'), 'utf8')).toBe('[core]\n\tbare = true\n\trepositoryformatversion = 0\n');
    expect(readFileSync(join(dest, 'objects', 'info', 'alternates'), 'utf8').trim()).toBe(join(repo, '.git', 'objects'));
    expect(readdirSync(join(dest, 'refs', 'heads')).length).toBe(1);
    // Not a repository: «ناقص».
    expect(await buildShadow(nodeFileSystem, join(dir, 'none'), join(dir, 's2'))).toMatchObject({ ok: false, reason: { key: 'adapter.reason.noGitRepository' } });
  });
});
