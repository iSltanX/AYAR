// Node implementation of the ProcessControl port. The start time comes from ps(1), so that a reused pid is
// never mistaken for the process the ledger recorded (C-12: "مطابقة وقت بدئه").
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessControl, ProcessInfo, SpawnResult, StartedProcess } from '../ports/index.ts';

const run = promisify(execFile);
/** ps(1) in the C locale and UTC: lstart reads the same whoever asks (C-12: "مطابقة وقت بدئه"). */
const PS_ENV = { LC_ALL: 'C', TZ: 'UTC' };
const PS_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * After a check's leader exits, how long its output may still arrive before the pipes are closed: a detached
 * grandchild that inherited them would otherwise hold the check open (E-22 «exit لا close»).
 */
const START_DRAIN_MS = 300;

const LINE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+([A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d \d{4})\s+(.*)$/;

export function parsePsLine(line: string): ProcessInfo | null {
  const m = LINE.exec(line);
  if (!m) return null;
  return { pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), uid: Number(m[4]), cpu: Number(m[5]), rssKb: Number(m[6]), startTime: m[7]!, command: m[8]! };
}

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
  killProcess(pid, signal) {
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return Promise.resolve(false);
    try {
      process.kill(pid, signal);
      return Promise.resolve(true);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') return Promise.resolve(false);
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  },
  groupAlive(pgid) {
    if (!Number.isInteger(pgid) || pgid <= 1) return false;
    try {
      process.kill(-pgid, 0);
      return true;
    } catch (e) {
      // EPERM: the group exists but is another user's (never ours to signal; still alive).
      return (e as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
  async listProcesses() {
    const { stdout } = await run('/bin/ps', ['-A', '-o', 'pid=,ppid=,pgid=,uid=,%cpu=,rss=,lstart=,comm='], { env: PS_ENV, maxBuffer: PS_MAX_BUFFER });
    const out: ProcessInfo[] = [];
    for (const line of stdout.split('\n')) {
      const p = parsePsLine(line);
      if (p) out.push(p);
    }
    return out;
  },
  async environments(pids) {
    const out = new Map<number, string>();
    const wanted = [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 1);
    if (!wanted.length) return out;
    // ps -E appends the environment to the command line (KERN_PROCARGS2, E-22); without -E, the command line
    // alone. The environment is what follows the plain command line, so an argument is never taken for it.
    const list = wanted.join(',');
    const read = async (withEnv: boolean) => {
      try {
        const { stdout } = await run('/bin/ps', [...(withEnv ? ['-E'] : []), '-ww', '-o', 'pid=,command=', '-p', list], { env: PS_ENV, maxBuffer: PS_MAX_BUFFER });
        return stdout;
      } catch (e) {
        // ps exits 1 when some of the pids are gone; what it printed is still right.
        return (e as { stdout?: string }).stdout ?? '';
      }
    };
    const toMap = (text: string) => {
      const m = new Map<number, string>();
      for (const line of text.split('\n')) {
        const hit = /^\s*(\d+) (.*)$/.exec(line);
        if (hit) m.set(Number(hit[1]), hit[2]!);
      }
      return m;
    };
    const plain = toMap(await read(false));
    const full = toMap(await read(true));
    for (const [pid, line] of full) {
      const cmd = plain.get(pid);
      if (cmd === undefined || !line.startsWith(cmd)) continue; // changed between the two reads: not trusted
      out.set(pid, line.slice(cmd.length));
    }
    return out;
  },
  async launchdJobs() {
    try {
      const { stdout } = await run('/bin/launchctl', ['list'], { env: PS_ENV, maxBuffer: PS_MAX_BUFFER });
      return stdout
        .split('\n')
        .slice(1)
        .map((l) => l.split('\t')[2]?.trim() ?? '')
        .filter(Boolean);
    } catch {
      return [];
    }
  },
  start(command, args, o) {
    return new Promise<StartedProcess>((resolve) => {
      const child = spawn(command, [...args], { cwd: o.cwd, env: { ...o.env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true, shell: false });
      child.stdout.on('data', (d: Buffer) => o.onStdout(new Uint8Array(d.buffer, d.byteOffset, d.length)));
      child.stderr.on('data', (d: Buffer) => o.onStderr(new Uint8Array(d.buffer, d.byteOffset, d.length)));
      const exited = new Promise<{ code: number | null; signal: string | null }>((done) => {
        let ended = 0;
        let result: { code: number | null; signal: string | null } | null = null;
        let timer: NodeJS.Timeout | undefined;
        const finish = () => {
          if (!result) return;
          clearTimeout(timer);
          child.stdout.destroy();
          child.stderr.destroy();
          done(result);
        };
        const onEnd = () => {
          if (++ended === 2) finish();
        };
        child.stdout.once('end', onEnd);
        child.stderr.once('end', onEnd);
        child.once('exit', (code, signal) => {
          result = { code, signal };
          if (ended === 2) finish();
          else timer = setTimeout(finish, START_DRAIN_MS);
        });
        child.once('error', () => {
          result ??= { code: null, signal: null };
          finish();
        });
      });
      child.once('spawn', () => resolve({ pid: child.pid ?? null, error: null, exited }));
      child.once('error', (e: NodeJS.ErrnoException) => {
        if (child.pid === undefined) resolve({ pid: null, error: e.code ?? 'spawn_failed', exited });
      });
    });
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
