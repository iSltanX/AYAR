// The worker thread's side of the pool (pool.ts): one job, its reply, then the thread ends. The entry modules call
// isVerdictWorker() first, so the engine itself never starts inside a worker.
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runJob, type Job } from './jobs.ts';
import { WORKER_MARKER } from './pool.ts';

export function isVerdictWorker(): boolean {
  return !isMainThread && typeof workerData === 'object' && workerData !== null && (workerData as Record<string, unknown>)[WORKER_MARKER] === true;
}

export function runVerdictWorker(): void {
  const port = parentPort;
  if (!port) return;
  port.postMessage({ ready: true });
  port.once('message', (m: { job: Job; flag: Int32Array }) => {
    try {
      const result = runJob(m.job, () => Atomics.load(m.flag, 0) === 1);
      port.postMessage({ ok: true, result });
    } catch (e) {
      const cancelled = e instanceof Error && e.name === 'Cancelled';
      port.postMessage({ ok: false, cancelled, error: e instanceof Error ? (e.stack ?? e.message).slice(0, 2000) : String(e) });
    }
  });
}
