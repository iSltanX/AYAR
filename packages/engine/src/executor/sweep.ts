// E-22 «المسح بالعلامة»: the processes of this user whose environment carries one of the given check tokens,
// wherever they went (setsid, a double fork, a parent that died). They get SIGTERM, a moment, then SIGKILL if the
// same process (same start time) is still there. Nothing without the token is ever signalled, and never the
// engine itself or its parent. Platform binaries hide their environment (E-22) and so are not found here: they are
// the declared limit of 17, seen by the escape rule instead.
import type { ProcessControl, ProcessInfo } from '../ports/index.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.());

export function carriesToken(env: string, token: string): boolean {
  const needle = `AYAR_CHECK_TOKEN=${token}`;
  for (let at = env.indexOf(needle); at >= 0; at = env.indexOf(needle, at + 1)) {
    const before = at === 0 || env[at - 1] === ' ';
    const after = env.length === at + needle.length || env[at + needle.length] === ' ';
    if (before && after) return true;
  }
  return false;
}

export async function sweepTokens(processes: ProcessControl, tokens: readonly string[], o: { graceMs?: number } = {}): Promise<ProcessInfo[]> {
  const wanted = tokens.filter((t) => t.length >= 16);
  if (!wanted.length) return [];
  const uid = processes.currentUid();
  const never = new Set([process.pid, process.ppid, 0, 1]);
  const mine = (await processes.listProcesses().catch(() => [])).filter((p) => p.uid === uid && !never.has(p.pid));
  const envs = await processes.environments(mine.map((p) => p.pid)).catch(() => new Map<number, string>());
  const carriers = mine.filter((p) => {
    const env = envs.get(p.pid);
    return env !== undefined && wanted.some((t) => carriesToken(env, t));
  });
  if (!carriers.length) return [];
  for (const p of carriers) await processes.killProcess(p.pid, 'SIGTERM').catch(() => false);
  await sleep(o.graceMs ?? 1000);
  const after = await processes.listProcesses().catch(() => []);
  for (const p of carriers) if (after.some((q) => q.pid === p.pid && q.startTime === p.startTime)) await processes.killProcess(p.pid, 'SIGKILL').catch(() => false);
  return carriers;
}
