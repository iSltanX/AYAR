#!/usr/bin/env node
// E-19 (plan 22): the storage budget and retention, after the build. Full scans with captures of the fixture
// projects through the engine, each profiled as its owner would (FX-WEB-DESIGN: the preview as a service, the
// states file and the matrix of two sizes, two themes and two languages, so the design section captures 32
// screenshots a scan; FX-EXT: the extension loaded in the probe's browser, with its reports), the evidence each run
// leaves on disk (the evidence files, the snapshots, the baselines, the database), and the per-run average, so the
// retention default (evidence.retainRuns) keeps the data folder within a declared target.
//
//   node tools/perf/storage.ts --out docs/acceptance/perf/e19-storage.json [--runs 3]
//
// Everything lives in a temporary folder (ayar-DEV-13-e19-*) removed at the end.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { connectEngine } from '@ayar/cli';
import { addProject, approveAll, loginShell, materialize, ok, plan, startRun, waitRun } from '../cli/test/support/fixtures.ts';
import { DESIGN_RENDER, installTestBrowser, probeBrowserReady, webDesignPatch } from '../../packages/engine/test/support/probe.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOOLCHAIN = join(homedir(), '.cache/ayar-fixtures-toolchain');
const NVM_NODE = join(homedir(), '.nvm/versions/node/v24.16.0/bin');
const PNPM = join(NVM_NODE, 'pnpm');
const LOGIN_PATH = [NVM_NODE, join(TOOLCHAIN, 'bin'), join(TOOLCHAIN, 'py/bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const out = opt('out', 'docs/acceptance/perf/e19-storage.json');
const runs = Number(opt('runs', '3'));
const projects = opt('projects', 'FX-WEB-DESIGN:good,FX-EXT:good').split(',').map((s) => s.split(':') as [string, string]);

function installDependencies(root: string): void {
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    if (existsSync(join(dir, 'pnpm-lock.yaml')) && !existsSync(join(dir, 'node_modules'))) execFileSync(PNPM, ['install', '--frozen-lockfile', '--offline', '--ignore-scripts', '--reporter=silent'], { cwd: dir, env: { PATH: LOGIN_PATH, HOME: homedir() }, stdio: 'pipe' });
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
}
/** Bytes under a folder (files only, links not followed), or of a file. */
function du(dir: string): number {
  if (!existsSync(dir)) return 0;
  if (!statSync(dir).isDirectory()) return statSync(dir).size;
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) total += du(p);
    else total += statSync(p).size;
  }
  return total;
}
const mb = (b: number) => Math.round((b / 2 ** 20) * 100) / 100;
/** The data folder by what grows with runs: the evidence files (reports and captures), the snapshots, the baselines, and the database after its write-ahead log is folded into it (so the log's reusable pages are not counted as growth). */
const sizes = () => {
  try {
    const db = new DatabaseSync(join(dataDir, 'ayar.db'));
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
    }
  } catch {
    /* the engine holds a transaction: the log stays, and the figure includes it */
  }
  return { evidence: du(join(dataDir, 'evidence')), snapshots: du(join(dataDir, 'snapshots')), baselines: du(join(dataDir, 'baselines')), db: ['ayar.db', 'ayar.db-wal', 'ayar.db-shm'].reduce((s, f) => s + du(join(dataDir, f)), 0) };
};

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-13-e19-')));
const dataDir = join(temp, 'AYAR');

