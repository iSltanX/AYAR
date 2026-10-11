#!/usr/bin/env node
// E-18 (plan 22): the default parallelism and timeouts, after the build. Full scans of a materialized fixture
// project through the engine (as tools/cli spawns it, with the fixtures toolchain on the login PATH, like the
// engine's own acceptance tests) at run.parallel 1, 2 and 3: the wall time of each scan, the engine's answer time
// to a request every 100 ms while it runs (the UI's responsiveness), the processor load, and whether the outcomes
// are the same at every setting (no interference between the checks). Criterion (plan 22): the highest throughput
// without a degraded UI or interfering tests.
//
//   node tools/perf/parallel.ts --out docs/acceptance/perf/e18-parallel.json [--project FX-EXT --variant good] [--repeat 2]
//
// Everything lives in a temporary folder (ayar-DEV-13-e18-*) removed at the end.
import type { RunDetail } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, homedir, loadavg, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { connectEngine } from '@ayar/cli';
import { addProject, approveAll, loginShell, materialize, ok, plan, startRun, waitRun } from '../cli/test/support/fixtures.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOOLCHAIN = join(homedir(), '.cache/ayar-fixtures-toolchain');
const NVM_NODE = join(homedir(), '.nvm/versions/node/v24.16.0/bin');
const PNPM = join(NVM_NODE, 'pnpm');
const UV = join(TOOLCHAIN, 'py/bin/uv');
const PYTHON = '/opt/homebrew/opt/python@3.12/bin/python3.12';
const LOGIN_PATH = [NVM_NODE, join(TOOLCHAIN, 'bin'), join(TOOLCHAIN, 'py/bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const out = opt('out', 'docs/acceptance/perf/e18-parallel.json');
const project = opt('project', 'FX-EXT');
const variant = opt('variant', 'good');
const repeat = Number(opt('repeat', '2'));
const levels = opt('levels', '1,2,3').split(',').map(Number);

/** «ثبّت التبعيات», offline from the toolchain's caches, as the engine's tests do. */
function installDependencies(root: string): void {
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    if (existsSync(join(dir, 'pnpm-lock.yaml')) && !existsSync(join(dir, 'node_modules'))) execFileSync(PNPM, ['install', '--frozen-lockfile', '--offline', '--ignore-scripts', '--reporter=silent'], { cwd: dir, env: { PATH: LOGIN_PATH, HOME: homedir() }, stdio: 'pipe' });
    if (existsSync(join(dir, 'uv.lock')) && !existsSync(join(dir, '.venv'))) execFileSync(UV, ['sync', '--frozen', '--offline', '--quiet'], { cwd: dir, env: { PATH: LOGIN_PATH, HOME: homedir(), UV_PYTHON_PREFERENCE: 'only-system', UV_NO_CONFIG: '1', ...(existsSync(PYTHON) ? { UV_PYTHON: PYTHON } : {}) }, stdio: 'pipe' });
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
}
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : Number.NaN;
};
const p95 = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? Number.NaN;
};
const machine = () => ({ macos: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(), chip: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim(), cpus: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30), loadavg: loadavg().map((x) => Math.round(x * 100) / 100), node: process.version, at: new Date().toISOString() });

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-13-e18-')));
const results: Record<string, unknown>[] = [];
try {
  const folder = materialize(project, variant, join(temp, 'project'));
  installDependencies(folder);
  const engine = await connectEngine({ dataDir: join(temp, 'AYAR'), env: { AYAR_TEST_LOGIN_SHELL: loginShell(temp, { path: LOGIN_PATH }) } });
  await engine.waitForEvent('engine.health', (e) => e.payload.state === 'ready', 30_000);
  ok(await engine.invoke('settings.set', { key: 'run.notify', value: false }));
  const { projectId } = await addProject(engine, folder);
  await approveAll(engine, projectId);
  const outcomesOf = (d: RunDetail): Record<string, string | null> => Object.fromEntries(d.checks.map((c) => [c.instance, c.outcome ?? null] as [string, string | null]).sort());
  let reference: Record<string, string | null> | null = null;
  for (const parallel of levels) {
    ok(await engine.invoke('settings.set', { key: 'run.parallel', value: parallel }));
    const samples: { wallMs: number; latencyMedianMs: number; latencyP95Ms: number; latencyMaxMs: number; loadavg1: number; checks: number; interference: string[] }[] = [];
    for (let i = 0; i < repeat; i++) {
      const p = await plan(engine, projectId, { kind: 'full' });
      const t0 = performance.now();
      const { runId } = await startRun(engine, p.id);
      const latencies: number[] = [];
      const done = waitRun(engine, runId, 1_800_000);
      let finished = false;
      void done.then(() => (finished = true));
      while (!finished) {
        const a = performance.now();
        await engine.invoke('engine.status', {});
        latencies.push(performance.now() - a);
        await new Promise((r) => setTimeout(r, 100));
      }
      const d = await done;
      const wallMs = Math.round(performance.now() - t0);
      const outcomes = outcomesOf(d);
      reference ??= outcomes;
      const interference = Object.keys(outcomes).filter((k) => outcomes[k] !== reference![k]);
      samples.push({ wallMs, latencyMedianMs: Math.round(median(latencies) * 10) / 10, latencyP95Ms: Math.round(p95(latencies) * 10) / 10, latencyMaxMs: Math.round(Math.max(...latencies) * 10) / 10, loadavg1: Math.round(loadavg()[0]! * 100) / 100, checks: d.checks.length, interference });
      process.stderr.write(`parallel ${parallel} #${i + 1}: ${wallMs} ms, latency p95 ${p95(latencies).toFixed(1)} ms, outcomes differ: ${interference.length}\n`);
    }
    results.push({ parallel, samples, medianWallMs: median(samples.map((s) => s.wallMs)), latencyP95Ms: median(samples.map((s) => s.latencyP95Ms)), interference: [...new Set(samples.flatMap((s) => s.interference))] });
  }
  await engine.close();
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const report = { test: 'E-18: parallelism', project, variant, repeat, machine: machine(), results };
mkdirSync(dirname(join(ROOT, out)), { recursive: true });
writeFileSync(join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(results.map((r) => ({ parallel: r.parallel, medianWallMs: r.medianWallMs, latencyP95Ms: r.latencyP95Ms, interference: r.interference })), null, 2));
