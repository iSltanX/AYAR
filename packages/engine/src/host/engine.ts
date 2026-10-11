// The engine host (C-04): handshake, boot, dispatch, numbered events, shutdown and deliberate crash. It talks
// to its host only through the HostChannel port, so the same code runs under Electron and under tools/cli.
import {
  checkPeerVersion,
  parseHostMessage,
  protocolError,
  PROTOCOL_VERSION,
  type EngineHealth,
  type ErrorCode,
  type Hello,
  type ParsedCommand,
} from '@ayar/protocol';
import { createFileLogger } from '../node/file-logger.ts';
import type { EnginePorts, HostChannel, LogFields, Logger, LogLevel } from '../ports/index.ts';
import { weeklyBackupIfDue, WEEK_MS } from '../storage/backup.ts';
import type { Migration } from '../storage/migrations.ts';
import { integrityCheck } from '../storage/integrity.ts';
import { loadHmacKey, type HmacKey } from '../storage/hmac-key.ts';
import { StorageError } from '../storage/errors.ts';
import { ENGINE_VERSION } from '../version.ts';
import { HANDLERS } from '../handlers/index.ts';
import { boot, type BootResult, type CatalogLoader } from './boot.ts';
import { Dispatcher, type HandlerTable, type ServiceState } from './dispatcher.ts';
import { EXIT } from './errors.ts';
import { EventBus } from './event-bus.ts';
import { RunGate } from './run-gate.ts';
import { createServices, type EngineServices } from './services.ts';
import type { BrowserBuild } from '../probe/browser.ts';

/** How long a stop waits for an active run's short ending: the 2 s step to SIGKILL, the sweep, and a margin. */
export const QUIT_WAIT_MS = 4500;

export interface StartEngineOptions {
  ports: EnginePorts;
  channel: HostChannel;
  handlers?: HandlerTable;
  migrations?: readonly Migration[];
  catalog?: CatalogLoader;
  /** How often the weekly integrity check and backup are considered (default: daily). */
  maintenanceIntervalMs?: number;
  /** tools/cli's test hook (Node entry only): the login shell C-07 reads. */
  testLoginShell?: string | null;
  /** tools/cli's test hook (Node entry only): extra managed-tool entries for AT-35's local server. */
  testToolRegistry?: readonly unknown[];
  /** tools/cli's test hook (Node entry only): the probe browser's build from a loopback server (DEV-7). */
  testBrowserBuild?: BrowserBuild | null;
  /** The module the verdict's worker threads start from (the entry module itself; C-13). */
  workerEntry?: URL | string;
}

export interface EngineHandle {
  readonly stream: string;
  /** Resolves when the boot finished (tests). */
  booted(): Promise<BootResult | null>;
  stop(code?: number): void;
  crash(error: unknown): never;
}

