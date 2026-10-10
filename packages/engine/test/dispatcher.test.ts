// C-04: the dispatcher's validation and permissions.
import { protocolError } from '@ayar/protocol';
import { describe, expect, it } from 'vitest';
import { Dispatcher, type HandlerTable, type ServiceState } from '../src/host/dispatcher.ts';
import { CommandError } from '../src/host/errors.ts';
import { EventBus } from '../src/host/event-bus.ts';
import { RunGate } from '../src/host/run-gate.ts';
import { StorageError } from '../src/storage/errors.ts';
import type { Db } from '../src/storage/db.ts';
import { fakeClock } from './support/tmp.ts';

const logger = { log: () => {}, flush: () => {} };
const ready: ServiceState = {
  kind: 'ready',
  context: {
    db: {} as Db,
    clock: fakeClock(),
    logger,
    events: new EventBus({ stream: 'engine-abcdef', clock: fakeClock(), send: () => {} }),
    runGate: new RunGate(),
    hmacKey: { source: 'test', key: new Uint8Array(32), fingerprint: 'x', created: false },
  },
};
const cmd = (command: string, payload: unknown, grants = {}) => ({ kind: 'command' as const, id: 7, command: command as never, payload, grants });
const make = (handlers: HandlerTable, state: ServiceState = ready) => new Dispatcher(handlers, () => state, () => logger);
const token = `cfm_${'A'.repeat(43)}`;

describe('dispatcher', () => {
  it('runs a handler and validates its result', async () => {
    const d = make({ 'settings.set': (p) => p });
    const r = await d.dispatch(cmd('settings.set', { key: 'ui.theme', value: 'dark' }));
    expect(r).toEqual({ response: { kind: 'response', id: 7, ok: true, result: { key: 'ui.theme', value: 'dark' } }, crash: null });
  });

  it('refuses setup.execute without a valid confirmation grant (C-04)', async () => {
    const d = make({ 'setup.execute': () => ({ done: true }) });
    const payload = { actionId: 'a1', confirmationToken: token };
    expect((await d.dispatch(cmd('setup.execute', payload))).response).toMatchObject({ ok: false, error: { code: 'grant_missing' } });
    const wrong = { confirmationToken: { kind: 'confirmation', command: 'setup.execute', target: 'a2', digest: 'd' } };
    expect((await d.dispatch(cmd('setup.execute', payload, wrong))).response).toMatchObject({ ok: false, error: { code: 'confirmation_mismatch' } });
    const right = { confirmationToken: { kind: 'confirmation', command: 'setup.execute', target: 'a1', digest: 'd' } };
    expect((await d.dispatch(cmd('setup.execute', payload, right))).response).toMatchObject({ ok: true });
  });

  it('answers not_implemented with the phase that will implement the command', async () => {
    expect((await make({}).dispatch(cmd('project.list', {}))).response).toMatchObject({ ok: false, error: { code: 'not_implemented', details: { command: 'project.list', implementedIn: 'DEV-4' } } });
  });

  it('refuses commands the main process executes', async () => {
    expect((await make({}).dispatch(cmd('dialog.pickFolder', { purpose: 'project.add' }))).response).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
  });

  it('reports why the engine cannot serve (degraded or starting)', async () => {
    const d = make({ 'settings.get': () => ({ values: {} }) }, { kind: 'unavailable', error: protocolError('db_newer_than_app') });
    expect((await d.dispatch(cmd('settings.get', {}))).response).toMatchObject({ ok: false, error: { code: 'db_newer_than_app' } });
  });

  it('turns expected failures into coded responses', async () => {
    const d = make({ 'settings.get': () => { throw new CommandError('busy'); }, 'settings.set': () => { throw new StorageError('db_corrupt', 'x'); } });
    expect((await d.dispatch(cmd('settings.get', {}))).response).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect((await d.dispatch(cmd('settings.set', { key: 'ui.theme', value: 'dark' }))).response).toMatchObject({ ok: false, error: { code: 'db_corrupt' } });
  });

  it('answers internal and asks for a crash on an unexpected exception (C-04)', async () => {
    const d = make({ 'settings.get': () => { throw new TypeError('unexpected'); } });
    const r = await d.dispatch(cmd('settings.get', {}));
    expect(r.response).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(r.crash).toBeInstanceOf(TypeError);
  });

  it('never returns a result that breaks the command contract', async () => {
    const d = make({ 'settings.set': () => ({ key: 'ui.theme', value: 'neon' }) });
    expect((await d.dispatch(cmd('settings.set', { key: 'ui.theme', value: 'dark' }))).response).toMatchObject({ ok: false, error: { code: 'invalid_result' } });
  });
});
