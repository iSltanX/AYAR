// Host side of the engine protocol, independent of the transport: the main process wraps a utilityProcess,
// tools/cli wraps a Node child process. It correlates requests and responses, validates everything the
// engine sends (envelope, event payloads, and each result against its command), and fails pending requests
// when the connection closes. It holds no timers: the hosts own timeouts and restarts.
import { COMMANDS, type CommandName } from './commands/index.ts';
import { checkPeerVersion } from './handshake.ts';
import { describeIssues, parseEngineMessage, type HostConfig, type ParsedEvent, type Welcome } from './envelope.ts';
import { protocolError, type ProtocolError } from './errors.ts';
import type { Grants } from './tokens.ts';
import { PROTOCOL_VERSION } from './version.ts';
import type { InvokeResult } from './bridge.ts';

export interface Transport {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Called once when the other side is gone (exit, disconnect, or close()). */
  onClose(listener: () => void): void;
  close(): void;
}

export interface ClientHooks {
  onEvent?(event: ParsedEvent): void;
  /** A message from the engine that failed validation; it is dropped. */
  onInvalid?(error: ProtocolError): void;
}

export class ProtocolFailure extends Error {
  readonly error: ProtocolError;
  constructor(error: ProtocolError) {
    super(`${error.code}${Object.keys(error.details).length ? ` ${JSON.stringify(error.details)}` : ''}`);
    this.name = 'ProtocolFailure';
    this.error = error;
  }
}

type Pending = { command: CommandName; resolve: (r: InvokeResult<unknown>) => void };

export class ProtocolClient {
  readonly #transport: Transport;
  readonly #hooks: ClientHooks;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;
  #welcome: Welcome | null = null;
  #handshake: { resolve: (w: Welcome) => void; reject: (e: ProtocolFailure) => void } | null = null;
  #closed = false;

  constructor(transport: Transport, hooks: ClientHooks = {}) {
    this.#transport = transport;
    this.#hooks = hooks;
    transport.onMessage((m) => this.#receive(m));
    transport.onClose(() => this.#onClose());
  }

  get welcome(): Welcome | null {
    return this.#welcome;
  }

  get closed(): boolean {
    return this.#closed;
  }

  /** Sends hello and resolves with the engine's welcome, or rejects (and closes) on refuse or mismatch. */
  handshake(peer: 'desktop' | 'cli', config: HostConfig): Promise<Welcome> {
    if (this.#closed) return Promise.reject(new ProtocolFailure(protocolError('engine_unavailable')));
    return new Promise<Welcome>((resolve, reject) => {
      this.#handshake = { resolve, reject };
      this.#transport.send({ kind: 'hello', protocol: PROTOCOL_VERSION, peer, config });
    });
  }

  /** Never throws for protocol errors: the outcome carries them. */
  request(command: CommandName, payload: unknown, grants?: Grants): Promise<InvokeResult<unknown>> {
    if (this.#closed) return Promise.resolve({ ok: false, error: protocolError('engine_unavailable') });
    if (!this.#welcome) return Promise.resolve({ ok: false, error: protocolError('engine_starting') });
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#pending.set(id, { command, resolve });
      this.#transport.send({ kind: 'command', id, command, payload, ...(grants && Object.keys(grants).length ? { grants } : {}) });
    });
  }

  /** Asks the engine to close its database and exit. The host escalates if it does not (C-01). */
  shutdown(): void {
    if (!this.#closed) this.#transport.send({ kind: 'shutdown' });
  }

  close(): void {
    this.#transport.close();
    this.#onClose();
  }

  #receive(raw: unknown): void {
    const parsed = parseEngineMessage(raw);
    if (!parsed.ok) {
      this.#hooks.onInvalid?.(parsed.error);
      return;
    }
    const m = parsed.message;
    switch (m.kind) {
      case 'welcome': {
        const mismatch = checkPeerVersion(m.protocol);
        const hs = this.#handshake;
        this.#handshake = null;
        if (mismatch) {
          hs?.reject(new ProtocolFailure(mismatch));
          this.close();
          return;
        }
        this.#welcome = m;
        hs?.resolve(m);
        return;
      }
      case 'refuse': {
        const hs = this.#handshake;
        this.#handshake = null;
        hs?.reject(new ProtocolFailure(m.error));
        this.close();
        return;
      }
      case 'response': {
        const pending = this.#pending.get(m.id);
        if (!pending) {
          this.#hooks.onInvalid?.(protocolError('invalid_message', { kind: 'response', reason: 'unknown id' }));
          return;
        }
        this.#pending.delete(m.id);
        if (!m.ok) {
          pending.resolve({ ok: false, error: m.error });
          return;
        }
        const r = COMMANDS[pending.command].result.safeParse(m.result);
        pending.resolve(
          r.success
            ? { ok: true, result: r.data }
            : { ok: false, error: protocolError('invalid_result', { command: pending.command, issues: describeIssues(r.error) }) },
        );
        return;
      }
      case 'event':
        this.#hooks.onEvent?.(m);
        return;
    }
  }

  #onClose(): void {
    if (this.#closed) return;
    this.#closed = true;
    const hs = this.#handshake;
    this.#handshake = null;
    hs?.reject(new ProtocolFailure(protocolError('engine_unavailable')));
    for (const p of this.#pending.values()) p.resolve({ ok: false, error: protocolError('engine_unavailable') });
    this.#pending.clear();
  }
}
