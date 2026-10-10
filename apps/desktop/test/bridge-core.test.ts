// The bridge (C-02): local refusal of unknown commands, topic checks, and resync on a gap, a new engine
// stream, or a replaced port.
import type { BridgeResync, InvokeResult } from '@ayar/protocol';
import { describe, expect, it } from 'vitest';
import { createBridgeCore, type PortLike } from '../src/preload/bridge-core.ts';

function fakePort() {
  let handler: (d: unknown) => void = () => {};
  let closed = false;
  const port: PortLike = { listen: (h) => (handler = h), close: () => (closed = true) };
  return { port, push: (d: unknown) => handler(d), closed: () => closed };
}

const health = { source: 'engine', state: 'ready', reason: null, attempt: null, retryInMs: null, logPath: null, schemaVersion: 1, hmacKeySource: 'file' };
const ev = (stream: string, seq: number) => ({ topic: 'engine.health', stream, seq, at: '2026-10-10T08:00:00.000Z', payload: health });

function setup() {
  const sent: unknown[] = [];
  const errors: unknown[] = [];
  const core = createBridgeCore({
    invoke: (r) => {
      sent.push(r);
      return Promise.resolve({ ok: true, result: null } as InvokeResult<unknown>);
    },
    reportError: (e) => errors.push(e),
  });
  return { core, sent, errors };
}

describe('bridge core (C-02)', () => {
  it('exposes invoke and subscribe only', () => {
    expect(Object.keys(setup().core.api).sort()).toEqual(['invoke', 'subscribe']);
  });

  it('refuses unknown and host-only commands locally, without IPC', async () => {
    const { core, sent } = setup();
    const raw = core.api as unknown as { invoke: (c: string, p: unknown) => Promise<InvokeResult<unknown>> };
    const invoke = (c: string, p: unknown) => raw.invoke(c, p);
    expect(await invoke('shell.exec', {})).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
    expect(await invoke('internal.clipboardText', { kind: 'report', id: 'x' })).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
    expect(await invoke('settings.set', { key: 'ui.theme', value: 'neon' })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
    expect(sent).toEqual([]);
    await core.api.invoke('settings.get', {});
    expect(sent).toEqual([{ command: 'settings.get', payload: {} }]);
  });

  it('refuses an unknown topic', () => {
    const { core } = setup();
    expect(() => core.api.subscribe('engine.secrets' as never, () => {})).toThrow(TypeError);
  });

  it('delivers events to their subscribers and stops after unsubscribe', () => {
    const { core } = setup();
    const p = fakePort();
    core.acceptPort(p.port);
    const got: number[] = [];
    const off = core.api.subscribe('engine.health', (m) => got.push(m.seq));
    p.push(ev('engine-aaaaaaaa', 1));
    p.push(ev('engine-aaaaaaaa', 2));
    off();
    p.push(ev('engine-aaaaaaaa', 3));
    expect(got).toEqual([1, 2]);
  });

  it('asks for a resync on a gap, a new engine stream, and a replaced port', () => {
    const { core } = setup();
    const resyncs: BridgeResync['reason'][] = [];
    core.api.subscribe('bridge.resync', (m) => resyncs.push(m.reason));
    const a = fakePort();
    core.acceptPort(a.port);
    a.push(ev('engine-aaaaaaaa', 1));
    a.push(ev('engine-aaaaaaaa', 3)); // 2 was lost
    a.push(ev('supervisor-bbbbbbbb', 1)); // the supervisor's own stream does not reset anything
    a.push(ev('engine-cccccccc', 1)); // a restarted engine
    const b = fakePort();
    core.acceptPort(b.port);
    expect(a.closed()).toBe(true);
    expect(resyncs).toEqual(['sequence_gap', 'stream_changed', 'port_replaced']);
  });

  it('ignores malformed port messages and survives a failing handler', () => {
    const { core, errors } = setup();
    const p = fakePort();
    core.acceptPort(p.port);
    const got: number[] = [];
    core.api.subscribe('engine.health', () => {
      throw new Error('handler bug');
    });
    core.api.subscribe('engine.health', (m) => got.push(m.seq));
    p.push('garbage');
    p.push({ topic: 'engine.exec', stream: 'engine-aaaaaaaa', seq: 1, at: 'x' });
    p.push(ev('engine-aaaaaaaa', 1));
    expect(got).toEqual([1]);
    expect(errors).toHaveLength(1);
  });
});
