#!/usr/bin/env node
// AT-36, the engine part (NFR-01 «الاكتشاف» and «أول تقدم»; E-14): discovery of the synthetic repositories of
// 1,000, 10,000 and 50,000 files (fixtures/tools/synth-repo, DEV-1), through the engine as tools/cli spawns it, five
// times each: the time from project.add (or project.rescan) to the first discovery.progress event and to
// discovery.done, with the median, and the machine's conditions. The first pass is E-14's baseline (recorded, not
// judged); the acceptance pass compares the medians with the calibrated targets.
//
//   node tools/perf/discovery.ts --out docs/acceptance/perf/discovery.json [--repeat 5] [--sizes 1000,10000,50000]
//
// Everything it makes lives in a temporary folder (ayar-DEV-13-perf-*) removed at the end.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { connectEngine, pathGrant } from '@ayar/cli';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const out = opt('out', 'docs/acceptance/perf/discovery.json');
const repeat = Number(opt('repeat', '5'));
const sizes = opt('sizes', '1000,10000,50000').split(',').map(Number);

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const machine = () => {
  const sw = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
  const chip = execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim();
  const power = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).split('\n')[0] ?? '';
  return { platform: `${platform()} ${release()}`, macos: sw, chip, cpus: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30), loadavg: loadavg().map((x) => Math.round(x * 100) / 100), power: power.replace(/^Now drawing from /, '').trim(), node: process.version, at: new Date().toISOString() };
};

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-13-perf-')));
const results: Record<string, unknown>[] = [];
try {
  for (const files of sizes) {
    const repo = join(temp, `synth-${files}`);
    const gen = execFileSync(process.execPath, [join(ROOT, 'fixtures/tools/synth-repo/generate.mjs'), '--files', String(files), '--out', repo, '--seed', '1'], { encoding: 'utf8' }).trim().split('\n').pop()!;
    const dataDir = join(temp, `data-${files}`);
    mkdirSync(dataDir, { recursive: true });
    const engine = await connectEngine({ dataDir });
    await engine.waitForEvent('engine.health', (e) => e.payload.state === 'ready', 30_000);
    const samples: { firstProgressMs: number; doneMs: number; filesSeen: number; progressEvents: number; facts: number }[] = [];
    let projectId: string | null = null;
    for (let i = 0; i < repeat; i++) {
      const t0 = performance.now();
      let discoveryId: string;
      if (!projectId) {
        const g = pathGrant('selection', repo);
        const r = await engine.invoke('project.add', { selectionToken: g.token }, g.grants);
        if (!r.ok) throw new Error(`project.add failed: ${JSON.stringify(r.error)}`);
        const added = r.result as { project: { id: string }; discoveryId: string };
        projectId = added.project.id;
        discoveryId = added.discoveryId;
      } else {
        const r = await engine.invoke('project.rescan', { projectId });
        if (!r.ok) throw new Error(`project.rescan failed: ${JSON.stringify(r.error)}`);
        discoveryId = (r.result as { discoveryId: string }).discoveryId;
      }
      // The first progress event of this discovery (the engine emits one every 200 ms, 9.2), then done.
      const first = engine.waitForEvent('discovery.progress', (e) => e.payload.discoveryId === discoveryId, 60_000).then(() => performance.now() - t0, () => Number.NaN);
      const done = await engine.waitForEvent('discovery.done', (e) => e.payload.discoveryId === discoveryId, 300_000);
      const doneMs = performance.now() - t0;
      const firstProgressMs = await first;
      const progress = engine.events.filter((e) => e.topic === 'discovery.progress' && (e.payload as { discoveryId: string }).discoveryId === discoveryId);
      const last = progress.at(-1)?.payload as { filesSeen?: number } | undefined;
      samples.push({ firstProgressMs: Math.round(firstProgressMs), doneMs: Math.round(doneMs), filesSeen: last?.filesSeen ?? -1, progressEvents: progress.length, facts: done.payload.summary.facts });
      process.stderr.write(`synth-${files} #${i + 1}: first progress ${Math.round(firstProgressMs)} ms, done ${Math.round(doneMs)} ms\n`);
    }
    await engine.close();
    const okSamples = samples.filter((s) => Number.isFinite(s.firstProgressMs));
    results.push({ files, generated: JSON.parse(gen), samples, median: { firstProgressMs: okSamples.length ? median(okSamples.map((s) => s.firstProgressMs)) : null, doneMs: median(samples.map((s) => s.doneMs)) }, note: okSamples.length < samples.length ? 'a discovery finished before its first progress event (under 200 ms): no first-progress sample for it' : null });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const report = { test: 'AT-36 (engine): discovery of the synthetic repositories', machine: machine(), repeat, results };
mkdirSync(dirname(join(ROOT, out)), { recursive: true });
writeFileSync(join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.results.map((r) => ({ files: r.files, median: r.median })), null, 2));
