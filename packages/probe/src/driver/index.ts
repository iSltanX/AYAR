// The probe process's loop (C-14, E-11): it says it is ready, then runs the jobs it is sent, one at a time, and
// stops one when asked. Whatever channel carries the messages (Electron's MessagePort under a utilityProcess, Node's
// IPC under tools/cli and the tests), every message is checked against the contract before anything runs.
import { chromium } from 'playwright-core';
import { FromProbe, ToProbe } from '../contract.ts';
import { runJob } from './run.ts';

export interface ProbeChannel {
  send(message: FromProbe): void;
  onMessage(listener: (message: unknown) => void): void;
}

export const PLAYWRIGHT_VERSION = '1.64.0';

export function startProbe(channel: ProbeChannel): void {
  let running: { jobId: string; abort: AbortController } | null = null;
  // A message that breaks the contract is never sent as it is: the job fails with what was wrong instead.
  const send = (m: FromProbe) => {
    const r = FromProbe.safeParse(m);
    if (r.success) channel.send(r.data);
    else channel.send({ type: 'failed', jobId: 'jobId' in m ? m.jobId : '', code: 'internal', detail: `contract: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`.slice(0, 2000) });
  };
  channel.onMessage((raw) => {
    const parsed = ToProbe.safeParse(raw);
    if (!parsed.success) return; // never acted on
    const m = parsed.data;
    if (m.type === 'cancel') {
      running?.abort.abort();
      return;
    }
    if (running) {
      send({ type: 'failed', jobId: m.job.jobId, code: 'internal', detail: 'a job is already running' });
      return;
    }
    const abort = new AbortController();
    running = { jobId: m.job.jobId, abort };
    void runJob(m.job, { chromium, emit: send, signal: abort.signal })
      .catch((e: unknown) => send({ type: 'failed', jobId: m.job.jobId, code: 'internal', detail: String(e instanceof Error ? (e.stack ?? e.message) : e).slice(0, 2000) }))
      .finally(() => (running = null));
  });
  send({ type: 'ready', pid: process.pid, node: process.versions.node, playwright: PLAYWRIGHT_VERSION });
}
