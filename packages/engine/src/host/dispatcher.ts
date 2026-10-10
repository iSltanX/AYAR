// The command dispatcher (C-04): validated commands arrive here; it checks the grants (permissions), that the
// engine can serve the command (booted, database usable), runs the handler, and checks the result against
// the command's contract. Expected failures become coded responses. Any other exception is an unknown state:
// the dispatcher answers `internal` and tells the engine to crash on purpose, so the supervisor restarts it.
import { checkGrants, COMMANDS, protocolError, type CommandName, type Grants, type ParsedCommand, type ProtocolError, type ResponseMessage } from '@ayar/protocol';
import type { Clock, Logger } from '../ports/index.ts';
import type { Db } from '../storage/db.ts';
import { StorageError } from '../storage/errors.ts';
import type { HmacKey } from '../storage/hmac-key.ts';
import { CommandError } from './errors.ts';
import type { EventBus } from './event-bus.ts';
import type { RunGate } from './run-gate.ts';

export interface HandlerContext {
  db: Db;
  clock: Clock;
  logger: Logger;
  events: EventBus;
  runGate: RunGate;
  hmacKey: HmacKey;
  grants: Grants;
}

export type CommandHandler = (payload: unknown, ctx: HandlerContext) => unknown;
export type HandlerTable = Partial<Record<CommandName, CommandHandler>>;

/** What the dispatcher needs from the engine's current state. */
export type ServiceState =
  | { kind: 'ready'; context: Omit<HandlerContext, 'grants'> }
  | { kind: 'unavailable'; error: ProtocolError };

export interface DispatchOutcome {
  response: ResponseMessage;
  /** Set when the handler threw something unexpected: the engine must crash after replying. */
  crash: Error | null;
}

export class Dispatcher {
  readonly #handlers: HandlerTable;
  readonly #state: () => ServiceState;
  readonly #logger: () => Logger;

  constructor(handlers: HandlerTable, state: () => ServiceState, logger: () => Logger) {
    this.#handlers = handlers;
    this.#state = state;
    this.#logger = logger;
  }

  async dispatch(cmd: ParsedCommand): Promise<DispatchOutcome> {
    const fail = (error: ProtocolError, crash: Error | null = null): DispatchOutcome => ({ response: { kind: 'response', id: cmd.id, ok: false, error }, crash });
    const def = COMMANDS[cmd.command];
    if (def.handler !== 'engine') return fail(protocolError('unknown_command', { command: cmd.command, handledBy: def.handler }));

    const denied = checkGrants(cmd.command, cmd.payload, cmd.grants);
    if (denied) return fail(denied);

    const handler = this.#handlers[cmd.command];
    if (!handler) return fail(protocolError('not_implemented', { command: cmd.command, implementedIn: def.implementedIn }));

    const state = this.#state();
    if (state.kind !== 'ready') return fail(state.error);

    try {
      const raw = await handler(cmd.payload, { ...state.context, grants: cmd.grants });
      const checked = def.result.safeParse(raw);
      if (!checked.success) {
        this.#logger().log('error', 'handler result broke its contract', { command: cmd.command });
        return fail(protocolError('invalid_result', { command: cmd.command }));
      }
      return { response: { kind: 'response', id: cmd.id, ok: true, result: checked.data }, crash: null };
    } catch (e) {
      if (e instanceof CommandError) return fail(e.error);
      if (e instanceof StorageError) return fail(protocolError(e.code, e.details));
      const err = e instanceof Error ? e : new Error(String(e));
      return fail(protocolError('internal', { command: cmd.command }), err);
    }
  }
}
