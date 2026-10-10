// AT-13 (part) in the app: kill the engine's utilityProcess; the supervisor restarts it after 1 s, the new
// engine shakes hands, the UI is told to resync and sees the new engine's health, and commands work again.
// Also one instance only (C-01), and quitting stops the engine.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, runDirect, tempDataDir, until, type Launched } from './support.ts';

type SupDiag = { state: string; pid: number | null; health: { source: string; state: string; attempt: number | null; retryInMs: number | null }[] };

let t: ReturnType<typeof tempDataDir>;
let run: Launched;
const sup = () =>
  run.app.evaluate(() => {
    const d = (globalThis as unknown as { ayarDiagnostics: { supervisor: { state: string; pid?: number }; health: SupDiag['health'] } }).ayarDiagnostics;
    return { state: d.supervisor.state, pid: d.supervisor.pid ?? null, health: d.health.map((h) => ({ source: h.source, state: h.state, attempt: h.attempt, retryInMs: h.retryInMs })) };
  });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

beforeAll(async () => {
  t = tempDataDir();
  run = await launch(t.dataDir);
});
afterAll(async () => {
  t?.cleanup();
});

describe('engine supervision in the app (C-01, AT-13 part)', () => {
  it('restarts a killed engine after one second, with a new handshake, and the UI resyncs', async () => {
    const first = await until(sup, (s) => s.state === 'ready' && s.pid !== null);
    expect(first.state).toBe('ready');
    await run.page.evaluate(() => {
      const w = window as unknown as { seen: unknown[]; ayar: { subscribe: (t: string, h: (m: unknown) => void) => () => void } };
      w.seen = [];
      w.ayar.subscribe('bridge.resync', (m) => w.seen.push({ resync: m }));
      w.ayar.subscribe('engine.health', (m) => w.seen.push(m));
    });

    const t0 = Date.now();
    process.kill(first.pid!, 'SIGKILL');
    const second = await until(sup, (s) => s.state === 'ready' && s.pid !== null && s.pid !== first.pid);
    const elapsed = Date.now() - t0;
    expect(second.pid).not.toBe(first.pid);
    expect(elapsed).toBeGreaterThanOrEqual(1000);
    expect(alive(first.pid!)).toBe(false);
    expect(second.health).toContainEqual({ source: 'supervisor', state: 'restarting', attempt: 1, retryInMs: 1000 });

    const seen = await until(
      () => run.page.evaluate(() => (window as unknown as { seen: unknown[] }).seen),
      (s) => s.some((m) => (m as { payload?: { source: string; state: string } }).payload?.state === 'ready'),
    );
    const restarting = seen.find((m) => (m as { payload?: { state: string } }).payload?.state === 'restarting') as { stream: string } | undefined;
    const ready = seen.find((m) => (m as { payload?: { state: string } }).payload?.state === 'ready') as { stream: string; payload: { source: string } } | undefined;
    expect(restarting?.stream).toMatch(/^supervisor-/);
    expect(ready?.payload.source).toBe('engine');
    expect(ready?.stream).toMatch(/^engine-/);
    expect(seen.some((m) => 'resync' in (m as object))).toBe(true);

    const r = await run.page.evaluate(() => (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<unknown> } }).ayar.invoke('settings.get', {}));
    expect(r).toMatchObject({ ok: true });
  });

  it('runs one instance only: a second launch on the same data exits and the first keeps its window', async () => {
    const second = await runDirect([`--ayar-data-dir=${t.dataDir}`], 20_000);
    expect(second.code).toBe(0);
    expect(await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });

  it('stops the engine when the app quits', async () => {
    const { pid } = await sup();
    expect(pid !== null && alive(pid)).toBe(true);
    await run.app.close();
    expect(await until(() => Promise.resolve(alive(pid!)), (a) => !a, 5000)).toBe(false);
  });
});
