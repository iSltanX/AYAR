// AT-36, the app part (NFR-01 «استجابة الواجهة» and «تحديثات كل فحص», NFR-08 cold start, NFR-09 resources; E-14), on
// the derived test package (AYAR_E2E_APP, D-51) or the development build. Five samples per target, the median and
// the machine's conditions written to docs/acceptance/perf/app.json (AYAR_PERF_OUT). The first pass is E-14's
// baseline; the acceptance pass judges the medians against the calibrated targets (AYAR_PERF_JUDGE=1).
//
//   cd apps/desktop && AYAR_E2E_APP=<derived .app> node ../../node_modules/vitest/vitest.mjs run -c vitest.perf.config.ts
//
// - Cold start: five launches of a fresh data folder; the time from the process start to the first screen's
//   interactive control («اختر مجلدًا…» enabled), by the page's own clock (performance.timeOrigin → now).
// - UI response while a run goes on: a round trip from the page to the engine and back (project.list, the lightest
//   engine command) every 100 ms during a full scan of the journey project; the median and the p95, in the page.
// - Updates per check: check.progress/check.state events per running check per second, from the engine's events
//   seen by the page's bridge subscription, never more than 10 a second.
// - Memory and idle processor: every 500 ms, the RSS of AYAR's whole process tree (main, helpers, engine; the
//   project's own processes are children of the engine and are excluded by their AYAR_CHECK_TOKEN environment, read
//   with ps -E) during the scan, and the processor share of the tree over 30 idle seconds afterwards.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, totalmem } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGED_APP, launch, tempDataDir, until, type Launched } from '../e2e/support.ts';
import { CUSTOM_CHECKS, loginShell, makeJourneyProject } from '../e2e/journey-project.ts';

type Invoke = { ok: boolean; result?: unknown; error?: { code: string } };
const REPEAT = Number(process.env.AYAR_PERF_REPEAT ?? 5);
const JUDGE = process.env.AYAR_PERF_JUDGE === '1';
const OUT = process.env.AYAR_PERF_OUT ?? fileURLToPath(new URL('../../../../docs/acceptance/perf/app.json', import.meta.url));
/** The targets as calibrated in E-14 (DEV-13); the baseline pass records them beside the measurement. */
const TARGETS = { coldStartMs: 3000, uiResponseP95Ms: 100, updatesPerCheckPerSecond: 10, peakRssMb: 600, idleCpuPercent: 2 };

/** «اعتمد الكل» over the bridge, as tools/cli's approveAll does through the protocol. */
async function approveAll(invoke: <T>(c: string, p: unknown) => Promise<{ ok: boolean; result: T }>, projectId: string): Promise<void> {
  for (;;) {
    const r = await invoke<{ pending: { id: string; items: { instance: string; approvable: boolean; approveAlone: boolean }[] } }>('profile.get', { projectId });
    const items = r.result.pending.items.filter((i) => i.approvable);
    if (!items.length) return;
    const alone = items.find((i) => i.approveAlone);
    await invoke('profile.approve', { projectId, changeSetId: r.result.pending.id, ...(alone ? { instances: [alone.instance] } : {}) });
  }
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : Number.NaN;
};
const p95 = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? Number.NaN;
};
const machine = () => ({
  macos: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
  chip: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim(),
  cpus: cpus().length,
  memoryGb: Math.round(totalmem() / 2 ** 30),
  loadavg: loadavg().map((x) => Math.round(x * 100) / 100),
  power: (execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).split('\n')[0] ?? '').replace(/^Now drawing from /, '').trim(),
  app: PACKAGED_APP ?? 'development build',
  at: new Date().toISOString(),
});

