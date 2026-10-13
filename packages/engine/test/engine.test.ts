// The engine host in-process, over a fake channel: handshake (D-29), boot, numbered events, dispatch,
// and the stop paths. The same engine over a real child process is tested in tools/cli.
import { formatVersion, PROTOCOL_VERSION } from '@ayar/protocol';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startEngine } from '../src/host/engine.ts';
import { latestVersion } from '../src/storage/migrations.ts';
import { ENGINE_VERSION } from '../src/version.ts';
import { nodePorts } from '../src/node/ports.ts';
import type { HostChannel } from '../src/ports/index.ts';
import { tempRoot } from './support/tmp.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempRoot()));
afterEach(() => cleanup());

function harness() {
  const sent: Record<string, unknown>[] = [];
  const exits: number[] = [];
  let deliver: (m: unknown) => void = () => {};
  let close: () => void = () => {};
  const channel: HostChannel = {
    send: (m) => sent.push(structuredClone(m) as Record<string, unknown>),
    onMessage: (l) => (deliver = l),
    onClose: (l) => (close = l),
  };
  const engine = startEngine({ ports: { ...nodePorts, exit: (code) => (exits.push(code), undefined as never) }, channel });
  const hello = (major: number = PROTOCOL_VERSION.major, source: 'file' | 'test' = 'test') =>
    deliver({ kind: 'hello', protocol: { major, minor: 0 }, peer: 'cli', config: { dataDir: join(root, 'AYAR'), hmacKeySource: source, appVersion: '0.1.0' } });
  const waitFor = async (pred: (m: Record<string, unknown>) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const hit = sent.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no matching message in ${JSON.stringify(sent)}`);
  };
  return { sent, exits, engine, deliver: (m: unknown) => deliver(m), close: () => close(), hello, waitFor };
}

describe('engine host (C-04)', () => {
  it('welcomes a compatible host, boots, and reports its health as event 1', async () => {
    const h = harness();
    h.hello();
    expect(h.sent[0]).toMatchObject({ kind: 'welcome', protocol: PROTOCOL_VERSION, engine: { version: ENGINE_VERSION, pid: process.pid, stream: h.engine.stream } });
    const event = await h.waitFor((m) => m.kind === 'event');
    expect(event).toMatchObject({ seq: 1, stream: h.engine.stream, topic: 'engine.health', payload: { source: 'engine', state: 'ready', reason: null, schemaVersion: latestVersion(), hmacKeySource: 'test' } });
    expect((event.payload as { logPath: string }).logPath).toBe(join(root, 'AYAR', 'logs', 'engine.log'));
    expect(existsSync(join(root, 'AYAR', 'ayar.db'))).toBe(true);
    h.engine.stop();
  });

  it('serves a command and keeps the answer correlated', async () => {
    const h = harness();
    h.hello();
    h.deliver({ kind: 'command', id: 1, command: 'settings.set', payload: { key: 'ui.language', value: 'ar' } });
    h.deliver({ kind: 'command', id: 2, command: 'settings.get', payload: { keys: ['ui.language'] } });
    expect(await h.waitFor((m) => m.id === 1)).toMatchObject({ ok: true, result: { key: 'ui.language', value: 'ar' } });
    expect(await h.waitFor((m) => m.id === 2)).toMatchObject({ ok: true, result: { values: { 'ui.language': 'ar' } } });
    h.engine.stop();
  });

  it('refuses a command before the handshake', async () => {
    const h = harness();
    h.deliver({ kind: 'command', id: 5, command: 'settings.get', payload: {} });
    expect(await h.waitFor((m) => m.id === 5)).toMatchObject({ ok: false, error: { code: 'engine_starting' } });
    h.engine.stop();
  });

  it('stops the connection on a different major version (D-29)', async () => {
    const h = harness();
    h.hello(PROTOCOL_VERSION.major + 1);
    expect(h.sent).toEqual([
      { kind: 'refuse', protocol: PROTOCOL_VERSION, error: { code: 'protocol_mismatch', messageKey: 'errors.protocol_mismatch', details: { expected: formatVersion(PROTOCOL_VERSION), received: `${PROTOCOL_VERSION.major + 1}.0` } } },
    ]);
    await new Promise((r) => setTimeout(r, 80));
    expect(h.exits).toEqual([76]);
    expect(existsSync(join(root, 'AYAR'))).toBe(false); // no boot happened
  });

  it('answers an invalid command with an error and keeps serving', async () => {
    const h = harness();
    h.hello();
    h.deliver({ kind: 'command', id: 3, command: 'settings.set', payload: { key: 'ui.language', value: 'klingon' } });
    h.deliver({ kind: 'command', id: 4, command: 'rm.rf', payload: {} });
    h.deliver({ kind: 'nonsense' });
    expect(await h.waitFor((m) => m.id === 3)).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
    expect(await h.waitFor((m) => m.id === 4)).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
    h.deliver({ kind: 'command', id: 6, command: 'settings.get', payload: {} });
    expect(await h.waitFor((m) => m.id === 6)).toMatchObject({ ok: true });
    h.engine.stop();
  });

  it('exits cleanly on shutdown and when the host goes away', async () => {
    const a = harness();
    a.hello();
    await a.waitFor((m) => m.kind === 'event');
    a.deliver({ kind: 'shutdown' });
    expect(a.exits).toEqual([0]);
    const b = harness();
    b.hello();
    await b.waitFor((m) => m.kind === 'event');
    b.close();
    expect(b.exits).toEqual([0]);
  });

  it('crashes on purpose on an unexpected handler exception, after answering (C-04)', async () => {
    const sent: Record<string, unknown>[] = [];
    const exits: number[] = [];
    let deliver: (m: unknown) => void = () => {};
    const engine = startEngine({
      ports: { ...nodePorts, exit: (code) => (exits.push(code), undefined as never) },
      channel: { send: (m) => sent.push(m as Record<string, unknown>), onMessage: (l) => (deliver = l), onClose: () => {} },
      handlers: { 'settings.get': () => { throw new RangeError('unknown state'); } },
    });
    deliver({ kind: 'hello', protocol: PROTOCOL_VERSION, peer: 'cli', config: { dataDir: join(root, 'AYAR'), hmacKeySource: 'test', appVersion: '0.1.0' } });
    await engine.booted();
    deliver({ kind: 'command', id: 1, command: 'settings.get', payload: {} });
    for (let i = 0; i < 100 && !exits.length; i++) await new Promise((r) => setTimeout(r, 10));
    expect(sent.find((m) => m.id === 1)).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(exits).toEqual([70]);
  });

  it('comes up degraded, and says why, on a database newer than the app', async () => {
    const first = harness();
    first.hello();
    await first.waitFor((m) => m.kind === 'event');
    first.engine.stop();
    const { openDatabase } = await import('../src/storage/db.ts');
    const db = openDatabase(join(root, 'AYAR', 'ayar.db'));
    db.run("UPDATE schema_meta SET value = '42' WHERE key = 'schema_version'");
    db.close();
    const h = harness();
    h.hello();
    expect(await h.waitFor((m) => m.kind === 'event')).toMatchObject({ payload: { state: 'degraded', reason: 'db_newer_than_app' } });
    h.deliver({ kind: 'command', id: 9, command: 'settings.get', payload: {} });
    expect(await h.waitFor((m) => m.id === 9)).toMatchObject({ ok: false, error: { code: 'db_newer_than_app' } });
    h.engine.stop();
  });
});
