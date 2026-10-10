// FR-26 (C-12, C-01 «منع النوم»): while a run that asks for it is running, the main process holds a power-save
// blocker (`prevent-app-suspension`), and releases it when the run ends, is cancelled, or the engine goes away
// (an engine that restarts marks its runs interrupted, and sends no further state for them). The engine follows
// run.state; the setting run.preventSleep decides per run (RunView.preventSleep).
export interface SleepBlocker {
  start(): number;
  stop(id: number): void;
}

export class SleepGuard {
  readonly #runs = new Set<string>();
  readonly #blocker: SleepBlocker;
  #id: number | null = null;

  constructor(blocker: SleepBlocker) {
    this.#blocker = blocker;
  }

  get holding(): boolean {
    return this.#id !== null;
  }

  /** A run.state event's payload. */
  onRunState(run: { runId: string; state: string; preventSleep: boolean }): void {
    if (run.preventSleep && (run.state === 'running' || run.state === 'cancelling')) this.#runs.add(run.runId);
    else this.#runs.delete(run.runId);
    this.#update();
  }

  /**
   * The supervisor's view of the engine (engine.health from the main process): an engine that is gone — restarting,
   * failed for good, or stopped — runs nothing any more, so the blocker goes (it would otherwise be held forever
   * when the engine crashes and is not restarted).
   */
  onEngineHealth(h: { source: string; state: string }): void {
    if (h.source === 'supervisor' && ['restarting', 'failed', 'stopped'].includes(h.state)) this.reset();
  }

  /** The engine restarted or stopped: nothing it ran is running any more. */
  reset(): void {
    this.#runs.clear();
    this.#update();
  }

  #update(): void {
    if (this.#runs.size && this.#id === null) this.#id = this.#blocker.start();
    else if (!this.#runs.size && this.#id !== null) {
      this.#blocker.stop(this.#id);
      this.#id = null;
    }
  }
}
