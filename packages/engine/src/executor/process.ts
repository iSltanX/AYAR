// C-12 points 4 to 8, 11 and «عند إقلاع المحرك»: one supervised process. Before it starts, a ledger row holds what
// cleaning needs after a crash (the token, the temporary folder); right after, its pid, group and start time as
// the system reports them. It runs without a shell, in its own group, stdin closed, with AYAR_CHECK_TOKEN in its
// environment, which its descendants inherit. Every 2 s its group and descendants are sampled (processor time and
// memory), so a silent but busy check is told from an idle one (point 7). The timeouts use the monotonic clock,
// so time asleep does not count; the wall clock's lead is recorded as a sleep gap. Ending it — cancel, timeout,
// idle — escalates SIGINT, 5 s, SIGTERM, 5 s, SIGKILL on the group (SIGTERM, 2 s, SIGKILL when the app quits).
// After the leader exits, what is left of the group is killed, then every process of the user that carries the
// token (setsid, double fork) is ended (E-22), and a new launchd child outside the system folders or a new
// launchd job is recorded as a possible escape: «تعذّر التحقق من إنهاء كل العمليات» — never claimed clean (17).
import { createHash } from 'node:crypto';
import type { Clock, EnginePorts, Logger, ProcessInfo, StopSignal } from '../ports/index.ts';
import type { Db } from '../storage/db.ts';
import { newId } from '../host/ids.ts';
import { sweepTokens } from './sweep.ts';

export const SAMPLE_INTERVAL_MS = 2000;
export const ESCALATION_STEP_MS = 5000;
export const QUICK_STEP_MS = 2000;
/** A group using less processor than this between two samples is quiet (C-12 point 7). */
export const BUSY_CPU_PERCENT = 2;
/** A wall-clock lead over the monotonic clock beyond this between two samples is time asleep (FR-26). */
export const SLEEP_GAP_MIN_MS = 5000;
/** E-22: executables in these folders are the system's; a new launchd child elsewhere is a possible escape. */
export const SYSTEM_PREFIXES = ['/System/', '/usr/libexec/', '/Library/Apple/', '/Library/Application Support/', '/usr/sbin/', '/sbin/'];

export type EndReason = 'exited' | 'timed_out' | 'idle_timed_out' | 'cancelled' | 'spawn_failed';

export interface ProcessSpec {
  argv: readonly string[];
  cwd: string;
  /** The complete environment (C-07 point 5); the token is added here. */
  env: Readonly<Record<string, string>>;
  token: string;
  tempDir: string | null;
  ledger: { kind: 'check' | 'service' | 'setup'; runId: string | null; checkRunId: string | null };
  timeoutMs: number | null;
  idleTimeoutMs: number | null;
  onStdout(chunk: Uint8Array): void;
  onStderr(chunk: Uint8Array): void;
  onSample?(s: Sample): void;
}

export interface Sample {
  /** Processes of the group and its descendants still in the tree. */
  members: number;
  cpuPercent: number;
  rssKb: number;
  silentMs: number;
}

export interface Leftovers {
  groupKilled: number;
  tokenKilled: number;
  escapeSuspected: { kind: 'launchd_child' | 'launchd_job'; name: string }[];
}

export interface ProcessResult {
  ended: EndReason;
  exitCode: number | null;
  signal: string | null;
  spawnError: string | null;
  pid: number | null;
  startedAt: Date;
  finishedAt: Date;
  /** Monotonic: time asleep is not in it. */
  durationMs: number;
  lastActivityAt: Date | null;
  sleepGaps: { at: string; ms: number }[];
  resources: { samples: number; peakRssKb: number; maxCpuPercent: number; lastCpuPercent: number };
  leftovers: Leftovers;
  /** The signals sent while ending it, in order (evidence of the escalation). */
  escalation: { signal: StopSignal; atMs: number }[];
}

export interface RunningProcess {
  readonly pid: number | null;
  /** Ends it the escalating way (cancel), or the short way (the app is quitting). */
  stop(mode: 'cancel' | 'quit'): void;
  readonly done: Promise<ProcessResult>;
}

export interface Baseline {
  launchdChildren: Set<string>;
  jobs: Set<string>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.());

export class ProcessSupervisor {
  readonly #ports: EnginePorts;
  readonly #db: Db;
  readonly #logger: Logger;
  readonly #clock: Clock;
  readonly #uid: number;

