import { describe, expect, it } from 'vitest';
import { ProtocolClient, ProtocolFailure, PROTOCOL_VERSION } from '../src/index.ts';
import { fakeTransport, welcome } from './helpers.ts';

const config = { dataDir: '/tmp/ayar-test', hmacKeySource: 'test', appVersion: '0.1.0' } as const;

async function connected() {
  const end = fakeTransport();
  const events: unknown[] = [];
  const invalid: unknown[] = [];
  const client = new ProtocolClient(end.transport, { onEvent: (e) => events.push(e), onInvalid: (e) => invalid.push(e) });
  const hs = client.handshake('cli', config);
  end.deliver(welcome());
  await hs;
  return { end, client, events, invalid };
}

describe('ProtocolClient', () => {
  it('sends hello with its version and resolves on a compatible welcome', async () => {
    const { end, client } = await connected();
    expect(end.sent[0]).toEqual({ kind: 'hello', protocol: PROTOCOL_VERSION, peer: 'cli', config });
    expect(client.welcome?.engine.pid).toBe(42);
  });

  it('stops the connection when the engine refuses the version', async () => {
    const end = fakeTransport();
    const client = new ProtocolClient(end.transport);
    const hs = client.handshake('cli', config);
    end.deliver({ kind: 'refuse', protocol: { major: 2, minor: 0 }, error: { code: 'protocol_mismatch', messageKey: 'errors.protocol_mismatch', details: { expected: '2.0', received: '1.0' } } });
    await expect(hs).rejects.toBeInstanceOf(ProtocolFailure);
    await expect(hs).rejects.toMatchObject({ error: { code: 'protocol_mismatch' } });
    expect(client.closed).toBe(true);
  });

  it('checks the version itself: a welcome with another major is refused', async () => {
    const end = fakeTransport();
    const client = new ProtocolClient(end.transport);
    const hs = client.handshake('cli', config);
    end.deliver(welcome(2));
    await expect(hs).rejects.toMatchObject({ error: { code: 'protocol_mismatch', details: { expected: '1.0', received: '2.0' } } });
    expect(client.closed).toBe(true);
  });

  it('does not send commands before the handshake', async () => {
    const end = fakeTransport();
    const client = new ProtocolClient(end.transport);
    await expect(client.request('settings.get', {})).resolves.toMatchObject({ ok: false, error: { code: 'engine_starting' } });
    expect(end.sent).toHaveLength(0);
  });

  it('correlates responses by id and validates each result against its command', async () => {
    const { end, client } = await connected();
    const a = client.request('settings.set', { key: 'ui.theme', value: 'dark' });
    const b = client.request('settings.get', {});
    const [, cmdA, cmdB] = end.sent as { id: number }[];
    end.deliver({ kind: 'response', id: cmdB!.id, ok: true, result: { values: { 'ui.theme': 'dark' } } });
    end.deliver({ kind: 'response', id: cmdA!.id, ok: true, result: { key: 'ui.theme', value: 'dark' } });
    await expect(a).resolves.toEqual({ ok: true, result: { key: 'ui.theme', value: 'dark' } });
    await expect(b).resolves.toEqual({ ok: true, result: { values: { 'ui.theme': 'dark' } } });
  });

  it('turns a result that breaks its contract into invalid_result', async () => {
    const { end, client } = await connected();
    const r = client.request('settings.set', { key: 'ui.theme', value: 'dark' });
    end.deliver({ kind: 'response', id: (end.sent[1] as { id: number }).id, ok: true, result: { key: 'ui.theme', value: 'neon' } });
    await expect(r).resolves.toMatchObject({ ok: false, error: { code: 'invalid_result' } });
  });

  it('delivers valid events and drops invalid ones', async () => {
    const { end, events, invalid } = await connected();
    const payload = { source: 'engine', state: 'ready', reason: null, attempt: null, retryInMs: null, logPath: null, schemaVersion: 1, hmacKeySource: 'test' };
    end.deliver({ kind: 'event', stream: 'engine-abcdef12', seq: 1, topic: 'engine.health', at: '2026-10-10T08:00:00.000Z', payload });
    end.deliver({ kind: 'event', stream: 'engine-abcdef12', seq: 2, topic: 'engine.health', at: '2026-10-10T08:00:00.000Z', payload: { state: 'ready' } });
    end.deliver({ kind: 'nonsense' });
    expect(events).toHaveLength(1);
    expect(invalid).toHaveLength(2);
  });

  it('fails pending requests when the engine goes away, and refuses new ones', async () => {
    const { end, client } = await connected();
    const r = client.request('settings.get', {});
    end.close();
    await expect(r).resolves.toMatchObject({ ok: false, error: { code: 'engine_unavailable' } });
    await expect(client.request('settings.get', {})).resolves.toMatchObject({ ok: false, error: { code: 'engine_unavailable' } });
  });

  it('reports a response to an unknown id as invalid', async () => {
    const { end, invalid } = await connected();
    end.deliver({ kind: 'response', id: 999, ok: true, result: null });
    expect(invalid).toHaveLength(1);
  });
});
