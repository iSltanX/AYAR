// The IPC gateway (C-01, D-29): every renderer request passes here after the sender check. It accepts only
// renderer commands, validates the payload, runs the main-process commands itself (system dialogs, tokens,
// clipboard, supervisor), resolves tokens into grants for the engine, validates what comes back, and mints
// the confirmation token of a preview. It imports no electron: SystemServices and EngineLink are injected.
import {
  COMMANDS,
  commandDefinition,
  ConfirmablePreview,
  confirmationTarget,
  describeIssues,
  isRendererCommand,
  parseCommandPayload,
  protocolError,
  type CommandName,
  type CommandPayload,
  type EngineHealth,
  type Grants,
  type BridgeDrop,
  type InvokeResult,
  type NativeMenuEntry,
  type ProtectedLocation,
  type ProtocolError,
  z,
} from '@ayar/protocol';
import type { Lang } from '@ayar/i18n';
import { destructiveAlert, type DestructiveAlert } from './destructive-alert.ts';
import type { TokenRegistry } from './tokens.ts';

export interface SystemServices {
  /** A folder the user picked in the system dialog, or null when cancelled. */
  pickFolder(purpose: string): Promise<string | null>;
  pickDestination(purpose: string, suggestedName: string): Promise<string | null>;
  pickSource(purpose: string): Promise<string | null>;
  writeClipboard(text: string): Promise<void>;
  /** The real path of a directory that is not a symbolic link, or null (C-01: checks on a picked folder). */
  checkFolder(path: string): Promise<string | null>;
  /** D-DEV3-15: a native alert attached to the window; true only when the user clicked its confirm button. */
  confirmDestructive(alert: DestructiveAlert): Promise<boolean>;
  /** D-54 (E-23): the corner of the window buttons, from the system's first language in its global preferences. */
  windowControls(): Promise<'left' | 'right'>;
  /** 13.3 «أظهر في Finder». */
  reveal(path: string): Promise<void>;
  /** The real path of a regular file inside the real root, or null (a link out of it, `..`, a folder, nothing). */
  fileInside(root: string, relative: string): Promise<string | null>;
  /** E-17's default: the file in the default text editor (`open -t`). */
  openInEditor(path: string): Promise<void>;
  /** D-DES3-07: a native context menu; the chosen item's id, or null. */
  popupMenu(entries: readonly NativeMenuEntry[], at?: { x: number; y: number }): Promise<string | null>;
}

export interface EngineLink {
  request(command: CommandName, payload: unknown, grants?: Grants): Promise<InvokeResult<unknown>>;
  status(): EngineHealth;
  restart(): boolean;
}

export interface GatewayOptions {
  engine: EngineLink;
  system: SystemServices;
  tokens: TokenRegistry;
  /** The language of the native texts (the system's, like the menus). */
  language?: () => Lang;
  /** The protected location of a real path (E-05): the engine's own rule, injected (FR-59). */
  locationOf?: (realPath: string) => ProtectedLocation | null;
  /** The user's home, to show a dropped folder as «~/…» in the permission sheet (D-DEV11-04). */
  home?: string;
  log?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, string | number | boolean | null>) => void;
}

const InvokeRequest = z.strictObject({ command: z.string().min(1).max(64), payload: z.unknown() });

const fail = (error: ProtocolError): InvokeResult<never> => ({ ok: false, error });

export class Gateway {
  readonly #o: GatewayOptions;

  constructor(o: GatewayOptions) {
    this.#o = o;
  }

  /** Never throws: an unexpected failure (a dialog, the clipboard) becomes a coded `internal` answer. */
  async invoke(raw: unknown): Promise<InvokeResult<unknown>> {
    try {
      return await this.#invoke(raw);
    } catch (e) {
      this.#o.log?.('error', 'gateway failure', { error: e instanceof Error ? e.message : String(e) });
      return fail(protocolError('internal'));
    }
  }

