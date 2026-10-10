// The IPC gateway (C-01, D-29): command filtering, payload validation, tokens minted by the main process and
// resolved into grants, previews bound to their confirmation, and the main-process commands.
import { protocolError, type CommandName, type EngineHealth, type Grants, type InvokeResult } from '@ayar/protocol';
import { describe, expect, it } from 'vitest';
import { Gateway, type EngineLink, type SystemServices } from '../src/main/gateway.ts';
import { TokenRegistry } from '../src/main/tokens.ts';

type Call = { command: CommandName; payload: unknown; grants: Grants | undefined };

function setup(o: { engine?: (c: Call) => InvokeResult<unknown>; picked?: string | null; folder?: string | null; dialogThrows?: boolean } = {}) {
  const calls: Call[] = [];
  const clipboard: string[] = [];
  let now = 0;
  let seed = 0;
  const tokens = new TokenRegistry({ randomBytes: (n) => new Uint8Array(n).fill(++seed % 250), clock: { wall: () => 1_800_000_000_000 + now, mono: () => now } });
  const health: EngineHealth = { source: 'engine', state: 'ready', reason: null, attempt: null, retryInMs: null, logPath: '/x/engine.log', schemaVersion: 1, hmacKeySource: 'file' };
  const engine: EngineLink = {
    request: (command, payload, grants) => {
      const call = { command, payload, grants };
      calls.push(call);
      return Promise.resolve(o.engine ? o.engine(call) : { ok: true, result: null });
    },
    status: () => health,
    restart: () => false,
  };
  const system: SystemServices = {
    pickFolder: () => (o.dialogThrows ? Promise.reject(new Error('dialog crashed at /Users/me/secret')) : Promise.resolve(o.picked === undefined ? '/Users/me/project' : o.picked)),
    pickDestination: () => Promise.resolve('/Users/me/out.md'),
    pickSource: () => Promise.resolve('/Users/me/profile.json'),
    writeClipboard: (t) => {
      clipboard.push(t);
      return Promise.resolve();
    },
    checkFolder: (p) => Promise.resolve(o.folder === undefined ? `/private${p}` : o.folder),
  };
  const gw = new Gateway({ engine, system, tokens });
  return { gw, calls, clipboard, advance: (ms: number) => (now += ms) };
}

const ok = <T>(r: InvokeResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.result;
};

