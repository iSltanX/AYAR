// C-12 point 10 (FR-21): companion services of one run. A service starts before the first check that needs it,
// is ready when its URL on this machine answers or its log matches the pattern within the timeout, and stops
// after the last check that needs it. It is a supervised process like a check (ledger, token, group, escalation),
// and its redacted log is kept as evidence of each check that used it. If it never becomes ready, the checks that
// need it end «تعذّر: الخدمة المرافقة لم تجهز».
import type { CompanionService } from '@ayar/protocol';
import { posix } from 'node:path';
import type { EnginePorts } from '../ports/index.ts';
import type { RedactionService } from '../redaction/service.ts';
import type { ProcessSupervisor, RunningProcess } from './process.ts';

const POLL_MS = 250;
/** The readiness pattern sees at most this much of a log line: a long line never stalls the engine on it. */
const PATTERN_LINE_CHARS = 4096;

interface Running {
  proc: RunningProcess;
  ready: Promise<boolean>;
  log: string[];
  users: number;
}

export interface CompanionServicesOptions {
  ports: EnginePorts;
  supervisor: ProcessSupervisor;
  redaction: RedactionService;
  projectRoot: string;
  env: Record<string, string>;
  runId: string;
  tmpDir: string;
}

export class CompanionServices {
  readonly #running = new Map<string, Running>();
  readonly #o: CompanionServicesOptions;
  #aborted = false;

  constructor(o: CompanionServicesOptions) {
    this.#o = o;
  }

  /**
   * Starts (or joins) the services a check needs; resolves with the first that failed to become ready (or null),
   * and the ones it holds — exactly what the caller releases. The signal (the check cancelled) ends the wait at
   * once; after abort() nothing new starts.
   */
  async acquire(services: readonly CompanionService[], signal?: AbortSignal): Promise<{ failed: string | null; held: CompanionService[] }> {
    let failed: string | null = null;
    const held: CompanionService[] = [];
    const aborted = new Promise<false>((resolve) => {
      if (signal?.aborted) resolve(false);
      signal?.addEventListener('abort', () => resolve(false), { once: true });
    });
    for (const s of services) {
      if (this.#aborted || signal?.aborted) return { failed: failed ?? s.id, held };
      let r = this.#running.get(s.id);
      if (!r) {
        r = this.#start(s);
        this.#running.set(s.id, r);
      }
      r.users++;
      held.push(s);
      if (!(await Promise.race([r.ready, aborted])) && !failed) failed = s.id;
    }
    return { failed, held };
  }

  /** The run is cancelled or the app quits: every service stops now and no wait goes on (9.7). */
  abort(mode: 'cancel' | 'quit'): void {
    this.#aborted = true;
    for (const r of this.#running.values()) r.proc.stop(mode);
  }

  /** A check that used them is done: a service nobody needs any more is stopped (escalation, C-12 point 8). */
  async release(services: readonly CompanionService[]): Promise<void> {
    for (const s of services) {
      const r = this.#running.get(s.id);
      if (!r) continue;
      r.users--;
      if (r.users <= 0) {
        this.#running.delete(s.id);
        r.proc.stop('cancel');
        await r.proc.done;
      }
    }
  }

  /** The redacted log lines of a service so far (kept as evidence of the checks that used it). */
  logOf(id: string): string {
    return this.#running.get(id)?.log.join('') ?? '';
  }

  async stopAll(mode: 'cancel' | 'quit'): Promise<void> {
    const all = [...this.#running.values()];
    this.#running.clear();
    for (const r of all) r.proc.stop(mode);
    await Promise.all(all.map((r) => r.proc.done));
  }

  #start(s: CompanionService): Running {
    const { ports } = this.#o;
    const log: string[] = [];
    const redactor = { out: this.#o.redaction.redactor().lineStream(), err: this.#o.redaction.redactor().lineStream() };
    const decoder = { out: new TextDecoder(), err: new TextDecoder() };
    let matched = false;
    let pattern: RegExp | null = null;
    try {
      pattern = s.readyPattern ? new RegExp(s.readyPattern) : null;
    } catch {
      pattern = null; // refused at save (profile.invalid.service_pattern); an older profile simply waits for its URL
    }
    const sink = (k: 'out' | 'err') => (c: Uint8Array) => {
      for (const line of redactor[k].push(decoder[k].decode(c, { stream: true }))) {
        if (log.length < 20_000) log.push(line);
        if (!matched && pattern?.test(line.slice(0, PATTERN_LINE_CHARS))) matched = true;
      }
    };
    const proc = this.#o.supervisor.start({
      argv: s.argv,
      cwd: posix.join(this.#o.projectRoot, s.cwd),
      env: this.#o.env,
      token: Buffer.from(ports.random.bytes(24)).toString('base64url'),
      tempDir: this.#o.tmpDir,
      ledger: { kind: 'service', runId: this.#o.runId, checkRunId: null },
      timeoutMs: null,
      idleTimeoutMs: null,
      onStdout: sink('out'),
      onStderr: sink('err'),
    });
    let exited = false;
    void proc.done.then(() => (exited = true));
    const ready = (async () => {
      const until = ports.clock.monotonicMs() + s.readyTimeoutSec * 1000;
      while (ports.clock.monotonicMs() < until && !exited && !this.#aborted) {
        if (matched) return true;
        if (s.readyUrl && (await ports.network.ping(s.readyUrl, 1000)) !== null) return true;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      return matched;
    })();
    return { proc, ready, log, users: 0 };
  }
}