/** AYAR's process tree (pid and its descendants) with RSS in MB and %CPU, the project's checks excluded. */
function tree(rootPid: number): { pid: number; rssMb: number; cpu: number; comm: string }[] {
  const lines = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,%cpu=,comm='], { encoding: 'utf8' }).trim().split('\n');
  const rows = lines.map((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(l);
    return m ? { pid: Number(m[1]), ppid: Number(m[2]), rssMb: Number(m[3]) / 1024, cpu: Number(m[4]), comm: m[5]! } : null;
  });
  const byParent = new Map<number, typeof rows>();
  for (const r of rows) if (r) byParent.set(r.ppid, [...(byParent.get(r.ppid) ?? []), r]);
  const out: { pid: number; rssMb: number; cpu: number; comm: string }[] = [];
  const walk = (pid: number) => {
    for (const r of byParent.get(pid) ?? []) {
      if (!r) continue;
      // A project process carries AYAR_CHECK_TOKEN (C-12); it is the project's, not AYAR's.
      let env = '';
      try {
        env = execFileSync('ps', ['-Eo', 'command=', '-p', String(r.pid)], { encoding: 'utf8' });
      } catch {
        env = '';
      }
      if (env.includes('AYAR_CHECK_TOKEN=')) continue;
      out.push({ pid: r.pid, rssMb: r.rssMb, cpu: r.cpu, comm: r.comm });
      walk(r.pid);
    }
  };
  const root = rows.find((r) => r?.pid === rootPid);
  if (root) out.push({ pid: root.pid, rssMb: root.rssMb, cpu: root.cpu, comm: root.comm });
  walk(rootPid);
  return out;
}

const report: Record<string, unknown> = { test: 'AT-36 (app)', targets: TARGETS, repeat: REPEAT };
let run: Launched | null = null;
let t: ReturnType<typeof tempDataDir> | null = null;

