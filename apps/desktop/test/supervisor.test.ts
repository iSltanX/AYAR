// C-01 / AT-13 (part): the supervisor against real engine processes. Restart after a kill with a new
// handshake; the failed state after three restarts within the window; SIGTERM then SIGKILL on stop.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EngineHealth } from '@ayar/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUIT_WAIT_MS } from '@ayar/engine';
import { EngineSupervisor, PREPARE_QUIT_WAIT_MS, RESTART_DELAYS_MS, RESTART_WINDOW_MS, STOP_GRACE_MS, type EngineChild, type SupervisorOptions } from '../src/main/engine-supervisor.ts';
import { realEngine, scriptedChild, stubbornChild } from './support/engine-child.ts';

let root: string;
const supervisors: EngineSupervisor[] = [];
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-sup-')));
});
afterEach(async () => {
  for (const s of supervisors.splice(0)) await s.stop();
  rmSync(root, { recursive: true, force: true });
});

function make(o: Partial<SupervisorOptions> & Pick<SupervisorOptions, 'spawn'>) {
  const health: EngineHealth[] = [];
  const sup = new EngineSupervisor({
    config: { dataDir: join(root, 'AYAR'), hmacKeySource: 'test', appVersion: '0.1.0' },
    logPath: join(root, 'AYAR', 'logs', 'engine.log'),
    onHealth: (h) => health.push(h),
    onEngineEvent: (e) => {
      if (e.topic === 'engine.health') health.push(e.payload as EngineHealth);
    },
    ...o,
  });
  supervisors.push(sup);
  return { sup, health };
}

const until = async (cond: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return cond();
};