  constructor(o: { ports: EnginePorts; db: Db; logger: Logger }) {
    this.#ports = o.ports;
    this.#db = o.db;
    this.#logger = o.logger;
    this.#clock = o.ports.clock;
    this.#uid = o.ports.processes.currentUid();
  }

  /** The launchd children and jobs of the user now (E-22: what is new later may be an escape). */
  async baseline(): Promise<Baseline> {
    const [procs, jobs] = await Promise.all([this.#ports.processes.listProcesses().catch(() => []), this.#ports.processes.launchdJobs()]);
    return { launchdChildren: new Set(procs.filter((p) => p.ppid === 1 && p.uid === this.#uid).map((p) => `${p.pid}\0${p.startTime}`)), jobs: new Set(jobs) };
  }

  start(spec: ProcessSpec): RunningProcess {
    let stopMode: 'cancel' | 'quit' | null = null;
    let wake: (() => void) | null = null;
    let pid: number | null = null;
    const handle: { pid: number | null; stop(mode: 'cancel' | 'quit'): void; done: Promise<ProcessResult> } = {
      get pid() {
        return pid;
      },
      stop(mode) {
        if (stopMode === 'quit') return;
        stopMode = mode;
        wake?.();
      },
      done: null as unknown as Promise<ProcessResult>,
    };
    handle.done = this.#run(spec, (p) => (pid = p), () => stopMode, (w) => (wake = w));
    return handle;
  }

  async #run(spec: ProcessSpec, setPid: (p: number) => void, stopMode: () => 'cancel' | 'quit' | null, setWake: (w: () => void) => void): Promise<ProcessResult> {
    const { processes } = this.#ports;
    const startedAt = this.#clock.now();
    const startMono = this.#clock.monotonicMs();
    const ledgerId = newId(this.#ports.random, 'led');
    const digest = `sha256:${createHash('sha256').update(JSON.stringify(spec.argv)).digest('hex')}`;
    const base = await this.baseline();
    // Before the launch: what a crash would need to clean up (C-12 point 4). pid 0 until the system names it.
    this.#db.run(
      "INSERT INTO process_ledger (id, check_run_id, pid, pgid, os_start_time, command_digest, check_token, temp_dir, state, created_at, kind, run_id) VALUES (?, ?, 0, 0, '', ?, ?, ?, 'running', ?, ?, ?)",
      ledgerId,
      spec.ledger.checkRunId,
      digest,
      spec.token,
      spec.tempDir,
      startedAt.toISOString(),
      spec.ledger.kind,
      spec.ledger.runId,
    );
    let lastOutput = startMono;
    let lastBusy = startMono;
    const wrapOut = (fn: (c: Uint8Array) => void) => (c: Uint8Array) => {
      lastOutput = this.#clock.monotonicMs();
      fn(c);
    };
    const started = await processes.start(spec.argv[0]!, spec.argv.slice(1), { cwd: spec.cwd, env: { ...spec.env, AYAR_CHECK_TOKEN: spec.token }, onStdout: wrapOut((c) => spec.onStdout(c)), onStderr: wrapOut((c) => spec.onStderr(c)) });
    const result: ProcessResult = {
      ended: 'exited',
      exitCode: null,
      signal: null,
      spawnError: null,
      pid: started.pid,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      lastActivityAt: null,
      sleepGaps: [],
      resources: { samples: 0, peakRssKb: 0, maxCpuPercent: 0, lastCpuPercent: 0 },
      leftovers: { groupKilled: 0, tokenKilled: 0, escapeSuspected: [] },
      escalation: [],
    };
    if (started.pid === null) {
      result.ended = 'spawn_failed';
      result.spawnError = started.error;
      this.#endLedger(ledgerId);
      result.finishedAt = this.#clock.now();
      return result;
    }
    const pgid = started.pid;
    setPid(pgid);
    const osStart = (await processes.startTime(pgid)) ?? '';
    this.#db.run('UPDATE process_ledger SET pid = ?, pgid = ?, os_start_time = ? WHERE id = ?', pgid, pgid, osStart, ledgerId);

    let exited = false;
    let exit: { code: number | null; signal: string | null } | null = null;
    let wakeLoop = () => {};
    setWake(() => wakeLoop());
    void started.exited.then((e) => {
      exited = true;
      exit = e;
      wakeLoop();
    });

    // The watch loop: samples, timeouts, cancel. It sleeps until the next sample or a wake-up.
    let lastWall = this.#clock.now().getTime();
    let lastMono = startMono;
    const cpuBefore = new Map<number, number>();
    let ending: EndReason | null = null;
    while (!exited) {
      await new Promise<void>((r) => {
        wakeLoop = r;
        setTimeout(r, SAMPLE_INTERVAL_MS).unref?.();
      });
      if (exited) break;
      const nowMono = this.#clock.monotonicMs();
      const nowWall = this.#clock.now().getTime();
      // FR-26: the wall clock ran ahead of the monotonic one: the machine slept.
      const gap = nowWall - lastWall - (nowMono - lastMono);
      if (gap > SLEEP_GAP_MIN_MS) result.sleepGaps.push({ at: new Date(nowWall - gap).toISOString(), ms: Math.round(gap) });
      lastWall = nowWall;
      const interval = nowMono - lastMono;
      lastMono = nowMono;
      const sample = await this.#sample(pgid, cpuBefore, interval).catch(() => null);
      if (sample) {
        result.resources.samples++;
        result.resources.peakRssKb = Math.max(result.resources.peakRssKb, sample.rssKb);
        result.resources.maxCpuPercent = Math.max(result.resources.maxCpuPercent, sample.cpuPercent);
        result.resources.lastCpuPercent = sample.cpuPercent;
        if (sample.cpuPercent >= BUSY_CPU_PERCENT) lastBusy = nowMono;
        spec.onSample?.({ ...sample, silentMs: Math.round(nowMono - lastOutput) });
      }
      const mode = stopMode();
      if (mode) ending = 'cancelled';
      else if (spec.timeoutMs !== null && nowMono - startMono >= spec.timeoutMs) ending = 'timed_out';
      // Idle: neither output nor processor activity for the idle limit (a busy silent check is never idle).
      else if (spec.idleTimeoutMs !== null && nowMono - Math.max(lastOutput, lastBusy) >= spec.idleTimeoutMs) ending = 'idle_timed_out';
      if (ending) {
        await this.#escalate(pgid, stopMode() === 'quit' ? 'quit' : 'cancel', () => exited, result, startMono, stopMode);
        break;
      }
    }
    // The leader is gone (or was ended): wait for its exit event, briefly, then clean around it.
    const final = await Promise.race([started.exited, sleep(ESCALATION_STEP_MS * 2).then(() => null)]);
    exit ??= final;
    result.exitCode = exit?.code ?? null;
    result.signal = exit?.signal ?? null;
    result.ended = ending ?? 'exited';
    // Point 11 and 8: what remains of the group, then the token, then the escape rule.
    result.leftovers.groupKilled = await this.#killGroupRest(pgid);
    const swept = await this.sweepToken(spec.token);
    result.leftovers.tokenKilled = swept.killed.length;
    result.leftovers.escapeSuspected = await this.#escapes(base, new Set(swept.killed.map((p) => p.pid)));
    this.#endLedger(ledgerId);
    const endMono = this.#clock.monotonicMs();
    result.durationMs = Math.round(endMono - startMono);
    result.finishedAt = this.#clock.now();
    result.lastActivityAt = new Date(result.startedAt.getTime() + Math.round(lastOutput - startMono));
    return result;
  }

  #endLedger(id: string): void {
    try {
      this.#db.run("UPDATE process_ledger SET state = 'ended', ended_at = ? WHERE id = ?", this.#clock.now().toISOString(), id);
    } catch (e) {
      this.#logger.log('error', 'ledger row could not be closed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** The group's members and the leader's descendants, with the processor time used since the last sample. */
  async #sample(pgid: number, cpuBefore: Map<number, number>, intervalMs: number): Promise<Omit<Sample, 'silentMs'>> {
    const all = await this.#ports.processes.listProcesses();
    const members = treeOf(all, pgid);
    let cpuMs = 0;
    let rss = 0;
    for (const p of members) {
      // A process born since the last sample used all of its processor time inside this interval.
      const prev = cpuBefore.get(p.pid);
      cpuMs += prev === undefined ? p.cpuTimeMs : Math.max(0, p.cpuTimeMs - prev);
      cpuBefore.set(p.pid, p.cpuTimeMs);
      rss += p.rssKb;
    }
    const cpuPercent = intervalMs > 0 ? (cpuMs / intervalMs) * 100 : 0;
    return { members: members.length, cpuPercent: Math.round(cpuPercent * 10) / 10, rssKb: rss };
  }

  async #escalate(pgid: number, mode: 'cancel' | 'quit', exited: () => boolean, result: ProcessResult, startMono: number, stopMode: () => 'cancel' | 'quit' | null): Promise<void> {
    const steps: StopSignal[] = mode === 'quit' ? ['SIGTERM', 'SIGKILL'] : ['SIGINT', 'SIGTERM', 'SIGKILL'];
    for (const signal of steps) {
      if (!this.#ports.processes.groupAlive(pgid)) return;
      result.escalation.push({ signal, atMs: Math.round(this.#clock.monotonicMs() - startMono) });
      await this.#ports.processes.killGroup(pgid, signal).catch(() => false);
      if (signal === 'SIGKILL') return;
      const wait = stopMode() === 'quit' ? QUICK_STEP_MS : ESCALATION_STEP_MS;
      const until = this.#clock.monotonicMs() + wait;
      // The whole group, not just the leader: a grandchild that ignores the signal keeps the group alive.
      while (this.#clock.monotonicMs() < until && this.#ports.processes.groupAlive(pgid)) {
        if (stopMode() === 'quit' && mode === 'cancel') return this.#escalate(pgid, 'quit', exited, result, startMono, stopMode);
        await sleep(100);
      }
    }
  }

  /** Whatever is left in the group after the leader: SIGTERM, a second, SIGKILL. Returns how many there were. */
  async #killGroupRest(pgid: number): Promise<number> {
    if (!this.#ports.processes.groupAlive(pgid)) return 0;
    const n = (await this.#ports.processes.listProcesses().catch(() => [])).filter((p) => p.pgid === pgid).length;
    await this.#ports.processes.killGroup(pgid, 'SIGTERM').catch(() => false);
    const until = this.#clock.monotonicMs() + 1000;
    while (this.#clock.monotonicMs() < until && this.#ports.processes.groupAlive(pgid)) await sleep(50);
    if (this.#ports.processes.groupAlive(pgid)) await this.#ports.processes.killGroup(pgid, 'SIGKILL').catch(() => false);
    return Math.max(n, 1);
  }

  /**
   * E-22: every process of this user that carries the token, wherever it went (setsid, double fork, a dead
   * parent): SIGTERM, a second, then SIGKILL for those still there with the same start time. Nothing without the
   * token is ever signalled, and never the engine itself.
   */
  async sweepToken(token: string): Promise<{ killed: ProcessInfo[] }> {
    const killed = await sweepTokens(this.#ports.processes, [token]);
    if (killed.length) this.#logger.log('info', 'processes that left the group were ended by their token', { count: killed.length });
    return { killed };
  }

  /** E-22's rule: a new launchd child of this user outside the system folders, or a new non-Apple launchd job. */
  async #escapes(base: Baseline, handled: ReadonlySet<number>): Promise<Leftovers['escapeSuspected']> {
    const now = await this.baseline();
    const out: Leftovers['escapeSuspected'] = [];
    const procs = await this.#ports.processes.listProcesses().catch(() => []);
    for (const p of procs) {
      if (p.ppid !== 1 || p.uid !== this.#uid || handled.has(p.pid)) continue;
      if (base.launchdChildren.has(`${p.pid}\0${p.startTime}`) || !now.launchdChildren.has(`${p.pid}\0${p.startTime}`)) continue;
      if (SYSTEM_PREFIXES.some((s) => p.command.startsWith(s))) continue;
      out.push({ kind: 'launchd_child', name: p.command.split('/').pop() ?? p.command });
    }
    for (const j of now.jobs) if (!base.jobs.has(j) && !j.startsWith('com.apple.')) out.push({ kind: 'launchd_job', name: j });
    return out;
  }
}

/** The leader's group and every descendant still linked to it by parent. */
export function treeOf(all: readonly ProcessInfo[], pgid: number): ProcessInfo[] {
  const byParent = new Map<number, ProcessInfo[]>();
  for (const p of all) byParent.set(p.ppid, [...(byParent.get(p.ppid) ?? []), p]);
  const out = new Map<number, ProcessInfo>();
  for (const p of all) if (p.pgid === pgid) out.set(p.pid, p);
  const stack = [...out.keys()];
  while (stack.length) {
    const pid = stack.pop()!;
    for (const c of byParent.get(pid) ?? []) {
      if (!out.has(c.pid)) {
        out.set(c.pid, c);
        stack.push(c.pid);
      }
    }
  }
  return [...out.values()];
}
