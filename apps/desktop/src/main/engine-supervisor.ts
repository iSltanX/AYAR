// The engine supervisor (C-01): starts the engine, shakes hands, restarts it after 1, then 5, then 30 seconds,
// and after three restarts within five minutes stops trying and reports the failed state with the log path,
// as an engine.health event. It stops the engine with SIGTERM, then SIGKILL two seconds later. It imports no
// electron: the Electron spawn lives in engine-utility.ts, so this logic is tested with a Node child.
import { protocolError, ProtocolClient, ProtocolFailure, type CommandName, type EngineHealth, type ErrorCode, type Grants, type HostConfig, type InvokeResult, type ParsedEvent, type Transport, type Welcome } from '@ayar/protocol';

export interface EngineChild {
  readonly pid: number | undefined;
  readonly transport: Transport;
  /** Resolves with the exit code (or signal name) when the process ends. */
  readonly exited: Promise<number | string>;
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
}

export type SupervisorState = 'idle' | 'starting' | 'ready' | 'restarting' | 'failed' | 'stopping' | 'stopped';

export interface SupervisorOptions {
  spawn: () => EngineChild;
  config: HostConfig;
  logPath: string;
  onHealth: (health: EngineHealth) => void;
  onEngineEvent: (event: ParsedEvent) => void;
  onConnected?: (welcome: Welcome) => void;
  log?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, string | number | boolean | null>) => void;
  delaysMs?: readonly number[];
  windowMs?: number;
  handshakeTimeoutMs?: number;
  stopGraceMs?: number;
  /** Monotonic clock. */
  now?: () => number;
}

export const RESTART_DELAYS_MS = [1_000, 5_000, 30_000] as const;
export const RESTART_WINDOW_MS = 5 * 60_000;
export const STOP_GRACE_MS = 2_000;
const EXIT_PROTOCOL_MISMATCH = 76;

export class EngineSupervisor {
  readonly #o: Required<Omit<SupervisorOptions, 'onConnected' | 'log'>> & Pick<SupervisorOptions, 'onConnected' | 'log'>;
  #state: SupervisorState = 'idle';
  #child: EngineChild | null = null;
  #client: ProtocolClient | null = null;
  #attempts: number[] = [];
  #reason: ErrorCode | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #lastHealth: EngineHealth | null = null;

