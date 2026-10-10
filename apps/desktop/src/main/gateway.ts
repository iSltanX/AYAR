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
  type InvokeResult,
  type ProtocolError,
  z,
} from '@ayar/protocol';
import type { TokenRegistry } from './tokens.ts';

export interface SystemServices {
  /** A folder the user picked in the system dialog, or null when cancelled. */
  pickFolder(purpose: string): Promise<string | null>;
  pickDestination(purpose: string, suggestedName: string): Promise<string | null>;
  pickSource(purpose: string): Promise<string | null>;
  writeClipboard(text: string): Promise<void>;
  /** The real path of a directory that is not a symbolic link, or null (C-01: checks on a picked folder). */
  checkFolder(path: string): Promise<string | null>;
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
  log?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, string | number | boolean | null>) => void;
}

const InvokeRequest = z.strictObject({ command: z.string().min(1).max(64), payload: z.unknown() });

const fail = (error: ProtocolError): InvokeResult<never> => ({ ok: false, error });

export class Gateway {
  readonly #o: GatewayOptions;

  constructor(o: GatewayOptions) {
    this.#o = o;
  }

  async invoke(raw: unknown): Promise<InvokeResult<unknown>> {
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
      const grant = this.#o.tokens.consume(token, req.kind);
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

  async #main(command: CommandName, payload: unknown): Promise<InvokeResult<unknown>> {
    const { system, tokens, engine } = this.#o;
    switch (command) {
      case 'dialog.pickFolder': {
        const { purpose } = payload as CommandPayload<'dialog.pickFolder'>;
        const picked = await system.pickFolder(purpose);
        if (picked === null) return { ok: true, result: { cancelled: true } };
        const real = await system.checkFolder(picked);
        if (real === null) return fail(protocolError('not_found', { reason: 'not_a_directory' }));
        return { ok: true, result: { selectionToken: tokens.issue({ kind: 'selection', path: real }) } };
      }
      case 'dialog.pickDestination': {
        const { purpose, suggestedName } = payload as CommandPayload<'dialog.pickDestination'>;
        const picked = await system.pickDestination(purpose, suggestedName);
        if (picked === null) return { ok: true, result: { cancelled: true } };
        return { ok: true, result: { destinationToken: tokens.issue({ kind: 'destination', path: picked }) } };
      }
      case 'dialog.pickSource': {
        const { purpose } = payload as CommandPayload<'dialog.pickSource'>;
        const picked = await system.pickSource(purpose);
        if (picked === null) return { ok: true, result: { cancelled: true } };
        return { ok: true, result: { sourceToken: tokens.issue({ kind: 'source', path: picked }) } };
      }
      case 'confirm.issue': {
        const { command: target, target: id } = payload as CommandPayload<'confirm.issue'>;
        const bound = COMMANDS[target].grants.find((g) => g.kind === 'confirmation');
        const targetValue = bound && bound.kind === 'confirmation' && bound.targetField === null ? '*' : id;
        return { ok: true, result: { confirmationToken: tokens.issue({ kind: 'confirmation', command: target, target: targetValue, digest: null }) } };
      }
      case 'engine.status':
        return { ok: true, result: engine.status() };
      case 'engine.restart':
        return { ok: true, result: { accepted: engine.restart() } };
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
