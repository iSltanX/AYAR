import { describe, expect, it } from 'vitest';
import { checkPeerVersion, MAX_MESSAGE_DEPTH, messageDepth, parseEngineMessage, parseHostMessage, PROTOCOL_VERSION } from '../src/index.ts';
import { token, welcome } from './helpers.ts';

const hello = {
  kind: 'hello',
  protocol: PROTOCOL_VERSION,
  peer: 'desktop',
  config: { dataDir: '/Users/me/Library/Application Support/AYAR', hmacKeySource: 'file', appVersion: '0.1.0' },
};

describe('handshake (D-29)', () => {
  it('accepts the same major with any minor', () => {
    expect(checkPeerVersion({ major: 1, minor: 7 }, { major: 1, minor: 0 })).toBeNull();
  });

  it('refuses a different major with a clear coded error', () => {
    const e = checkPeerVersion({ major: 2, minor: 0 }, { major: 1, minor: 3 });
    expect(e).toEqual({ code: 'protocol_mismatch', messageKey: 'errors.protocol_mismatch', details: { expected: '1.3', received: '2.0' } });
  });
});

describe('host → engine messages', () => {
  it('accepts a valid hello', () => {
    expect(parseHostMessage(hello)).toMatchObject({ ok: true, message: { kind: 'hello', peer: 'desktop' } });
  });

  it.each([
    ['relative data dir', { ...hello, config: { ...hello.config, dataDir: 'AYAR' } }],
    ['unknown key source', { ...hello, config: { ...hello.config, hmacKeySource: 'keychain' } }],
    ['extra field', { ...hello, extra: 1 }],
    ['missing protocol', { ...hello, protocol: undefined }],
  ])('rejects a hello with %s', (_label, msg) => {
    expect(parseHostMessage(msg)).toMatchObject({ ok: false, error: { code: 'invalid_message' } });
  });

  it('accepts a valid command and defaults grants to none', () => {
    const r = parseHostMessage({ kind: 'command', id: 3, command: 'settings.set', payload: { key: 'ui.language', value: 'ar' } });
    expect(r).toEqual({ ok: true, id: 3, message: { kind: 'command', id: 3, command: 'settings.set', payload: { key: 'ui.language', value: 'ar' }, grants: {} } });
  });

  it('rejects an unknown command, keeping its id for the error response', () => {
    expect(parseHostMessage({ kind: 'command', id: 9, command: 'shell.exec', payload: {} })).toMatchObject({ ok: false, id: 9, error: { code: 'unknown_command' } });
  });

  it.each([
    ['a value outside the enum', 'settings.set', { key: 'ui.language', value: 'fr' }],
    ['an unknown setting', 'settings.set', { key: 'ui.font', value: 'x' }],
    ['an extra field', 'settings.get', { keys: ['ui.theme'], path: '/etc' }],
    ['a path instead of a token', 'project.add', { selectionToken: '/Users/me/project' }],
    ['a token of the wrong kind', 'project.add', { selectionToken: token('dst') }],
  ])('rejects %s as invalid_payload', (_label, command, payload) => {
    expect(parseHostMessage({ kind: 'command', id: 1, command, payload })).toMatchObject({ ok: false, id: 1, error: { code: 'invalid_payload' } });
  });

  it('rejects a malformed grant', () => {
    const r = parseHostMessage({
      kind: 'command', id: 1, command: 'project.add', payload: { selectionToken: token('sel') },
      grants: { selectionToken: { kind: 'selection', path: 'relative/path' } },
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_message' } });
  });

  it.each([null, 42, 'hello', [], {}, { kind: 'exec' }])('rejects %j', (raw) => {
    expect(parseHostMessage(raw)).toMatchObject({ ok: false, error: { code: 'invalid_message' } });
  });

  // G-DEV4-02: a payload nested far deeper than any contract would otherwise be walked by a recursive schema
  // (z.json() in profile references) and could exhaust the engine's stack; it is refused, with the id kept.
  it('refuses a deeply nested payload with a coded error, before any schema walks it', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 200_000; i++) deep = [deep];
    const r = parseHostMessage({ kind: 'command', id: 7, command: 'profile.update', payload: { projectId: 'p', patch: { references: { tokens: deep } } } });
    expect(r).toMatchObject({ ok: false, id: 7, error: { code: 'invalid_payload', details: { reason: 'too_deep', limit: MAX_MESSAGE_DEPTH } } });
    // A payload within the limit is still validated normally.
    let shallow: unknown = 'x';
    for (let i = 0; i < MAX_MESSAGE_DEPTH - 4; i++) shallow = [shallow];
    expect(parseHostMessage({ kind: 'command', id: 8, command: 'profile.update', payload: { projectId: 'p', patch: { references: { tokens: shallow } } } })).toMatchObject({ ok: true });
    // The whole message too (the depth is measured before the kind is even read), and messageDepth is iterative.
    expect(parseHostMessage({ kind: 'command', id: 9, command: 'settings.get', payload: {}, grants: deep })).toMatchObject({ ok: false, id: 9, error: { code: 'invalid_message', details: { reason: 'too_deep' } } });
    expect(messageDepth(deep, 10)).toBeGreaterThan(10);
    expect(messageDepth({ a: [1, { b: 2 }] })).toBe(3);
    expect(messageDepth('x')).toBe(0);
  });
});

describe('engine → host messages', () => {
  it('accepts welcome, refuse and responses', () => {
    expect(parseEngineMessage(welcome())).toMatchObject({ ok: true });
    expect(parseEngineMessage({ kind: 'refuse', protocol: PROTOCOL_VERSION, error: { code: 'protocol_mismatch', messageKey: 'errors.protocol_mismatch', details: {} } })).toMatchObject({ ok: true });
    expect(parseEngineMessage({ kind: 'response', id: 1, ok: true, result: { any: 'thing' } })).toMatchObject({ ok: true });
    expect(parseEngineMessage({ kind: 'response', id: 1, ok: false, error: { code: 'busy', messageKey: 'errors.busy', details: {} } })).toMatchObject({ ok: true });
  });

  it('rejects a response that is both ok and carries an error code it does not know', () => {
    expect(parseEngineMessage({ kind: 'response', id: 1, ok: false, error: { code: 'rm_rf', messageKey: 'errors.rm_rf', details: {} } })).toMatchObject({ ok: false });
  });

  const health = { source: 'engine', state: 'ready', reason: null, attempt: null, retryInMs: null, logPath: null, schemaVersion: 1, hmacKeySource: 'file' };
  const event = { kind: 'event', stream: 'engine-abcdef12', seq: 1, topic: 'engine.health', at: '2026-10-10T08:00:00.000Z', payload: health };

  it('accepts a numbered event whose payload matches its topic', () => {
    expect(parseEngineMessage(event)).toMatchObject({ ok: true, message: { topic: 'engine.health', seq: 1 } });
  });

  it.each([
    ['an unknown topic', { ...event, topic: 'engine.shell' }],
    ['a payload of another shape', { ...event, payload: { state: 'ready' } }],
    ['seq zero', { ...event, seq: 0 }],
    ['a local time instead of UTC', { ...event, at: '2026-10-10T11:00:00+03:00' }],
  ])('rejects an event with %s', (_label, raw) => {
    expect(parseEngineMessage(raw).ok).toBe(false);
  });
});