  async #invoke(raw: unknown): Promise<InvokeResult<unknown>> {
    const req = InvokeRequest.safeParse(raw);
    if (!req.success) return fail(protocolError('invalid_message', { issues: describeIssues(req.error) }));
    const { command } = req.data;
    if (!isRendererCommand(command)) {
      this.#o.log?.('warn', 'renderer asked for a command it may not send', { command: command.slice(0, 64) });
      return fail(protocolError('unknown_command', { command: command.slice(0, 64) }));
    }
    const parsed = parseCommandPayload(command, req.data.payload);
    if (!parsed.ok) return fail(parsed.error);
    const def = commandDefinition(command);
    const out = def.handler === 'main' ? await this.#main(command, parsed.payload) : await this.#forward(command, parsed.payload);
    if (!out.ok) return out;
    const expected = def.rendererResult ?? def.result;
    const checked = expected.safeParse(out.result);
    if (!checked.success) {
      this.#o.log?.('error', 'result broke its contract', { command });
      return fail(protocolError('invalid_result', { command }));
    }
    return { ok: true, result: checked.data };
  }

  async #forward(command: CommandName, payload: unknown): Promise<InvokeResult<unknown>> {
    const def = commandDefinition(command);
    const grants: Grants = {};
    for (const req of def.grants) {
      const token = (payload as Record<string, unknown>)[req.field];
      // A path token is redeemed only by the command its dialog was opened for (the purposes are those names).
      const grant = this.#o.tokens.consume(token, req.kind, req.kind === 'confirmation' ? null : command);
      if (!grant) return fail(protocolError('token_invalid', { command, field: req.field }));
      if (req.kind === 'confirmation' && grant.kind === 'confirmation') {
        if (grant.command !== command || grant.target !== confirmationTarget(req.targetField, payload)) {
          return fail(protocolError('confirmation_mismatch', { command, field: req.field }));
        }
      }
      grants[req.field] = grant;
    }
    const res = await this.#o.engine.request(command, payload, grants);
    if (!res.ok || !def.confirms) return res;
    // A preview: bind a single-use confirmation to exactly what was shown (target and digest).
    const preview = ConfirmablePreview.safeParse(res.result);
    if (!preview.success) return fail(protocolError('invalid_result', { command }));
    const confirmationToken = this.#o.tokens.issue({ kind: 'confirmation', command: def.confirms, target: preview.data.target, digest: preview.data.digest });
    return { ok: true, result: { ...preview.data, confirmationToken } };
  }

  /** What the alert names: the project's display name, the tool, the number of runs. */
  async #subject(command: CommandPayload<'confirm.issue'>['command'], id: string): Promise<{ name?: string; count?: number }> {
    if (command === 'project.remove') {
      const r = await this.#o.engine.request('project.get', { projectId: id });
      const name = r.ok ? (r.result as { project?: { displayName?: unknown } }).project?.displayName : undefined;
      return { name: typeof name === 'string' ? name : id };
    }
    if (command === 'tools.remove') return { name: id };
    if (command === 'runs.delete') return { count: 1 };
    return {};
  }

  /**
   * A folder dropped on the window or the Dock icon (C-01 «السحب والإفلات», protocol 1.6): one directory that is not a
   * symbolic link, checked like a picked folder, becomes a selection token for project.add. The page gets the token.
   */
  async resolveDrop(paths: readonly string[]): Promise<BridgeDrop> {
    const usable = paths.filter((p) => typeof p === 'string' && p.startsWith('/') && !p.includes('\0'));
    if (usable.length === 0) return { ok: false, reason: 'no_path' };
    if (usable.length > 1) return { ok: false, reason: 'multiple' };
    const real = await this.#o.system.checkFolder(usable[0]!);
    if (real === null) return { ok: false, reason: 'not_a_directory' };
    const home = this.#o.home;
    const display = home && (real === home || real.startsWith(`${home}/`)) ? `~${real.slice(home.length)}` : real;
    return { ok: true, selectionToken: this.#o.tokens.issue({ kind: 'selection', path: real }, 'project.add'), location: this.#o.locationOf?.(real) ?? null, display };
  }

  /** The project's real root, from the engine (the UI names the project by id only). */
  async #projectRoot(projectId: string): Promise<InvokeResult<string>> {
    const r = await this.#o.engine.request('project.get', { projectId });
    if (!r.ok) return r;
    const root = (r.result as { project?: { rootPath?: unknown } }).project?.rootPath;
    return typeof root === 'string' && root.startsWith('/') ? { ok: true, result: root } : fail(protocolError('not_found', { reason: 'project' }));
  }

  async #main(command: CommandName, payload: unknown): Promise<InvokeResult<unknown>> {
    const { system, tokens, engine } = this.#o;
    switch (command) {
      case 'dialog.pickFolder': {
        const { purpose } = payload as CommandPayload<'dialog.pickFolder'>;
        const picked = await system.pickFolder(purpose);
        if (picked === null) return { ok: true, result: { cancelled: true } };
        const real = await system.checkFolder(picked);
        if (real === null) return fail(protocolError('not_found', { reason: 'not_a_directory' }));
        return { ok: true, result: { selectionToken: tokens.issue({ kind: 'selection', path: real }, purpose) } };
      }
      case 'dialog.pickDestination': {
        const { purpose, suggestedName } = payload as CommandPayload<'dialog.pickDestination'>;
        const picked = await system.pickDestination(purpose, suggestedName);
        if (picked === null) return { ok: true, result: { cancelled: true } };
        return { ok: true, result: { destinationToken: tokens.issue({ kind: 'destination', path: picked }, purpose) } };
      }
      case 'dialog.pickSource': {
        const { purpose } = payload as CommandPayload<'dialog.pickSource'>;
        const picked = await system.pickSource(purpose);
        if (picked === null) return { ok: true, result: { cancelled: true } };
        return { ok: true, result: { sourceToken: tokens.issue({ kind: 'source', path: picked }, purpose) } };
      }
      case 'confirm.issue': {
        const { command: target, target: id } = payload as CommandPayload<'confirm.issue'>;
        // D-DEV3-15: the user answers in the main process's own alert; a compromised renderer cannot click it.
        const alert = destructiveAlert(this.#o.language?.() ?? 'ar', target, await this.#subject(target, id));
        if (!(await system.confirmDestructive(alert))) return { ok: true, result: { cancelled: true } };
        const bound = COMMANDS[target].grants.find((g) => g.kind === 'confirmation');
        const targetValue = bound && bound.kind === 'confirmation' && bound.targetField === null ? '*' : id;
        return { ok: true, result: { confirmationToken: tokens.issue({ kind: 'confirmation', command: target, target: targetValue, digest: null }) } };
      }
      case 'window.layout':
        return { ok: true, result: { controls: await system.windowControls() } };
      case 'project.reveal': {
        const root = await this.#projectRoot((payload as CommandPayload<'project.reveal'>).projectId);
        if (!root.ok) return root;
        await system.reveal(root.result);
        return { ok: true, result: { revealed: true } };
      }
      case 'editor.open': {
        // The finding names its file relative to the project; the main process finds the project through the run,
        // resolves the file inside the real root, and opens it. A path outside the root is never opened (C-15).
        const found = await engine.request('finding.get', { findingId: (payload as CommandPayload<'editor.open'>).findingId });
        if (!found.ok) return found;
        const finding = (found.result as { finding: { runId: string; location: { path: string | null; outside?: boolean } | null } }).finding;
        const rel = finding.location?.path;
        if (!rel || finding.location?.outside) return fail(protocolError('not_found', { reason: 'no_file' }));
        const run = await engine.request('run.get', { runId: finding.runId });
        if (!run.ok) return run;
        const root = await this.#projectRoot((run.result as { run: { projectId: string } }).run.projectId);
        if (!root.ok) return root;
        const file = await system.fileInside(root.result, rel);
        if (file === null) return fail(protocolError('not_found', { reason: 'no_file' }));
        await system.openInEditor(file);
        return { ok: true, result: { opened: true } };
      }
      case 'menu.popup': {
        const { entries, x, y } = payload as CommandPayload<'menu.popup'>;
        const id = await system.popupMenu(entries, x !== undefined && y !== undefined ? { x, y } : undefined);
        // Only an id the renderer offered, and only an enabled item, comes back.
        const offered = entries.some((e) => e.kind === 'item' && e.enabled && e.id === id);
        return { ok: true, result: { id: offered ? id : null } };
      }
      case 'engine.status':
        return { ok: true, result: engine.status() };
      case 'engine.restart':
        return { ok: true, result: { accepted: engine.restart() } };
      case 'clipboard.copyText': {
        const { text } = payload as CommandPayload<'clipboard.copyText'>;
        await system.writeClipboard(text);
        return { ok: true, result: { copied: true } };
      }
      case 'clipboard.copy': {
        // FR-44: always the model format, fetched from the engine; then the copy is recorded (G-21).
        const { kind, id } = payload as CommandPayload<'clipboard.copy'>;
        const text = await engine.request('internal.clipboardText', { kind, id });
        if (!text.ok) return text;
        const { text: value } = text.result as { text: string };
        await system.writeClipboard(value);
        const recorded = await engine.request('internal.recordCopy', { kind, id, chars: value.length });
        if (!recorded.ok) this.#o.log?.('error', 'copy not recorded', { code: recorded.error.code });
        return { ok: true, result: { copied: true, chars: value.length } };
      }
      default:
        return fail(protocolError('unknown_command', { command }));
    }
  }
}
