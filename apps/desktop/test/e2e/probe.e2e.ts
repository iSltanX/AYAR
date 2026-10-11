// C-14 in the app (6.3, E-11): the engine (a utilityProcess) asks the main process for the probe, which starts it as
// a second utilityProcess and joins the two by a MessageChannel; the probe runs bundled (playwright-core inside
// dist/engine/probe.mjs, axe-core beside it) and drives the probe browser. design.a11y on FX-NOTEST's documentation
// page, through the protocol as the UI would ask: a judged outcome, the images and the outcome as evidence, the
// mode recorded, and no probe process left once the run is over or the app quits.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_DIR, launch, tempDataDir, until, type Launched } from './support.ts';

const BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const READY = existsSync(BROWSER);
const FIXTURES = join(APP_DIR, '../../fixtures');

let t: ReturnType<typeof tempDataDir>;
let run: Launched;

type Reply = { ok: boolean; result?: unknown; error?: unknown };
/** A command as the gateway would send it, with the grants the main process attaches. */
const invoke = (command: string, payload: unknown, grants?: unknown): Promise<Reply> =>
  run.app.evaluate<Reply, { command: string; payload: unknown; grants: unknown }>(
    (_e, a) => {
      const d = (globalThis as unknown as { ayarDiagnostics: { supervisor: { request: (c: string, p: unknown, g?: unknown) => Promise<Reply> } } }).ayarDiagnostics;
      return d.supervisor.request(a.command, a.payload, a.grants ?? undefined);
    },
    { command, payload, grants: grants ?? null },
  );
const ok = async <T>(r: Promise<Reply>): Promise<T> => {
  const x = await r;
  if (!x.ok) throw new Error(`command failed: ${JSON.stringify(x.error)}`);
  return x.result as T;
};
const probes = () => {
  try {
    return execFileSync('/bin/ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter((l) => l.includes(t.root) || l.includes('probe.mjs')).filter((l) => /probe\.mjs|Chrome for Testing/.test(l));
  } catch {
    return [];
  }
};

beforeAll(async () => {
  if (!READY) return;
  t = tempDataDir();
  run = await launch(t.dataDir);
});
afterAll(async () => {
  await run?.app.close().catch(() => {});
  if (process.env.AYAR_KEEP_TMP) console.log(t?.root);
  else t?.cleanup();
});

describe('the web probe in the app (C-14, E-11)', () => {
  it.runIf(READY)('runs design.a11y through a second utilityProcess and leaves no probe behind', async () => {
    await until(() => invoke('settings.get', { keys: ['run.parallel'] }), (r) => r.ok, 30_000);
    // The probe's browser, registered as «ثبّت متصفح المسبار» leaves it (the same pinned build).
    const db = new DatabaseSync(join(t.dataDir, 'ayar.db'));
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.prepare("INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES ('dat_e2e_browser', 'browser', 'chromium', '156.0.8078.4', ?, 0, ?)").run(BROWSER, new Date().toISOString());
    } finally {
      db.close();
    }
    const project = execFileSync(process.execPath, [join(FIXTURES, 'tools/materialize.mjs'), 'FX-NOTEST', 'good', join(t.root, 'notest')], { encoding: 'utf8' }).trim().split('\n').pop()!;
    const added = await ok<{ project: { id: string } }>(invoke('project.add', { selectionToken: `sel_${'a'.repeat(43)}` }, { selectionToken: { kind: 'selection', path: project } }));
    const projectId = added.project.id;
    await until(() => invoke('profile.get', { projectId }), (r) => r.ok, 60_000);
    for (;;) {
      const p = await ok<{ pending: { id: string; items: { approvable: boolean; approveAlone: boolean; instance: string }[] } }>(invoke('profile.get', { projectId }));
      const items = p.pending.items.filter((i) => i.approvable);
      if (!items.length) break;
      const alone = items.find((i) => i.approveAlone);
      await ok(invoke('profile.approve', { projectId, changeSetId: p.pending.id, ...(alone ? { instances: [alone.instance] } : {}) }));
    }
    const plan = await ok<{ id: string }>(invoke('run.plan', { projectId, selection: { kind: 'group', instances: ['design.a11y@.'] } }));
    const started = await ok<{ runId: string }>(invoke('run.start', { planId: plan.id }));
    const detail = await until(
      () => ok<{ run: { state: string }; checks: { instance: string; outcome: string | null; outcomeReason: { key: string } | null; checkRunId: string }[] }>(invoke('run.get', { runId: started.runId })),
      (d) => d.run.state === 'finished',
      180_000,
    );
    const a11y = detail.checks.find((c) => c.instance === 'design.a11y@.')!;
    // Judged by axe, not «تعذّر» for want of a probe.
    expect(['passed', 'warning', 'failed', 'needs_review'], JSON.stringify(a11y.outcomeReason)).toContain(a11y.outcome);
    const dir = join(t.dataDir, 'evidence', projectId, started.runId, a11y.checkRunId);
    const files = readdirSync(dir, { recursive: true }).map(String);
    expect(files.filter((f) => f.startsWith('captures/') && f.endsWith('.png')).length).toBeGreaterThan(0);
    const outcome = JSON.parse(readFileSync(join(dir, 'probe.json'), 'utf8')) as { summary: { mode: string; browserVersion: string }; results: { axe: { version: string } | null }[] };
    expect(outcome.summary).toMatchObject({ mode: 'headless', browserVersion: '156.0.8078.4' });
    expect(outcome.results[0]?.axe?.version).toBe('4.14.0');
    // No probe process or browser is left once the run is over.
    expect(await until(() => Promise.resolve(probes()), (p) => p.length === 0, 15_000)).toEqual([]);
  }, 300_000);
});