/** Collects log lines until the data folder's log file exists, then replays them into it. */
class BufferedLogger implements Logger {
  #target: Logger | null = null;
  readonly #buffer: [LogLevel, string, LogFields | undefined][] = [];
  log(level: LogLevel, message: string, fields?: LogFields): void {
    if (this.#target) this.#target.log(level, message, fields);
    else {
      this.#buffer.push([level, message, fields]);
      // Before the log file exists, warnings and errors also reach the host through stderr.
      if (level === 'warn' || level === 'error') process.stderr.write(`${JSON.stringify({ level, message, ...fields })}\n`);
    }
  }
  attach(target: Logger): void {
    this.#target = target;
    for (const [l, m, f] of this.#buffer.splice(0)) target.log(l, m, f);
  }
  flush(): void {
    this.#target?.flush();
  }
}

export function startEngine(o: StartEngineOptions): EngineHandle {
  const { ports, channel } = o;
  const stream = `engine-${Buffer.from(ports.random.bytes(9)).toString('base64url')}`;
  const logger = new BufferedLogger();
  const runGate = new RunGate();
  let phase: 'awaiting_hello' | 'booting' | 'serving' | 'stopping' = 'awaiting_hello';
  let bootPromise: Promise<BootResult | null> = Promise.resolve(null);
  let result: BootResult | null = null;
  let hmacKey: HmacKey | null = null;
  let bus: EventBus | null = null;
  let logPath: string | null = null;
  let degraded: ErrorCode | null = null;
  let services: EngineServices | null = null;
  let maintenance: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const state = (): ServiceState => {
    if (phase === 'awaiting_hello' || phase === 'booting') return { kind: 'unavailable', error: protocolError('engine_starting') };
    if (phase === 'stopping') return { kind: 'unavailable', error: protocolError('engine_unavailable') };
    if (degraded || !result?.db || !result.catalog || !hmacKey || !bus || !services) return { kind: 'unavailable', error: protocolError(degraded ?? 'internal') };
    return { kind: 'ready', context: { db: result.db, clock: ports.clock, logger, events: bus, runGate, hmacKey, catalog: result.catalog, ports, services } };
  };
  const dispatcher = new Dispatcher(o.handlers ?? HANDLERS, state, () => logger);

  const health = (): EngineHealth => ({
    source: 'engine',
    state: degraded ? 'degraded' : 'ready',
    reason: degraded,
    attempt: null,
    retryInMs: null,
    logPath,
    schemaVersion: result?.schemaVersion ?? null,
    hmacKeySource: hmacKey?.source ?? null,
  });

  async function runBoot(hello: Hello): Promise<BootResult | null> {
    result = await boot({ dataDir: hello.config.dataDir, ports, logger, appVersion: hello.config.appVersion, ...(o.migrations ? { migrations: o.migrations } : {}), ...(o.catalog ? { catalog: o.catalog } : {}) });
    if (result.layout) {
      const file = createFileLogger({ dir: result.layout.logs, name: 'engine', clock: ports.clock });
      logPath = file.path;
      logger.attach(file);
      try {
        hmacKey = await loadHmacKey(ports.fs, result.layout, hello.config.hmacKeySource, ports.random, ports.processes.currentUid());
        // A new key next to an existing database: fingerprints recorded with the old key no longer match.
        const hadDatabase = result.steps.some((s) => s.step === 'db.open' && s.detail.exists === true);
        if (hmacKey.created && hadDatabase) logger.log('warn', 'HMAC key was missing and has been recreated: earlier HMAC fingerprints will not match', { fingerprint: hmacKey.fingerprint });
      } catch (e) {
        degraded = e instanceof StorageError ? e.code : 'internal';
        logger.log('error', 'hmac key unavailable', { error: degraded });
      }
    }
    if (result.state === 'degraded') degraded = result.reason ?? 'internal';
    bus = new EventBus({ stream, clock: ports.clock, send: (m) => channel.send(m) });
    if (!degraded && result.db && result.catalog && hmacKey && result.layout) {
      services = createServices({ catalog: result.catalog, db: result.db, layout: result.layout, ports, events: bus, runGate, logger, hmacKey, testLoginShell: o.testLoginShell ?? null, testToolRegistry: o.testToolRegistry ?? [], testBrowserBuild: o.testBrowserBuild ?? null, ...(o.workerEntry ? { workerEntry: o.workerEntry } : {}) });
    }
    if (phase === 'stopping') return result;
    phase = 'serving';
    logger.log('info', 'engine serving', { state: degraded ? 'degraded' : 'ready', reason: degraded, keySource: hmacKey?.source ?? null });
    bus.emit('engine.health', health());
    if (!degraded) startMaintenance();
    return result;
  }

  // C-04 / 14.3: integrity_check and the backup weekly, also for an engine that runs for weeks.
  function startMaintenance(): void {
    let lastCheck = ports.clock.monotonicMs();
    maintenance = setInterval(() => {
      if (ports.clock.monotonicMs() - lastCheck < WEEK_MS || !result?.db || !result.layout || degraded) return;
      lastCheck = ports.clock.monotonicMs();
      void services?.evidence.retainAll().catch((e: unknown) => logger.log('error', 'retention failed', { error: String(e) }));
      const integrity = integrityCheck(result.db);
      if (!integrity.ok) {
        degraded = 'db_corrupt';
        logger.log('error', 'weekly integrity_check failed', { problems: integrity.problems.length });
        bus?.emit('engine.health', health());
        return;
      }
      weeklyBackupIfDue(result.db, ports.fs, result.layout.backups, ports.clock).catch((e: unknown) => logger.log('error', 'weekly backup failed', { error: String(e) }));
    }, o.maintenanceIntervalMs ?? 24 * 60 * 60 * 1000);
    maintenance.unref?.();
  }

  async function onCommand(cmd: ParsedCommand): Promise<void> {
    if (phase === 'awaiting_hello') {
      channel.send({ kind: 'response', id: cmd.id, ok: false, error: protocolError('engine_starting') });
      return;
    }
    await bootPromise;
    const { response, crash } = await dispatcher.dispatch(cmd);
    channel.send(response);
    if (crash) setImmediate(() => handle.crash(crash));
  }

  function onHello(hello: Hello): void {
    if (phase !== 'awaiting_hello') {
      logger.log('warn', 'second hello ignored');
      return;
    }
    const mismatch = checkPeerVersion(hello.protocol);
    if (mismatch) {
      phase = 'stopping';
      logger.log('error', 'protocol mismatch: connection stopped', mismatch.details);
      channel.send({ kind: 'refuse', protocol: PROTOCOL_VERSION, error: mismatch });
      setTimeout(() => ports.exit(EXIT.protocolMismatch), 50);
      return;
    }
    channel.send({ kind: 'welcome', protocol: PROTOCOL_VERSION, engine: { version: ENGINE_VERSION, pid: process.pid, stream } });
    phase = 'booting';
    bootPromise = runBoot(hello).catch((e: unknown) => handle.crash(e));
  }

  channel.onMessage((raw) => {
    const parsed = parseHostMessage(raw);
    if (!parsed.ok) {
      logger.log('warn', 'rejected message', { code: parsed.error.code, ...parsed.error.details });
      if (parsed.id !== undefined) channel.send({ kind: 'response', id: parsed.id, ok: false, error: parsed.error });
      return;
    }
    const m = parsed.message;
    if (m.kind === 'hello') onHello(m);
    else if (m.kind === 'command') void onCommand(m);
    else handle.stop(EXIT.ok);
  });
  channel.onClose(() => handle.stop(EXIT.ok));

  const handle: EngineHandle = {
    stream,
    booted: () => bootPromise,
    stop(code = EXIT.ok) {
      if (stopped) return;
      stopped = true;
      phase = 'stopping';
      if (maintenance) clearInterval(maintenance);
      services?.projects.cancelAll();
      const finish = () => {
        // The verdict's worker threads end with the engine (their jobs are dropped).
        void services?.verdict.pool.close().catch(() => undefined);
        bus?.close();
        try {
          result?.db?.close();
        } catch {
          /* already closed */
        }
        logger.log('info', 'engine stopped', { code });
        logger.flush();
        ports.exit(code);
      };
      // 9.7: a run (or a setup command) still active when the engine is told to stop ends the short way (SIGTERM,
      // 2 s, SIGKILL and the sweep); the wait leaves room for the SIGKILL. What it cannot finish, the next boot
      // marks «انقطع» (and reaps by the ledger).
      if (services && (services.runs.hasActive() || services.setup.hasActive())) {
        const quick = Promise.all([services.runs.prepareQuit(), services.setup.prepareQuit()]).catch(() => null);
        void Promise.race([quick, new Promise((r) => setTimeout(r, QUIT_WAIT_MS))]).finally(finish);
      } else finish();
    },
    crash(error: unknown): never {
      const e = error instanceof Error ? error : new Error(String(error));
      logger.log('error', 'unhandled exception: the engine stops on purpose (C-04)', { error: e.message, stack: e.stack ?? null });
      logger.flush();
      process.stderr.write(`AYAR engine crash: ${e.stack ?? e.message}\n`);
      return ports.exit(EXIT.crash);
    },
  };
  return handle;
}
