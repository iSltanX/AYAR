// D-33: one active run in the whole app in the first release; the others wait in a visible queue (C-04).
export interface RunGateSnapshot {
  active: string | null;
  queue: string[];
}

export class RunGate {
  #active: string | null = null;
  readonly #queue: string[] = [];

  /** 0 when the run becomes active now, otherwise its 1-based position in the queue. */
  request(runId: string): number {
    if (this.#active === runId) return 0;
    const at = this.#queue.indexOf(runId);
    if (at >= 0) return at + 1;
    if (this.#active === null) {
      this.#active = runId;
      return 0;
    }
    this.#queue.push(runId);
    return this.#queue.length;
  }

  /** Ends the active run, or drops a queued one. Returns the run that became active, if any. */
  release(runId: string): string | null {
    if (this.#active === runId) {
      this.#active = this.#queue.shift() ?? null;
      return this.#active;
    }
    const at = this.#queue.indexOf(runId);
    if (at >= 0) this.#queue.splice(at, 1);
    return null;
  }

  snapshot(): RunGateSnapshot {
    return { active: this.#active, queue: [...this.#queue] };
  }
}
