// The IPC gateway (C-01, D-29): command filtering, payload validation, tokens minted by the main process and
// resolved into grants, previews bound to their confirmation, and the main-process commands.
import { protocolError, type CommandName, type EngineHealth, type Grants, type InvokeResult, type NativeMenuEntry } from '@ayar/protocol';
import { describe, expect, it } from 'vitest';
import type { DestructiveAlert } from '../src/main/destructive-alert.ts';
import { editorCommand, type EditorCommand } from '../src/main/editor-command.ts';
import { Gateway, type EngineLink, type SystemServices } from '../src/main/gateway.ts';
import { TokenRegistry } from '../src/main/tokens.ts';
import { controlsFromAppleLanguages } from '../src/main/window-controls.ts';

type Call = { command: CommandName; payload: unknown; grants: Grants | undefined };

function setup(o: { engine?: (c: Call) => InvokeResult<unknown>; picked?: string | null; folder?: string | null; dialogThrows?: boolean; confirm?: boolean; lang?: 'ar' | 'en'; menuChoice?: string | null; file?: string | null; linkAnswer?: boolean } = {}) {
  const calls: Call[] = [];
  const clipboard: string[] = [];
  const alerts: DestructiveAlert[] = [];
  const revealed: string[] = [];
  const opened: EditorCommand[] = [];
  const links: { url: string; title: string }[] = [];
  let privacyOpened = 0;
  const asked: { root: string; rel: string }[] = [];
  const menus: NativeMenuEntry[][] = [];
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
    confirmDestructive: (a) => {
      alerts.push(a);
      return Promise.resolve(o.confirm ?? true);
    },
    windowControls: () => Promise.resolve('right'),
    reveal: (p) => {
      revealed.push(p);
      return Promise.resolve();
    },
    fileInside: (root, rel) => {
      asked.push({ root, rel });
      return Promise.resolve(o.file === undefined ? `${root}/${rel}` : o.file);
    },
    openInEditor: (p) => {
      opened.push(p);
      return Promise.resolve();
    },
    popupMenu: (entries) => {
      menus.push([...entries]);
      return Promise.resolve(o.menuChoice ?? null);
    },
    appVersion: () => '0.1.0',
    openExternal: (url, confirm) => {
      links.push({ url, title: confirm.title });
      return Promise.resolve(o.linkAnswer ?? true);
    },
    openPrivacySettings: () => {
      privacyOpened++;
      return Promise.resolve();
    },
  };
  const gw = new Gateway({ engine, system, tokens, language: () => o.lang ?? 'ar', locationOf: (p) => (p.includes('/Documents/') ? 'documents' : null), home: '/private/Users/me' });
  return { gw, calls, clipboard, alerts, revealed, opened, asked, menus, links, privacy: () => privacyOpened, advance: (ms: number) => (now += ms) };
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

/** A setup.execute result that keeps the contract of protocol 1.2 (SetupExecuteResult). */
const SETUP_DONE = {
  action: {
    id: 'act-1',
    projectId: 'p1',
    kind: 'install_dependencies',
    instances: [],
    title: { key: 'setup.action.installDependencies' },
    target: { tool: 'npm', version: null, requiredSpec: null, ecosystem: 'npm', component: '.' },
    preview: { command: ['npm', 'ci'], cwd: '.', network: { host: 'registry.npmjs.org', url: 'https://registry.npmjs.org/' }, sizeBytes: null, writes: [{ location: 'project', path: 'node_modules' }], runsScripts: true, warnings: [] },
    state: 'done',
    resultReasons: [],
    confirmedAt: null,
    finishedAt: null,
  },
  readiness: [],
  log: null,
  install: null,
};