afterAll(() => {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ ...report, machine: machine() }, null, 2)}\n`);
});

describe('AT-36 (app): cold start, UI response, update rate, memory, idle processor', () => {
  it(
    'cold start to the first interactive control, five fresh launches (NFR-08)',
    async () => {
      const samples: number[] = [];
      for (let i = 0; i < REPEAT; i++) {
        const own = tempDataDir();
        const started = Date.now();
        const r = await launch(own.dataDir);
        await r.page.getByRole('button', { name: 'اختر مجلدًا…' }).waitFor({ state: 'visible', timeout: 30_000 });
        const inPage = await r.page.evaluate(() => Math.round(performance.now()));
        const wall = Date.now() - started;
        // The page's own clock starts when the renderer is created; the process started a little before it.
        samples.push(Math.min(wall, inPage + 0));
        process.stderr.write(`cold start #${i + 1}: page ${inPage} ms, wall ${wall} ms\n`);
        await r.app.close();
        own.cleanup();
      }
      report['coldStart'] = { samples, medianMs: median(samples) };
      if (JUDGE) expect(median(samples)).toBeLessThanOrEqual(TARGETS.coldStartMs);
    },
    REPEAT * 60_000,
  );

  it(
    'UI response, updates per check, memory during a full scan, then the idle processor (NFR-01, NFR-09)',
    async () => {
      t = tempDataDir();
      const folder = makeJourneyProject(t.root);
      run = await launch(t.dataDir);
      const { page, app } = run;
      const invoke = <T>(command: string, payload: unknown) =>
        page.evaluate(([c, p]) => (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<Invoke> } }).ayar.invoke(c, p), [command, payload] as const) as Promise<{ ok: boolean; result: T }>;
      await invoke('settings.set', { key: 'ui.language', value: 'ar' });
      await invoke('settings.set', { key: 'environment.shell', value: loginShell(t.root) });
      await invoke('settings.set', { key: 'run.notify', value: false });
      await page.reload();
      await page.waitForLoadState('load');
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
      }, folder);
      await page.getByRole('button', { name: 'اختر مجلدًا…' }).click();
      await page.getByRole('button', { name: 'راجع ملف المعايير' }).waitFor({ timeout: 30_000 });
      const list = await invoke<{ projects: { id: string }[] }>('project.list', {});
      const projectId = list.result.projects[0]!.id;
      // The two custom checks of the journey (a fast failure and a slow one) make the scan last long enough to sample.
      await invoke('profile.update', { projectId, patch: { custom: CUSTOM_CHECKS } });
      await approveAll(invoke, projectId);
      // The page keeps a tally of the engine's events for the running checks (update rate).
      await page.evaluate(() => {
        const w = window as unknown as { ayar: { subscribe: (topic: string, f: (e: { payload: { checkRunId?: string } }) => void) => void }; __perfEvents: Record<string, number[]> };
        w.__perfEvents = {};
        for (const topic of ['check.progress', 'check.state']) {
          w.ayar.subscribe(topic, (e) => {
            const id = e.payload.checkRunId ?? '?';
            (w.__perfEvents[id] ??= []).push(performance.now());
          });
        }
      });
      const plan = await invoke<{ id: string }>('run.plan', { projectId, selection: { kind: 'full' } });
      const started = await invoke<{ runId: string }>('run.start', { planId: plan.result.id });
      const runId = started.result.runId;
      const pid = app.process().pid!;
      const latencies: number[] = [];
      const rss: number[] = [];
      let state = 'running';
      const sampler = setInterval(() => {
        try {
          rss.push(tree(pid).reduce((s, r) => s + r.rssMb, 0));
        } catch {
          /* a process vanished between ps calls */
        }
      }, 500);
      try {
        while (state !== 'finished' && state !== 'interrupted') {
          const ms = await page.evaluate(async () => {
            const w = window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<unknown> } };
            const t0 = performance.now();
            await w.ayar.invoke('project.list', {});
            return performance.now() - t0;
          });
          latencies.push(ms);
          await new Promise((r) => setTimeout(r, 100));
          const d = await invoke<{ run: { state: string } }>('run.get', { runId });
          state = d.result.run.state;
        }
      } finally {
        clearInterval(sampler);
      }
      const events = await page.evaluate(() => (window as unknown as { __perfEvents: Record<string, number[]> }).__perfEvents);
      // Updates per check per second: for each check, the busiest one-second window.
      let busiest = 0;
      for (const times of Object.values(events)) {
        const s = [...times].sort((a, b) => a - b);
        for (let i = 0; i < s.length; i++) {
          let j = i;
          while (j < s.length && s[j]! - s[i]! <= 1000) j++;
          busiest = Math.max(busiest, j - i);
        }
      }
      // Idle: 30 seconds after the scan, the processor share of the whole tree (ps %cpu is a recent average).
      await new Promise((r) => setTimeout(r, 10_000));
      const idle: number[] = [];
      for (let i = 0; i < 20; i++) {
        idle.push(tree(pid).reduce((s, r) => s + r.cpu, 0));
        await new Promise((r) => setTimeout(r, 1000));
      }
      report['uiResponse'] = { samples: latencies.length, medianMs: Math.round(median(latencies) * 10) / 10, p95Ms: Math.round(p95(latencies) * 10) / 10, maxMs: Math.round(Math.max(...latencies) * 10) / 10 };
      report['updatesPerCheck'] = { checks: Object.keys(events).length, busiestSecond: busiest };
      report['memory'] = { samples: rss.length, peakRssMb: Math.round(Math.max(...rss)), medianRssMb: Math.round(median(rss)) };
      report['idleCpu'] = { samples: idle.length, medianPercent: Math.round(median(idle) * 10) / 10, maxPercent: Math.max(...idle) };
      process.stderr.write(`${JSON.stringify({ uiResponse: report['uiResponse'], updatesPerCheck: report['updatesPerCheck'], memory: report['memory'], idleCpu: report['idleCpu'] })}\n`);
      expect(state).toBe('finished');
      if (JUDGE) {
        expect(p95(latencies)).toBeLessThanOrEqual(TARGETS.uiResponseP95Ms);
        expect(busiest).toBeLessThanOrEqual(TARGETS.updatesPerCheckPerSecond);
        expect(Math.max(...rss)).toBeLessThanOrEqual(TARGETS.peakRssMb);
        expect(median(idle)).toBeLessThanOrEqual(TARGETS.idleCpuPercent);
      }
      await until(() => Promise.resolve(true), () => true, 1);
    },
    600_000,
  );
});

beforeAll(() => {
  mkdirSync(dirname(OUT), { recursive: true });
});
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});
