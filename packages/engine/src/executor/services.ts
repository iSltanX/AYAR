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

  constructor(o: CompanionServicesOptions) {
    this.#o = o;
  }

  /** Starts (or joins) the services a check needs; resolves with the first that failed to become ready, or null. */
  async acquire(services: readonly CompanionService[]): Promise<string | null> {
    let failed: string | null = null;
    for (const s of services) {
      let r = this.#running.get(s.id);
      if (!r) {
        r = this.#start(s);
        this.#running.set(s.id, r);
      }
      r.users++;
      if (!(await r.ready) && !failed) failed = s.id;
    }
    return failed;
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
    const pattern = s.readyPattern ? new RegExp(s.readyPattern) : null;
    const sink = (k: 'out' | 'err') => (c: Uint8Array) => {
      for (const line of redactor[k].push(decoder[k].decode(c, { stream: true }))) {
        if (log.length < 20_000) log.push(line);
        if (pattern?.test(line)) matched = true;
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
      while (ports.clock.monotonicMs() < until && !exited) {
        if (matched) return true;
        if (s.readyUrl && (await ports.network.ping(s.readyUrl, 1000)) !== null) return true;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      return matched;
    })();
    return { proc, ready, log, users: 0 };
  }
}