describe('gateway: confirmations', () => {
  it('binds a preview to a single-use token for exactly that action and digest', async () => {
    const { gw, calls } = setup({
      engine: (c) => (c.command === 'setup.preview' ? { ok: true, result: { target: 'act-1', digest: 'sha256:abc', preview: { writes: ['node_modules'] } } } : { ok: true, result: SETUP_DONE }),
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

  it('asks in a native alert first (D-DEV3-15): «ألغِ» issues nothing, and the alert names what goes', async () => {
    const cancelled = setup({ confirm: false, engine: (c) => (c.command === 'project.get' ? { ok: true, result: { project: { displayName: 'متجر الورد' } } } : { ok: true, result: null }) });
    expect(await cancelled.gw.invoke({ command: 'confirm.issue', payload: { command: 'project.remove', target: 'prj-1' } })).toEqual({ ok: true, result: { cancelled: true } });
    expect(cancelled.alerts).toEqual([{ title: 'أزل «متجر الورد» من عِيَار؟', detail: expect.stringContaining('لن يُمس المستودع') as unknown, confirm: 'أزل', cancel: 'ألغِ' }]);
    // Nothing was minted: the command cannot run without a token.
    expect(cancelled.calls.map((c) => c.command)).toEqual(['project.get']);
    const english = setup({ lang: 'en' });
    const r = ok(await english.gw.invoke({ command: 'confirm.issue', payload: { command: 'tools.remove', target: 'gitleaks' } })) as { confirmationToken: string };
    expect(r.confirmationToken).toMatch(/^cfm_/);
    expect(english.alerts[0]).toMatchObject({ confirm: expect.any(String) as unknown, cancel: expect.any(String) as unknown });
    expect(english.alerts[0]?.title).toContain('gitleaks');
    expect(english.alerts[0]?.cancel).not.toBe('ألغِ');
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

describe('gateway: the screens\u2019 main-process commands (protocol 1.6)', () => {
  const project = { id: 'prj_1', rootPath: '/Users/me/مشاريع/رصد' };
  const engine = (c: Call): InvokeResult<unknown> => {
    if (c.command === 'project.get') return { ok: true, result: { project, snapshot: null } };
    if (c.command === 'finding.get') return { ok: true, result: { finding: { runId: 'run_1', location: { path: 'src/a.ts', line: 3 } }, history: [] } };
    if (c.command === 'run.get') return { ok: true, result: { run: { projectId: 'prj_1' } } };
    return { ok: false, error: protocolError('not_found') };
  };

  it('window.layout answers the window buttons\u2019 corner (D-54)', async () => {
    const { gw } = setup();
    expect(await gw.invoke({ command: 'window.layout', payload: {} })).toEqual({ ok: true, result: { controls: 'right' } });
  });

  it('project.reveal shows the project\u2019s real root in Finder, from its id alone', async () => {
    const { gw, revealed } = setup({ engine });
    expect(await gw.invoke({ command: 'project.reveal', payload: { projectId: 'prj_1' } })).toEqual({ ok: true, result: { revealed: true } });
    expect(revealed).toEqual([project.rootPath]);
    expect(await gw.invoke({ command: 'project.reveal', payload: { projectId: 'prj_1', path: '/etc' } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
  });

  it('editor.open resolves the finding\u2019s file inside its project\u2019s root, and refuses one outside it', async () => {
    const good = setup({ engine });
    expect(await good.gw.invoke({ command: 'editor.open', payload: { findingId: 'fnd_1' } })).toEqual({ ok: true, result: { opened: true } });
    expect(good.asked).toEqual([{ root: project.rootPath, rel: 'src/a.ts' }]);
    expect(good.opened).toEqual([{ program: '/usr/bin/open', args: ['-t', `${project.rootPath}/src/a.ts`] }]);
    const escaped = setup({ engine, file: null });
    expect(await escaped.gw.invoke({ command: 'editor.open', payload: { findingId: 'fnd_1' } })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(escaped.opened).toEqual([]);
    const outside = setup({ engine: (c) => (c.command === 'finding.get' ? { ok: true, result: { finding: { runId: 'run_1', location: { path: '/etc/passwd', outside: true } }, history: [] } } : engine(c)) });
    expect(await outside.gw.invoke({ command: 'editor.open', payload: { findingId: 'fnd_1' } })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(outside.asked).toEqual([]);
  });

  it('editor.open runs the editor template of the settings, with the file and its line, without a shell (E-17)', async () => {
    const templated = setup({ engine: (c) => (c.command === 'settings.get' ? { ok: true, result: { values: { 'editor.template': 'code --goto {file}:{line}' } } } : engine(c)) });
    expect(await templated.gw.invoke({ command: 'editor.open', payload: { findingId: 'fnd_1' } })).toEqual({ ok: true, result: { opened: true } });
    expect(templated.opened).toEqual([{ program: 'code', args: ['--goto', `${project.rootPath}/src/a.ts:3`] }]);
    // The pure split: words, {file} and {line} wherever they are, no template or one without {file}: open -t.
    expect(editorCommand('zed {file}:{line}', '/p/a b.ts', 7)).toEqual({ program: 'zed', args: ['/p/a b.ts:7'] });
    expect(editorCommand(null, '/p/a.ts', 3)).toEqual({ program: '/usr/bin/open', args: ['-t', '/p/a.ts'] });
    expect(editorCommand('code --wait', '/p/a.ts', 3)).toEqual({ program: '/usr/bin/open', args: ['-t', '/p/a.ts'] });
  });

  it('about.get names the version and the repository, and about.openRepository opens it only after the native confirmation (D-DEV12-02, 15.2)', async () => {
    const yes = setup();
    expect(await yes.gw.invoke({ command: 'about.get', payload: {} })).toEqual({ ok: true, result: { version: '0.1.0', repository: 'https://github.com/iSltanX/AYAR' } });
    expect(await yes.gw.invoke({ command: 'about.openRepository', payload: {} })).toEqual({ ok: true, result: { opened: true } });
    expect(yes.links).toEqual([{ url: 'https://github.com/iSltanX/AYAR', title: 'افتح الرابط في المتصفح؟' }]);
    const no = setup({ linkAnswer: false });
    expect(await no.gw.invoke({ command: 'about.openRepository', payload: {} })).toEqual({ ok: true, result: { opened: false } });
    // The page cannot hand the main process an address of its own.
    expect(await no.gw.invoke({ command: 'about.openRepository', payload: { url: 'https://evil.example' } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
    expect(await yes.gw.invoke({ command: 'system.openPrivacySettings', payload: {} })).toEqual({ ok: true, result: { opened: true } });
    expect(yes.privacy()).toBe(1);
  });

  it('menu.popup shows the native menu and returns only an enabled item the renderer offered', async () => {
    const entries: NativeMenuEntry[] = [
      { kind: 'item', id: 'project.open', label: 'افتح', enabled: true },
      { kind: 'separator' },
      { kind: 'item', id: 'project.remove', label: 'أزل من عِيَار…', enabled: false },
    ];
    const chosen = setup({ menuChoice: 'project.open' });
    expect(await chosen.gw.invoke({ command: 'menu.popup', payload: { entries } })).toEqual({ ok: true, result: { id: 'project.open' } });
    expect(chosen.menus).toEqual([entries]);
    expect(await setup({ menuChoice: 'project.remove' }).gw.invoke({ command: 'menu.popup', payload: { entries } })).toEqual({ ok: true, result: { id: null } });
    expect(await setup({ menuChoice: 'shell.exec' }).gw.invoke({ command: 'menu.popup', payload: { entries } })).toEqual({ ok: true, result: { id: null } });
    expect(await setup().gw.invoke({ command: 'menu.popup', payload: { entries } })).toEqual({ ok: true, result: { id: null } });
    expect(await setup().gw.invoke({ command: 'menu.popup', payload: { entries: [] } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
  });

  it('clipboard.copyText writes a short visible text, never asking the engine, and refuses control characters', async () => {
    const { gw, calls, clipboard } = setup();
    expect(await gw.invoke({ command: 'clipboard.copyText', payload: { text: 'beh.unit' } })).toEqual({ ok: true, result: { copied: true } });
    expect(await gw.invoke({ command: 'clipboard.copyText', payload: { text: 'npm run test\n--watch=false' } })).toEqual({ ok: true, result: { copied: true } });
    expect(clipboard).toEqual(['beh.unit', 'npm run test\n--watch=false']);
    expect(calls).toEqual([]);
    for (const text of ['', 'a\u001b[31mred', 'x'.repeat(4097), 'a\rb'])
      expect(await gw.invoke({ command: 'clipboard.copyText', payload: { text } })).toMatchObject({ ok: false, error: { code: 'invalid_payload' } });
    expect(clipboard).toHaveLength(2);
  });
});

describe('gateway: a dropped folder (C-01 «السحب والإفلات»)', () => {
  it('turns one real directory into a selection token for project.add, as the folder dialog does', async () => {
    const { gw, calls } = setup();
    const drop = await gw.resolveDrop(['/Users/me/مشاريع تجريبية/مكتبة «النصوص»']);
    expect(drop).toMatchObject({ ok: true, location: null, display: '~/مشاريع تجريبية/مكتبة «النصوص»' });
    expect(await gw.resolveDrop(['/Users/me/Documents/rasd'])).toMatchObject({ ok: true, location: 'documents', display: '~/Documents/rasd' });
    const token = (drop as { selectionToken: string }).selectionToken;
    expect(token).toMatch(/^sel_[A-Za-z0-9_-]{43}$/);
    await gw.invoke({ command: 'project.add', payload: { selectionToken: token } });
    expect(calls[0]!.grants).toEqual({ selectionToken: { kind: 'selection', path: '/private/Users/me/مشاريع تجريبية/مكتبة «النصوص»' } });
    // Redeemed once, and only by project.add.
    expect(await gw.invoke({ command: 'project.add', payload: { selectionToken: token } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
    const again = (await gw.resolveDrop(['/Users/me/x'])) as { selectionToken: string };
    expect(await gw.invoke({ command: 'project.relocate', payload: { projectId: 'prj_1', selectionToken: again.selectionToken } })).toMatchObject({ ok: false, error: { code: 'token_invalid' } });
  });

  it('refuses a file or a link, several items, and nothing at all, minting nothing', async () => {
    expect(await setup({ folder: null }).gw.resolveDrop(['/Users/me/file.txt'])).toEqual({ ok: false, reason: 'not_a_directory' });
    expect(await setup().gw.resolveDrop(['/a', '/b'])).toEqual({ ok: false, reason: 'multiple' });
    expect(await setup().gw.resolveDrop([])).toEqual({ ok: false, reason: 'no_path' });
    expect(await setup().gw.resolveDrop(['relative/path', ''])).toEqual({ ok: false, reason: 'no_path' });
  });
});

describe('window buttons corner (D-54, E-23)', () => {
  it('follows the first language of the global AppleLanguages list', () => {
    expect(controlsFromAppleLanguages('(\n    "ar-SA",\n    "en-SA"\n)\n')).toBe('right');
    expect(controlsFromAppleLanguages('(\n    "en-US",\n    "ar"\n)\n')).toBe('left');
    expect(controlsFromAppleLanguages('(\n    he\n)')).toBe('right');
    expect(controlsFromAppleLanguages('')).toBe('left');
  });
});
