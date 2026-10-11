#!/usr/bin/env node
// E-19 (plan 22): the storage budget and retention, after the build. Full scans with captures of the fixture
// projects through the engine (FX-WEB-DESIGN: 32 screenshots a scan; FX-EXT: the extension's probe captures and
// its reports), the evidence each run leaves on disk (the evidence folder, the snapshots, the database), and the
// per-run average, so the retention default (evidence.retainRuns) keeps the data folder within a declared target.
//
//   node tools/perf/storage.ts --out docs/acceptance/perf/e19-storage.json [--runs 3]
//
// Everything lives in a temporary folder (ayar-DEV-13-e19-*) removed at the end.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEngine } from '@ayar/cli';
import { addProject, approveAll, loginShell, materialize, ok, plan, startRun, waitRun } from '../cli/test/support/fixtures.ts';

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
/** Bytes under a folder (files only, links not followed). */
function du(dir: string): number {
  if (!existsSync(dir)) return 0;
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

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-13-e19-')));
const dataDir = join(temp, 'AYAR');
const results: Record<string, unknown>[] = [];
try {
  const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(temp, { path: LOGIN_PATH }) } });
  await engine.waitForEvent('engine.health', (e) => e.payload.state === 'ready', 30_000);
  ok(await engine.invoke('settings.set', { key: 'run.notify', value: false }));
  // Keep every run while measuring (retention would delete the oldest beyond the default).
  ok(await engine.invoke('settings.set', { key: 'evidence.retainRuns', value: 500 }));
  for (const [project, variant] of projects) {
    const folder = materialize(project, variant, join(temp, `${project}-${variant}`));
    installDependencies(folder);
    const { projectId } = await addProject(engine, folder);
    await approveAll(engine, projectId);
    const before = { evidence: du(join(dataDir, 'evidence')), snapshots: du(join(dataDir, 'snapshots')), db: du(dataDir) - du(join(dataDir, 'evidence')) - du(join(dataDir, 'snapshots')) };
    const perRun: { runId: string; evidenceDeltaMb: number; snapshotsDeltaMb: number; dbDeltaMb: number; spaceUsedMb: number; checks: number; captures: number }[] = [];
    let last = before;
    for (let i = 0; i < runs; i++) {
      const p = await plan(engine, projectId, { kind: 'full' });
      const d = await waitRun(engine, (await startRun(engine, p.id)).runId, 1_800_000);
      const now = { evidence: du(join(dataDir, 'evidence')), snapshots: du(join(dataDir, 'snapshots')), db: du(dataDir) - du(join(dataDir, 'evidence')) - du(join(dataDir, 'snapshots')) };
      const list = ok<{ spaceUsedBytes: number }>(await engine.invoke('runs.list', { projectId }));
      const captures = d.checks.filter((c) => c.checkId.startsWith('design.')).length;
      perRun.push({ runId: d.run.runId, evidenceDeltaMb: mb(now.evidence - last.evidence), snapshotsDeltaMb: mb(now.snapshots - last.snapshots), dbDeltaMb: mb(now.db - last.db), spaceUsedMb: mb(list.spaceUsedBytes), checks: d.checks.length, captures });
      process.stderr.write(`${project} run #${i + 1}: evidence +${mb(now.evidence - last.evidence)} MB, snapshots +${mb(now.snapshots - last.snapshots)} MB, db +${mb(now.db - last.db)} MB, space ${mb(list.spaceUsedBytes)} MB\n`);
      last = now;
    }
    const avg = (k: 'evidenceDeltaMb' | 'snapshotsDeltaMb' | 'dbDeltaMb') => Math.round((perRun.reduce((s, r) => s + r[k], 0) / perRun.length) * 100) / 100;
    results.push({ project, variant, runs: perRun, averagePerRunMb: { evidence: avg('evidenceDeltaMb'), snapshots: avg('snapshotsDeltaMb'), db: avg('dbDeltaMb'), total: Math.round((avg('evidenceDeltaMb') + avg('snapshotsDeltaMb') + avg('dbDeltaMb')) * 100) / 100 } });
  }
  await engine.close();
  results.push({ dataFolderMb: mb(du(dataDir)), layout: readdirSync(dataDir) });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const report = { test: 'E-19: storage per run', runsPerProject: runs, at: new Date().toISOString(), results };
mkdirSync(dirname(join(ROOT, out)), { recursive: true });
writeFileSync(join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
