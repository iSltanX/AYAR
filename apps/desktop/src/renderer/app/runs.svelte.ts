// The live state of runs (C-03, C-12; plan 9.6, 13.6): what the engine's numbered events say, kept per run and per
// check execution, and re-read from the engine (run.get) whenever a run is opened or the bridge asks to resync (a
// gap in the numbering, a new engine stream, a replaced port). The UI never invents a state: no verdict before the
// run's own summary (FR-28), no optimistic success before the engine confirms (C-03).
import type { CheckOutcome, CheckRunView, EventPayload, RunDetail, RunPlan, RunView, SleepGap } from '@ayar/protocol';
import { attempt, on } from './client.ts';
import { isoAt } from './format.ts';

export type CheckProgress = EventPayload<'check.progress'>;
export type Provisional = EventPayload<'finding.provisional'>;

/** What a summary of check executions counts (9.6 point 4): waiting, running, and each final outcome. */
export interface LiveCounts {
  total: number;
  queued: number;
  running: number;
  cancelling: number;
  finished: number;
  byOutcome: Partial<Record<CheckOutcome, number>>;
}

export function countChecks(checks: Iterable<CheckRunView>): LiveCounts {
  const c: LiveCounts = { total: 0, queued: 0, running: 0, cancelling: 0, finished: 0, byOutcome: {} };
  for (const v of checks) {
    c.total++;
    if (v.state === 'planned' || v.state === 'queued') c.queued++;
    else if (v.state === 'running') c.running++;
    else if (v.state === 'cancelling') c.cancelling++;
    else {
      c.finished++;
      if (v.outcome) c.byOutcome[v.outcome] = (c.byOutcome[v.outcome] ?? 0) + 1;
    }
  }
  return c;
}

/** A wall-clock lead over the monotonic clock beyond this between two ticks is time asleep (the executor's 5 s). */
const SLEEP_GAP_MIN_MS = 5000;

const ACTIVE = new Set(['queued', 'running', 'cancelling']);
export const isActive = (r: RunView | undefined | null): boolean => !!r && ACTIVE.has(r.state);

export class RunTracker {
  /** Every run the app has seen, by id. */
  runs = $state<Record<string, RunView>>({});
  /** Check executions per run, by checkRunId. */
  checks = $state<Record<string, Record<string, CheckRunView>>>({});
  /** The frozen plan of a run (its items name the section and resources of each check). */
  plans = $state<Record<string, RunPlan | null>>({});
  /** The latest progress of each running check execution. */
  progress = $state<Record<string, CheckProgress>>({});
  /** Provisional findings of each running check execution (9.6 point 5), until its final reading. */
  provisional = $state<Record<string, Provisional[]>>({});
  /** Seconds-resolution clock the live rows read (ages and durations), ticking while a run is active. */
  now = $state(Date.now());
  /** The last summary of each finished run (run.summary). */
  summaries = $state<Record<string, EventPayload<'run.summary'>>>({});
  /**
   * FR-26: the times the computer slept during a run — from its executions' raw results (run.get), and seen live by
   * this page's own clock: the wall clock jumping ahead of the monotonic one (the same test as the executor's).
   */
  sleepGaps = $state<Record<string, SleepGap[]>>({});

  #unsubscribe: (() => void)[] = [];
  #timer: ReturnType<typeof setInterval> | null = null;
  #listeners: ((run: RunView, previous: RunView | undefined) => void)[] = [];

  /** D-33: the one active run of the app (running first, then cancelling, then the queue's head). */
  get active(): RunView | null {
    const all = Object.values(this.runs).filter((r) => isActive(r));
    return all.find((r) => r.state === 'running') ?? all.find((r) => r.state === 'cancelling') ?? all.sort((a, b) => (a.queuePosition ?? 99) - (b.queuePosition ?? 99))[0] ?? null;
  }

