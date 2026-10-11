// C-13 «تعمل في خيوط عمل داخل المحرك حتى لا يتأثر تجاوبه، وتقبل الإلغاء», and the reading of large reports
// (AT-39): each job runs in a worker thread of its own, so the engine keeps answering while a report of 50 MB is
// read or ten thousand files are analyzed. A cancel raises a shared flag the job checks between files; a job that
// does not stop within a second, or that outlives its time, has its thread terminated. At most `max` threads at
// once; the rest wait their turn. The thread's entry is the engine's own entry module (bundled or not), started
// with a marker in its workerData (bin/utility.ts, bin/node.ts), so the bundle needs no file of its own.
import { Worker } from 'node:worker_threads';
import type { Job, JobResult } from './jobs.ts';

export const WORKER_MARKER = 'ayar-verdict-worker';
const STOP_GRACE_MS = 1000;

export class JobCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'JobCancelled';
  }
}

export class JobFailed extends Error {
  readonly timedOut: boolean;
  constructor(message: string, timedOut = false) {
    super(message);
    this.name = 'JobFailed';
    this.timedOut = timedOut;
  }
}

export interface VerdictPool {
  run(job: Job, o?: { signal?: AbortSignal; timeoutMs?: number }): Promise<JobResult>;
  close(): Promise<void>;
}

type Reply = { ok: true; result: JobResult } | { ok: false; cancelled: boolean; error: string };

/**
 * The pool. `fallback` runs a job in the calling thread when no worker can start at all (a packaged app whose
 * archive a worker cannot load): the result is the same, only the engine is busy meanwhile; it is logged once.
 */
export function workerPool(entry: URL | string, max = 2, fallback?: { run: (job: Job, cancelled: () => boolean) => JobResult; onFallback: (error: string) => void }): VerdictPool {
  let broken: string | null = null;
  let closed = false;
  // A worker takes a path or a URL object, never a URL string (an entry's import.meta.url).
  const target = typeof entry === 'string' && entry.startsWith('file:') ? new URL(entry) : entry;
  let active = 0;
  const queue: (() => void)[] = [];
  const workers = new Set<Worker>();
  const slot = () =>
    new Promise<void>((resolve) => {
      if (active < max) {
        active++;
        resolve();
      } else queue.push(() => resolve());
    });
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };
  return {
    async run(job, o = {}) {
      if (o.signal?.aborted || closed) throw new JobCancelled();
      if (broken !== null && fallback) return inlinePool(fallback.run).run(job, o);
      await slot();
      try {
        if (o.signal?.aborted || closed) throw new JobCancelled();
        return await new Promise<JobResult>((resolve, reject) => {
          const flag = new Int32Array(new SharedArrayBuffer(4));
          const w = new Worker(target, { workerData: { [WORKER_MARKER]: true }, stdout: false, stderr: false });
          workers.add(w);
          let settled = false;
          let ready = false;
          const timers: NodeJS.Timeout[] = [];
          const done = (fn: () => void) => {
            if (settled) return;
            settled = true;
            for (const t of timers) clearTimeout(t);
            o.signal?.removeEventListener('abort', onAbort);
            workers.delete(w);
            void w.terminate();
            fn();
          };
          const stop = (err: Error) => {
            Atomics.store(flag, 0, 1);
            timers.push(setTimeout(() => done(() => reject(err)), STOP_GRACE_MS));
          };
          const onAbort = () => stop(new JobCancelled());
          o.signal?.addEventListener('abort', onAbort, { once: true });
          if (o.timeoutMs) timers.push(setTimeout(() => stop(new JobFailed('the job outlived its time', true)), o.timeoutMs));
          // A worker that never started (its module could not load): the job runs here instead, once and for all.
          const unstarted = (error: string) => {
            if (settled || ready || !fallback) return false;
            broken = error;
            fallback.onFallback(error);
            done(() => void inlinePool(fallback.run).run(job, o).then(resolve, reject));
            return true;
          };
          w.on('message', (m: Reply | { ready: true }) => {
            if ('ready' in m) {
              ready = true;
              return;
            }
            done(() => (m.ok ? resolve(m.result) : reject(m.cancelled ? new JobCancelled() : new JobFailed(m.error))));
          });
          w.once('error', (e: Error) => unstarted(e.message) || done(() => reject(new JobFailed(e.message))));
          w.once('exit', (code) => unstarted(`exit ${code}`) || done(() => reject(new JobFailed(`the worker exited (${code})`))));
          try {
            w.postMessage({ job, flag });
          } catch (e) {
            done(() => reject(new JobFailed(e instanceof Error ? e.message : String(e))));
          }
        });
      } finally {
        release();
      }
    },
    async close() {
      closed = true;
      await Promise.all([...workers].map((w) => w.terminate()));
      workers.clear();
    },
  };
}

/** The same jobs in the calling thread (unit tests of the verdict service; never the app). */
export function inlinePool(runJob: (job: Job, cancelled: () => boolean) => JobResult): VerdictPool {
  return {
    run(job, o = {}) {
      if (o.signal?.aborted) return Promise.reject(new JobCancelled());
      try {
        return Promise.resolve(runJob(job, () => o.signal?.aborted ?? false));
      } catch (e) {
        return Promise.reject(e instanceof Error && e.name === 'Cancelled' ? new JobCancelled() : new JobFailed(e instanceof Error ? e.message : String(e)));
      }
    },
    close: () => Promise.resolve(),
  };
}