describe('engine supervisor (C-01)', () => {
  it('uses the plan delays: 1, 5 and 30 seconds, three restarts within five minutes', () => {
    expect(RESTART_DELAYS_MS).toEqual([1000, 5000, 30000]);
    expect(RESTART_WINDOW_MS).toBe(300_000);
  });

  it('starts the engine, shakes hands, and serves requests', async () => {
    const { sup, health } = make({ spawn: () => realEngine() });
    sup.start();
    expect(await until(() => sup.state === 'ready')).toBe(true);
    expect(await sup.request('settings.get', {})).toMatchObject({ ok: true });
    expect(await until(() => health.some((h) => h.source === 'engine' && h.state === 'ready'))).toBe(true);
    expect(sup.status()).toMatchObject({ source: 'engine', state: 'ready' });
  });

  it('restarts a killed engine after the first delay, with a new handshake', async () => {
    const { sup, health } = make({ spawn: () => realEngine(), delaysMs: [200, 400, 600] });
    sup.start();
    await until(() => sup.state === 'ready');
    const first = sup.pid!;
    process.kill(first, 'SIGKILL');
    expect(await until(() => sup.state === 'restarting')).toBe(true);
    expect(await sup.request('settings.get', {})).toMatchObject({ ok: false, error: { code: 'engine_unavailable' } });
    expect(await until(() => sup.state === 'ready' && sup.pid !== first)).toBe(true);
    expect(health.find((h) => h.state === 'restarting')).toMatchObject({ source: 'supervisor', attempt: 1, retryInMs: 200, reason: 'engine_unavailable' });
    expect(await sup.request('settings.set', { key: 'ui.theme', value: 'light' })).toMatchObject({ ok: true });
  });

  it('after three restarts within the window, stops and reports the failed state with the log path', async () => {
    const { sup, health } = make({ spawn: () => realEngine({ AYAR_ENGINE_TEST_CRASH: 'after-boot' }), delaysMs: [50, 100, 150] });
    sup.start();
    expect(await until(() => sup.state === 'failed', 30_000)).toBe(true);
    const states = health.filter((h) => h.source === 'supervisor').map((h) => [h.state, h.attempt, h.retryInMs]);
    expect(states).toEqual([
      ['restarting', 1, 50],
      ['restarting', 2, 100],
      ['restarting', 3, 150],
      ['failed', 3, null],
    ]);
    expect(health.at(-1)).toMatchObject({ state: 'failed', reason: 'engine_failed', logPath: join(root, 'AYAR', 'logs', 'engine.log') });
    expect(await sup.request('settings.get', {})).toMatchObject({ ok: false, error: { code: 'engine_failed', details: { logPath: join(root, 'AYAR', 'logs', 'engine.log') } } });
    // The error screen's retry starts again (the engine here still crashes, so it only leaves "failed").
    expect(sup.restart()).toBe(true);
    expect(sup.state).not.toBe('failed');
  });

  it('forgets restarts older than the window', async () => {
    let t = 0;
    const { sup, health } = make({
      spawn: () => realEngine({ AYAR_ENGINE_TEST_CRASH: 'after-boot' }),
      delaysMs: [30, 30, 30],
      windowMs: 1000,
      now: () => (t += 2000), // every crash looks 2 s after the previous one: outside a 1 s window
    });
    sup.start();
    expect(await until(() => health.filter((h) => h.state === 'restarting').length >= 5, 30_000)).toBe(true);
    expect(sup.state).not.toBe('failed');
    expect(health.filter((h) => h.state === 'restarting').every((h) => h.attempt === 1)).toBe(true);
  });

  it('stops with SIGTERM, then SIGKILL after the grace period when the engine ignores it', async () => {
    const { sup } = make({ spawn: stubbornChild, stopGraceMs: 300, handshakeTimeoutMs: 60_000 });
    sup.start();
    const pid = sup.pid!;
    await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now();
    await sup.stop();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(sup.state).toBe('stopped');
  });

  it('a cooperative engine stops on SIGTERM before the grace period', async () => {
    const { sup } = make({ spawn: () => realEngine(), stopGraceMs: 2000 });
    sup.start();
    await until(() => sup.state === 'ready');
    const t0 = Date.now();
    await sup.stop();
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('treats a handshake that never comes as a crash, and restarts', async () => {
    let spawned = 0;
    const { sup, health } = make({
      spawn: () => {
        spawned++;
        return scriptedChild(() => undefined); // never answers hello
      },
      handshakeTimeoutMs: 100,
      delaysMs: [20, 20, 20],
    });
    sup.start();
    expect(await until(() => sup.state === 'failed')).toBe(true);
    expect(spawned).toBe(4);
    expect(health.filter((h) => h.state === 'restarting')).toHaveLength(3);
  });

  it('a spawn that throws follows the restart policy instead of crashing the main process', async () => {
    let calls = 0;
    const { sup, health } = make({
      spawn: () => {
        calls++;
        throw new Error('EAGAIN');
      },
      delaysMs: [10, 10, 10],
    });
    sup.start();
    expect(await until(() => sup.state === 'failed')).toBe(true);
    expect(calls).toBe(4);
    expect(health.at(-1)).toMatchObject({ state: 'failed', reason: 'engine_failed' });
  });

  it('stop() returns even when the child never reports its exit', async () => {
    const never: EngineChild = {
      pid: undefined,
      transport: { send() {}, onMessage() {}, onClose() {}, close() {} },
      exited: new Promise(() => {}),
      kill() {},
    };
    const { sup } = make({ spawn: () => never, stopGraceMs: 100, handshakeTimeoutMs: 60_000 });
    sup.start();
    const t0 = Date.now();
    await sup.stop();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(sup.state).toBe('stopped');
  });

  it('does not restart an engine that speaks another protocol major (D-29)', async () => {
    let spawned = 0;
    const { sup, health } = make({
      spawn: () => {
        spawned++;
        return scriptedChild(() => ({ kind: 'welcome', protocol: { major: 9, minor: 0 }, engine: { version: '9.0.0', pid: 1, stream: 'engine-abcdefgh' } }));
      },
      delaysMs: [10, 10, 10],
    });
    sup.start();
    expect(await until(() => sup.state === 'failed')).toBe(true);
    expect(health.at(-1)).toMatchObject({ state: 'failed', reason: 'protocol_mismatch' });
    expect(spawned).toBe(1);
  });
});

describe('quitting during a run (9.7, D-DEV5-08)', () => {
  it('never kills the engine in the middle of its own short ending of a run', () => {
    // The engine waits QUIT_WAIT_MS for the checks' SIGTERM, 2 s and SIGKILL; SIGKILL to the engine comes later.
    expect(QUIT_WAIT_MS).toBeGreaterThan(2_000);
    expect(STOP_GRACE_MS).toBeGreaterThan(QUIT_WAIT_MS);
    expect(PREPARE_QUIT_WAIT_MS).toBeGreaterThan(2_000);
  });
});