  constructor(o: SupervisorOptions) {
    this.#o = {
      delaysMs: RESTART_DELAYS_MS,
      windowMs: RESTART_WINDOW_MS,
      handshakeTimeoutMs: 10_000,
      stopGraceMs: STOP_GRACE_MS,
      now: () => performance.now(),
      ...o,
    };
  }

  get state(): SupervisorState {
    return this.#state;
  }

  get pid(): number | undefined {
    return this.#child?.pid;
  }

  start(): void {
    if (this.#state !== 'idle') return;
    this.#launch();
  }

  /** Never throws: a spawn failure counts as a crash, so it follows the restart policy. */
  #launch(): void {
    try {
      this.#launchOnce();
    } catch (e) {
      this.#o.log?.('error', 'engine spawn failed', { error: e instanceof Error ? e.message : String(e) });
      const failed: EngineChild = { pid: undefined, transport: { send() {}, onMessage() {}, onClose() {}, close() {} }, exited: Promise.resolve('spawn_failed'), kill() {} };
      this.#child = failed;
      this.#client = null;
      queueMicrotask(() => this.#onExit(failed, 'spawn_failed'));
    }
  }

  /** The current state as engine.health: the engine's own report while it runs, the supervisor's otherwise. */
  status(): EngineHealth {
    if (this.#state === 'ready' && this.#lastHealth) return this.#lastHealth;
    return this.#health(this.#state === 'ready' ? 'starting' : this.#healthState(), this.#reason);
  }

  async request(command: CommandName, payload: unknown, grants?: Grants): Promise<InvokeResult<unknown>> {
    if (this.#state === 'failed') return { ok: false, error: protocolError('engine_failed', { logPath: this.#o.logPath }) };
    if (this.#state !== 'ready' || !this.#client) {
      return { ok: false, error: protocolError(this.#state === 'starting' ? 'engine_starting' : 'engine_unavailable') };
    }
    return this.#client.request(command, payload, grants);
  }

  /** A manual retry from the failed state (the error screen's button). */
  restart(): boolean {
    if (this.#state !== 'failed') return false;
    this.#attempts = [];
    this.#reason = null;
    this.#launch();
    return true;
  }

  /** SIGTERM, then SIGKILL after the grace period (C-01); never waits more than twice the grace period. */
  async stop(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const child = this.#child;
    this.#state = 'stopping';
    if (child) {
      const wait = (ms: number) =>
        new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), ms);
          void child.exited.then(() => {
            clearTimeout(t);
            resolve(true);
          });
        });
      child.kill('SIGTERM');
      if (!(await wait(this.#o.stopGraceMs))) {
        this.#o.log?.('warn', 'engine ignored SIGTERM: SIGKILL', { pid: child.pid ?? null });
        child.kill('SIGKILL');
        if (!(await wait(this.#o.stopGraceMs))) this.#o.log?.('error', 'engine did not exit after SIGKILL', { pid: child.pid ?? null });
      }
    }
    this.#state = 'stopped';
    this.#emit(this.#health('stopped', null));
  }

  #launchOnce(): void {
    this.#state = this.#attempts.length ? 'restarting' : 'starting';
    const child = this.#o.spawn();
    this.#child = child;
    this.#lastHealth = null;
    const client = new ProtocolClient(child.transport, {
      onEvent: (e) => {
        if (e.topic === 'engine.health') this.#lastHealth = e.payload as EngineHealth;
        this.#o.onEngineEvent(e);
      },
      onInvalid: (e) => this.#o.log?.('warn', 'invalid message from the engine', { code: e.code }),
    });
    this.#client = client;
    void child.exited.then((code) => this.#onExit(child, code));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.#o.log?.('error', 'engine handshake timed out', { pid: child.pid ?? null });
      child.kill('SIGKILL');
    }, this.#o.handshakeTimeoutMs);
    client.handshake('desktop', this.#o.config).then(
      (welcome) => {
        clearTimeout(timer);
        if (this.#child !== child || this.#state === 'stopping') return;
        this.#state = 'ready';
        this.#o.log?.('info', 'engine connected', { pid: welcome.engine.pid, stream: welcome.engine.stream });
        try {
          this.#o.onConnected?.(welcome);
        } catch (e) {
          this.#o.log?.('error', 'onConnected failed', { error: e instanceof Error ? e.message : String(e) });
        }
      },
      (e: unknown) => {
        clearTimeout(timer);
        if (e instanceof ProtocolFailure && e.error.code === 'protocol_mismatch') this.#reason = 'protocol_mismatch';
        if (!timedOut) this.#o.log?.('error', 'engine handshake failed', { code: e instanceof ProtocolFailure ? e.error.code : 'unknown' });
        child.kill('SIGKILL');
      },
    );
  }

  #onExit(child: EngineChild, code: number | string): void {
    if (this.#child !== child) return;
    this.#client = null;
    if (this.#state === 'stopping' || this.#state === 'stopped') return;
    this.#o.log?.('warn', 'engine exited', { code: String(code), pid: child.pid ?? null });
    if (code === EXIT_PROTOCOL_MISMATCH || this.#reason === 'protocol_mismatch') {
      this.#fail('protocol_mismatch');
      return;
    }
    const now = this.#o.now();
    this.#attempts = this.#attempts.filter((t) => now - t < this.#o.windowMs);
    if (this.#attempts.length >= this.#o.delaysMs.length) {
      this.#fail('engine_failed');
      return;
    }
    const delay = this.#o.delaysMs[this.#attempts.length]!;
    this.#attempts.push(now);
    this.#state = 'restarting';
    this.#emit({ ...this.#health('restarting', 'engine_unavailable'), attempt: this.#attempts.length, retryInMs: delay });
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#state === 'restarting') this.#launch();
    }, delay);
  }

  #fail(reason: ErrorCode): void {
    this.#state = 'failed';
    this.#reason = reason;
    this.#o.log?.('error', 'engine failed: no more restarts', { reason, attempts: this.#attempts.length });
    this.#emit({ ...this.#health('failed', reason), attempt: this.#attempts.length });
  }

  #healthState(): EngineHealth['state'] {
    switch (this.#state) {
      case 'failed':
        return 'failed';
      case 'stopped':
      case 'stopping':
        return 'stopped';
      case 'restarting':
        return 'restarting';
      default:
        return 'starting';
    }
  }

  #health(state: EngineHealth['state'], reason: ErrorCode | null): EngineHealth {
    return { source: 'supervisor', state, reason, attempt: null, retryInMs: null, logPath: this.#o.logPath, schemaVersion: null, hmacKeySource: null };
  }

  #emit(health: EngineHealth): void {
    this.#o.onHealth(health);
  }
}
