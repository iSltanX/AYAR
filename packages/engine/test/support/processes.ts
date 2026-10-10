import { spawn, type ChildProcess } from 'node:child_process';

/** A detached `sleep` in its own process group (pgid = pid), like a check the executor launched. */
export function sleeper(seconds = 30): ChildProcess {
  const child = spawn('/bin/sleep', [String(seconds)], { detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitUntil(cond: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
}

export function killQuietly(child: ChildProcess): void {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGKILL');
  } catch {
    /* gone */
  }
}