  start(): void {
    this.#unsubscribe.push(
      on('run.state', (m) => this.#setRun(m.payload)),
      on('check.state', (m) => this.#setCheck(m.payload)),
      on('check.progress', (m) => {
        this.progress[m.payload.checkRunId] = m.payload;
      }),
      on('finding.provisional', (m) => {
        const list = this.provisional[m.payload.checkRunId] ?? [];
        if (!list.some((p) => p.fingerprint === m.payload.fingerprint)) this.provisional[m.payload.checkRunId] = [...list, m.payload];
      }),
      on('run.summary', (m) => {
        this.summaries[m.payload.runId] = m.payload;
      }),
      on('bridge.resync', () => void this.resync()),
    );
    let wall = Date.now();
    let mono = performance.now();
    this.#timer = setInterval(() => {
      const w = Date.now();
      const m = performance.now();
      const gap = w - wall - (m - mono);
      wall = w;
      mono = m;
      const active = this.active;
      if (active && gap > SLEEP_GAP_MIN_MS) this.#addGaps(active.runId, [{ at: isoAt(w - gap), ms: Math.round(gap) }]);
      if (active) this.now = w;
    }, 1000);
  }

  stop(): void {
    for (const u of this.#unsubscribe.splice(0)) u();
    if (this.#timer) clearInterval(this.#timer);
  }

  /** Called on every change of a run's view (the monitor turns into the results when its run finishes). */
  onRun(listener: (run: RunView, previous: RunView | undefined) => void): () => void {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }

  /** Reads a run from the engine: its view, its plan and every execution (the source of truth after any gap). */
  async load(runId: string): Promise<RunDetail | null> {
    const r = await attempt('run.get', { runId });
    if (!r.ok) return null;
    const d = r.result;
    this.plans[runId] = d.plan;
    const map: Record<string, CheckRunView> = {};
    for (const c of d.checks) {
      const { raw: _raw, evidence: _evidence, ...view } = c;
      map[c.checkRunId] = view;
      if (c.state === 'finished') delete this.provisional[c.checkRunId];
    }
    this.checks[runId] = map;
    this.#addGaps(
      runId,
      d.checks.flatMap((c) => c.raw?.sleepGaps ?? []),
    );
    this.#setRun(d.run);
    return d;
  }

  /** Keeps a run the app learnt about from a list (runs.list) without reading its executions. */
  remember(run: RunView): void {
    this.#setRun(run);
  }

  async resync(): Promise<void> {
    await Promise.all(Object.keys(this.checks).map((id) => this.load(id)));
    for (const run of Object.values(this.runs)) if (isActive(run) && !this.checks[run.runId]) await this.load(run.runId);
  }

  checksOf(runId: string): CheckRunView[] {
    return Object.values(this.checks[runId] ?? {});
  }

  /** Keeps the gaps of a run once each: two that overlap (seen by the page and by a check) are one sleep. */
  #addGaps(runId: string, gaps: readonly SleepGap[]): void {
    if (!gaps.length) return;
    const all = [...(this.sleepGaps[runId] ?? [])];
    for (const g of gaps) {
      const start = Date.parse(g.at);
      const end = start + g.ms;
      const same = all.findIndex((x) => Date.parse(x.at) < end && start < Date.parse(x.at) + x.ms);
      if (same < 0) all.push(g);
      else if (g.ms > all[same]!.ms) all[same] = g;
    }
    this.sleepGaps[runId] = all.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  #setRun(run: RunView): void {
    const previous = this.runs[run.runId];
    this.runs[run.runId] = run;
    if (isActive(run)) this.now = Date.now();
    for (const l of this.#listeners) l(run, previous);
  }

  #setCheck(view: CheckRunView): void {
    const map = this.checks[view.runId];
    if (map) map[view.checkRunId] = view;
    else this.checks[view.runId] = { [view.checkRunId]: view };
    if (view.state === 'finished') {
      // 9.6 point 5: a provisional finding is confirmed or dropped by the final reading.
      delete this.provisional[view.checkRunId];
      delete this.progress[view.checkRunId];
    }
  }
}
