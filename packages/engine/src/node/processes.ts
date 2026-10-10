// Node implementation of the ProcessControl port. The start time comes from ps(1), so that a reused pid is
// never mistaken for the process the ledger recorded (C-12: "مطابقة وقت بدئه").
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessControl, SpawnResult } from '../ports/index.ts';

const run = promisify(execFile);

/**
 * After the program exits, how long its output may still arrive (review m6): a background job from `.zshrc` that
 * keeps stdout open must not hold a finished login shell until the timeout. The group is then killed.
 */
const DRAIN_GRACE_MS = 250;

/** Kills the whole group: the program and anything it started in its group (C-07 login shell, probes). */
function killTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    /* already gone */
  }
}

export const nodeProcessControl: ProcessControl = {
  currentUid: () => process.getuid?.() ?? -1,
  async startTime(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    try {
      const { stdout } = await run('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { env: { LC_ALL: 'C', TZ: 'UTC' } });
      const out = stdout.trim();
      return out.length ? out : null;
    } catch {
      return null; // ps exits 1 when the process does not exist
    }
  },
  killGroup(pgid, signal) {
    if (!Number.isInteger(pgid) || pgid <= 1) return Promise.resolve(false);
    try {
      process.kill(-pgid, signal);
      return Promise.resolve(true);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') return Promise.resolve(false);
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  },
  spawn(command, args, o) {
    const started = performance.now();
    return new Promise<SpawnResult>((resolve) => {
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let outBytes = 0;
      let errBytes = 0;
      let truncated = false;
      let timedOut = false;
      const keep = (chunks: Buffer[], size: number, d: Buffer): number => {
        const room = o.maxOutputBytes - size;
        if (room <= 0) {
          truncated = true;
          return size;
        }
        if (d.length > room) truncated = true;
        chunks.push(d.subarray(0, room));
        return size + Math.min(d.length, room);
      };
      const child = spawn(command, [...args], { cwd: o.cwd, env: { ...o.env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true, shell: false });
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid, 'SIGTERM');
        setTimeout(() => killTree(child.pid, 'SIGKILL'), 500).unref();
      }, o.timeoutMs);
      child.stdout.on('data', (d: Buffer) => (outBytes = keep(out, outBytes, d)));
      child.stderr.on('data', (d: Buffer) => (errBytes = keep(err, errBytes, d)));
      let finished = false;
      let grace: NodeJS.Timeout | undefined;
      const finish = (code: number | null, signal: string | null, error: string | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(grace);
        // Anything the program left in its group (a login shell's background jobs) goes with it.
        killTree(child.pid, 'SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        resolve({ code, signal, stdout: new Uint8Array(Buffer.concat(out)), stderr: new Uint8Array(Buffer.concat(err)), timedOut, truncated, error, durationMs: Math.round(performance.now() - started) });
      };
      child.once('error', (e: NodeJS.ErrnoException) => finish(null, null, e.code ?? 'spawn_failed'));
      child.once('exit', (code, signal) => {
        grace = setTimeout(() => finish(code, signal, null), DRAIN_GRACE_MS);
      });
      child.once('close', (code, signal) => finish(code, signal, null));
    });
  },
};