const results: Record<string, unknown>[] = [];
try {
  const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(temp, { path: LOGIN_PATH }) } });
  await engine.waitForEvent('engine.health', (e) => e.payload.state === 'ready', 30_000);
  ok(await engine.invoke('settings.set', { key: 'run.notify', value: false }));
  // Keep every run while measuring (retention would delete the oldest beyond the default).
  ok(await engine.invoke('settings.set', { key: 'evidence.retainRuns', value: 500 }));
  // The probe's browser, registered as «ثبّت متصفح المسبار» leaves it, so the probe checks capture (the bulk of the evidence).
  if (probeBrowserReady()) installTestBrowser(dataDir);
  else process.stderr.write('E-19: the probe browser is not cached; the probe checks will be missing\n');
  for (const [project, variant] of projects) {
    const folder = materialize(project, variant, join(temp, `${project}-${variant}`));
    installDependencies(folder);
    const { projectId } = await addProject(engine, folder);
    // The profile as the project's owner would write it (the engine's probe tests, probe.test.ts).
    const include = (ids: string[]) => Object.fromEntries(ids.map((c) => [`${c}@.`, { included: true }]));
    if (project === 'FX-WEB-DESIGN') ok(await engine.invoke('profile.update', { projectId, patch: { ...webDesignPatch(), checks: include(DESIGN_RENDER) } }));
    if (project === 'FX-EXT') ok(await engine.invoke('profile.update', { projectId, patch: { checks: include(['beh.ext.host']) } }));
    await approveAll(engine, projectId);
    const before = sizes();
    const perRun: { runId: string; evidenceDeltaMb: number; snapshotsDeltaMb: number; baselinesDeltaMb: number; dbDeltaMb: number; spaceUsedMb: number; checks: number; design: Record<string, string> }[] = [];
    let last = before;
    for (let i = 0; i < runs; i++) {
      const p = await plan(engine, projectId, { kind: 'full' });
      const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 1_800_000);
      const now = sizes();
      const list = ok<{ spaceUsedBytes: number }>(await engine.invoke('runs.list', { projectId }));
      // The probe checks' outcomes (and the reason when one did not capture), so the measurement says what it measured.
      const design = Object.fromEntries(d.checks.filter((c) => c.checkId.startsWith('design.') || c.checkId === 'beh.ext.host').map((c) => [c.instance, `${c.outcome ?? 'null'}${c.outcomeReason ? ` (${JSON.stringify(c.outcomeReason)})` : ''}`]));
      perRun.push({ runId: d.run.runId, evidenceDeltaMb: mb(now.evidence - last.evidence), snapshotsDeltaMb: mb(now.snapshots - last.snapshots), baselinesDeltaMb: mb(now.baselines - last.baselines), dbDeltaMb: mb(now.db - last.db), spaceUsedMb: mb(list.spaceUsedBytes), checks: d.checks.length, design });
      process.stderr.write(`${project} run #${i + 1}: evidence +${mb(now.evidence - last.evidence)} MB, snapshots +${mb(now.snapshots - last.snapshots)} MB, baselines +${mb(now.baselines - last.baselines)} MB, db +${mb(now.db - last.db)} MB, space ${mb(list.spaceUsedBytes)} MB; design: ${JSON.stringify(design)}\n`);
      last = now;
    }
    const avg = (k: 'evidenceDeltaMb' | 'snapshotsDeltaMb' | 'baselinesDeltaMb' | 'dbDeltaMb') => Math.round((perRun.reduce((s, r) => s + r[k], 0) / perRun.length) * 100) / 100;
    results.push({ project, variant, runs: perRun, averagePerRunMb: { evidence: avg('evidenceDeltaMb'), snapshots: avg('snapshotsDeltaMb'), baselines: avg('baselinesDeltaMb'), db: avg('dbDeltaMb'), total: Math.round((avg('evidenceDeltaMb') + avg('snapshotsDeltaMb') + avg('baselinesDeltaMb') + avg('dbDeltaMb')) * 100) / 100 } });
  }
  await engine.close();
  results.push({ dataFolderMb: mb(du(dataDir)), folders: Object.fromEntries(readdirSync(dataDir).map((f) => [f, mb(du(join(dataDir, f)))])) });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const report = { test: 'E-19: storage per run', runsPerProject: runs, at: new Date().toISOString(), results };
mkdirSync(dirname(join(ROOT, out)), { recursive: true });
writeFileSync(join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
