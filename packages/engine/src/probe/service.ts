// C-14 as the engine sees it: a probe process per execution (E-11: a utilityProcess the main process starts, or a
// Node child under tools/cli), the job sent once it says it is ready, every message it sends checked against the
// contract, a progress event per cell (the total is known, FR-29), and the process ended with the job — or at
// once on a cancel or when the check's time is up. A probe that cannot start, or dies, is «تعذّر» with its reason.
import { FromProbe, type CellResult, type ProbeJob, type ProbeSummary } from '@ayar/probe';
import type { Logger, ProbeHost } from '../ports/index.ts';

/** How long the probe has to say it is ready (it loads playwright-core). */
const READY_MS = 30_000;

export interface ProbeRun {
  results: CellResult[];
  summary: ProbeSummary | null;
  failure: { code: string; detail: string } | null;
  /** How the process went: its pid, and why it ended. */
  pid: number | null;
}

export class ProbeService {
  readonly #host: ProbeHost | undefined;
  readonly #logger: Logger;

  constructor(o: { host: ProbeHost | undefined; logger: Logger }) {
    this.#host = o.host;
    this.#logger = o.logger;
  }

  get available(): boolean {
    return this.#host !== undefined;
  }

  get axePath(): string | null {
    return this.#host?.axePath ?? null;
  }

  async execute(job: ProbeJob, o: { signal: AbortSignal; timeoutMs: number; onCell: (done: number, total: number, r: CellResult) => void }): Promise<ProbeRun> {
    const out: ProbeRun = { results: [], summary: null, failure: null, pid: null };
    if (!this.#host) return { ...out, failure: { code: 'unavailable', detail: 'no probe host' } };
    let proc;
    try {
      proc = await this.#host.start();
    } catch (e) {
      return { ...out, failure: { code: 'probe_failed', detail: e instanceof Error ? e.message.slice(0, 500) : String(e) } };
    }
    out.pid = proc.pid;
    return new Promise<ProbeRun>((resolve) => {
      let settled = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const finish = (failure: ProbeRun['failure']) => {
        if (settled) return;
        settled = true;
        for (const t of timers) clearTimeout(t);
        o.signal.removeEventListener('abort', onAbort);
        if (failure) out.failure = failure;
        proc.close();
        resolve(out);
      };
      const onAbort = () => {
        proc.send({ type: 'cancel' });
        // The probe stops between cells; one that does not is ended.
        timers.push(setTimeout(() => finish({ code: 'cancelled', detail: 'cancelled' }), 5000));
      };
      o.signal.addEventListener('abort', onAbort, { once: true });
      if (o.signal.aborted) onAbort();
      timers.push(setTimeout(() => finish({ code: 'not_ready', detail: `the probe did not start in ${READY_MS / 1000} s` }), READY_MS));
      timers.push(setTimeout(() => finish({ code: 'timed_out', detail: 'the check ran out of time' }), o.timeoutMs));
      void proc.exited.then((code) => finish({ code: 'probe_exited', detail: `the probe process ended (${code})` }));
      proc.onMessage((raw) => {
        if (settled) return;
        const m = FromProbe.safeParse(raw);
        if (!m.success) {
          this.#logger.log('warn', 'a probe message did not match the contract', { issue: m.error.issues[0]?.message ?? '' });
          return;
        }
        const msg = m.data;
        switch (msg.type) {
          case 'ready':
            clearTimeout(timers[0]);
            if (!o.signal.aborted) proc.send({ type: 'run', job });
            break;
          case 'started':
            break;
          case 'cell':
            if (msg.jobId !== job.jobId) return;
            out.results.push(msg.result);
            o.onCell(msg.done, msg.total, msg.result);
            break;
          case 'done':
            if (msg.jobId !== job.jobId) return;
            out.summary = msg.summary;
            finish(null);
            break;
          case 'failed':
            if (msg.jobId !== job.jobId && msg.jobId !== '') return;
            finish({ code: msg.code, detail: msg.detail });
            break;
        }
      });
    });
  }
}