describe('gateway: what may pass', () => {
  it('refuses malformed requests, unknown and host-only commands, and invalid payloads', async () => {
    const { gw, calls } = setup();
    expect(await gw.invoke('settings.get')).toMatchObject({ ok: false, error: { code: 'invalid_message' } });
    expect(await gw.invoke({ command: 'shell.exec', payload: {} })).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
    expect(await gw.invoke({ command: 'internal.recordCopy', payload: { kind: 'report', id: 'r', chars: 1 } })).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
    expect(await gw.invoke({ command: 'settings.set', payload: { key: 'ui.theme', value: 'neon' } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
    expect(calls).toHaveLength(0);
  });

  it('forwards a valid command and checks the result against its contract', async () => {
    const good = setup({ engine: () => ({ ok: true, result: { key: 'ui.theme', value: 'dark' } }) });
    expect(await good.gw.invoke({ command: 'settings.set', payload: { key: 'ui.theme', value: 'dark' } })).toEqual({ ok: true, result: { key: 'ui.theme', value: 'dark' } });
    const bad = setup({ engine: () => ({ ok: true, result: { key: 'ui.theme', value: 'neon' } }) });
    expect(await bad.gw.invoke({ command: 'settings.set', payload: { key: 'ui.theme', value: 'dark' } })).toMatchObject({ ok: false, error: { code: 'invalid_result' } });
  });

  it('passes engine errors through unchanged', async () => {
    const { gw } = setup({ engine: () => ({ ok: false, error: protocolError('busy') }) });
    expect(await gw.invoke({ command: 'settings.get', payload: {} })).toMatchObject({ ok: false, error: { code: 'busy' } });
  });
});

describe('gateway: path tokens (D-29: the UI never sends a path)', () => {
  it('mints a selection token after the folder dialog and resolves it once into a grant', async () => {
    const { gw, calls } = setup();
    const { selectionToken } = ok(await gw.invoke({ command: 'dialog.pickFolder', payload: { purpose: 'project.add' } })) as { selectionToken: string };
    expect(selectionToken).toMatch(/^sel_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(selectionToken)).not.toContain('/Users');
    await gw.invoke({ command: 'project.add', payload: { selectionToken } });
    expect(calls[0]).toEqual({ command: 'project.add', payload: { selectionToken }, grants: { selectionToken: { kind: 'selection', path: '/private/Users/me/project' } } });
    expect(await gw.invoke({ command: 'project.add', payload: { selectionToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
    expect(calls).toHaveLength(1);
  });

  it('reports a cancelled dialog, and refuses a folder that is not a real directory', async () => {
    expect(await setup({ picked: null }).gw.invoke({ command: 'dialog.pickFolder', payload: { purpose: 'project.add' } })).toEqual({ ok: true, result: { cancelled: true } });
    expect(await setup({ folder: null }).gw.invoke({ command: 'dialog.pickFolder', payload: { purpose: 'project.add' } })).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it('refuses a token of another kind, and an expired token', async () => {
    const { gw, advance } = setup();
    const { destinationToken } = ok(await gw.invoke({ command: 'dialog.pickDestination', payload: { purpose: 'profile.export', suggestedName: 'p.json' } })) as { destinationToken: string };
    // A destination token cannot stand in for a source token, even with its prefix rewritten.
    const forged = destinationToken.replace('dst_', 'src_');
    expect(await gw.invoke({ command: 'profile.import', payload: { projectId: 'p1', sourceToken: forged } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
    const { sourceToken } = ok(await gw.invoke({ command: 'dialog.pickSource', payload: { purpose: 'profile.import' } })) as { sourceToken: string };
    advance(5 * 60_000 + 1);
    expect(await gw.invoke({ command: 'profile.import', payload: { projectId: 'p1', sourceToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
  });

  it('binds a path token to the purpose of its dialog', async () => {
    const { gw, calls } = setup();
    const { destinationToken } = ok(await gw.invoke({ command: 'dialog.pickDestination', payload: { purpose: 'report.export', suggestedName: 'r.md' } })) as { destinationToken: string };
    expect(await gw.invoke({ command: 'profile.export', payload: { projectId: 'p1', destinationToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
    const { selectionToken } = ok(await gw.invoke({ command: 'dialog.pickFolder', payload: { purpose: 'project.relocate' } })) as { selectionToken: string };
    expect(await gw.invoke({ command: 'project.add', payload: { selectionToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
    const again = ok(await gw.invoke({ command: 'dialog.pickFolder', payload: { purpose: 'project.relocate' } })) as { selectionToken: string };
    await gw.invoke({ command: 'project.relocate', payload: { projectId: 'p1', selectionToken: again.selectionToken } });
    expect(calls.map((c) => c.command)).toEqual(['project.relocate']);
  });

  it('answers a coded internal error, without the raw message, when a system dialog fails', async () => {
    const r = await setup({ dialogThrows: true }).gw.invoke({ command: 'dialog.pickFolder', payload: { purpose: 'project.add' } });
    expect(r).toEqual({ ok: false, error: { code: 'internal', messageKey: 'errors.internal', details: {} } });
  });

  it('refuses a suggested file name that is a path', async () => {
    const { gw } = setup();
    expect(await gw.invoke({ command: 'dialog.pickDestination', payload: { purpose: 'report.export', suggestedName: '../../etc/passwd' } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
  });
});

describe('gateway: confirmations', () => {
  it('binds a preview to a single-use token for exactly that action and digest', async () => {
    const { gw, calls } = setup({
      engine: (c) => (c.command === 'setup.preview' ? { ok: true, result: { target: 'act-1', digest: 'sha256:abc', preview: { writes: ['node_modules'] } } } : { ok: true, result: { done: true } }),
    });
    const preview = ok(await gw.invoke({ command: 'setup.preview', payload: { actionId: 'act-1' } })) as { confirmationToken: string };
    expect(preview).toMatchObject({ target: 'act-1', digest: 'sha256:abc', confirmationToken: expect.stringMatching(/^cfm_/) as unknown });
    expect(await gw.invoke({ command: 'setup.execute', payload: { actionId: 'act-2', confirmationToken: preview.confirmationToken } })).toMatchObject({ ok: false, error: { code: 'confirmation_mismatch' } });
    // The failed attempt consumed it: a confirmation is good for one try only.
    expect(await gw.invoke({ command: 'setup.execute', payload: { actionId: 'act-1', confirmationToken: preview.confirmationToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });

    const again = ok(await gw.invoke({ command: 'setup.preview', payload: { actionId: 'act-1' } })) as { confirmationToken: string };
    expect(await gw.invoke({ command: 'setup.execute', payload: { actionId: 'act-1', confirmationToken: again.confirmationToken } })).toMatchObject({ ok: true });
    expect(calls.at(-1)?.grants).toEqual({ confirmationToken: { kind: 'confirmation', command: 'setup.execute', target: 'act-1', digest: 'sha256:abc' } });
  });

  it('a confirmation expires after two minutes', async () => {
    const { gw, advance } = setup({ engine: () => ({ ok: true, result: { target: 'tool-1', digest: 'd', preview: null } }) });
    const { confirmationToken } = ok(await gw.invoke({ command: 'tools.preview', payload: { toolId: 'tool-1' } })) as { confirmationToken: string };
    advance(2 * 60_000 + 1);
    expect(await gw.invoke({ command: 'tools.install', payload: { toolId: 'tool-1', confirmationToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
  });

  it('issues direct confirmations only for the destructive commands, bound to their target', async () => {
    const { gw, calls } = setup();
    const { confirmationToken } = ok(await gw.invoke({ command: 'confirm.issue', payload: { command: 'runs.delete', target: 'run-7' } })) as { confirmationToken: string };
    await gw.invoke({ command: 'runs.delete', payload: { runId: 'run-7', confirmationToken } });
    expect(calls.at(-1)?.grants).toEqual({ confirmationToken: { kind: 'confirmation', command: 'runs.delete', target: 'run-7', digest: null } });
    const purge = ok(await gw.invoke({ command: 'confirm.issue', payload: { command: 'data.purge', target: 'anything' } })) as { confirmationToken: string };
    await gw.invoke({ command: 'data.purge', payload: { confirmationToken: purge.confirmationToken } });
    expect(calls.at(-1)?.grants).toEqual({ confirmationToken: { kind: 'confirmation', command: 'data.purge', target: '*', digest: null } });
    expect(await gw.invoke({ command: 'confirm.issue', payload: { command: 'setup.execute', target: 'act-1' } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
  });
});

describe('gateway: main-process commands', () => {
  it('copies the model text the engine returns, then records the copy (G-21)', async () => {
    const { gw, calls, clipboard } = setup({
      engine: (c) => (c.command === 'internal.clipboardText' ? { ok: true, result: { text: 'FIX-20261010-001 …' } } : { ok: true, result: {} }),
    });
    expect(await gw.invoke({ command: 'clipboard.copy', payload: { kind: 'report', id: 'rep-1' } })).toEqual({ ok: true, result: { copied: true, chars: 18 } });
    expect(clipboard).toEqual(['FIX-20261010-001 …']);
    expect(calls.map((c) => c.command)).toEqual(['internal.clipboardText', 'internal.recordCopy']);
    expect(calls[1]?.payload).toEqual({ kind: 'report', id: 'rep-1', chars: 18 });
  });

  it('writes nothing to the clipboard when the engine cannot provide the text', async () => {
    const { gw, clipboard } = setup({ engine: () => ({ ok: false, error: protocolError('not_implemented') }) });
    expect(await gw.invoke({ command: 'clipboard.copy', payload: { kind: 'card', id: 't1' } })).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
    expect(clipboard).toEqual([]);
  });

  it('answers engine.status and engine.restart from the supervisor', async () => {
    const { gw } = setup();
    expect(await gw.invoke({ command: 'engine.status', payload: {} })).toMatchObject({ ok: true, result: { state: 'ready', source: 'engine' } });
    expect(await gw.invoke({ command: 'engine.restart', payload: {} })).toEqual({ ok: true, result: { accepted: false } });
  });
});
