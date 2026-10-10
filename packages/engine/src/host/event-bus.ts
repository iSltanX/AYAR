// Numbered events (C-04): one stream per engine session, seq 1, 2, 3… with no gaps, so the UI notices a lost
// event or a restart and resyncs (C-03). Every payload is validated against its topic before it leaves.
// check.log is aggregated: segments of one check are merged and sent at most once per interval (NFR-01).
import { EVENTS, type EventPayload, type EventTopic } from '@ayar/protocol';
import type { Clock } from '../ports/index.ts';

type LogSegment = { stream: 'stdout' | 'stderr'; offset: number; length: number };
type Timer = { cancel(): void };
export type Schedule = (fn: () => void, ms: number) => Timer;

const defaultSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return { cancel: () => clearTimeout(t) };
};

export interface EventBusOptions {
  stream: string;
  clock: Clock;
  send: (message: unknown) => void;
  logIntervalMs?: number;
  schedule?: Schedule;
}

export class EventBus {
  readonly stream: string;
  readonly #o: Required<EventBusOptions>;
  #seq = 0;
  readonly #pendingLogs = new Map<string, { runId: string; segments: LogSegment[] }>();
  #logTimer: Timer | null = null;
  #closed = false;

  constructor(o: EventBusOptions) {
    this.#o = { logIntervalMs: 100, schedule: defaultSchedule, ...o };
    this.stream = o.stream;
  }

  get lastSeq(): number {
    return this.#seq;
  }

  emit<T extends EventTopic>(topic: T, payload: EventPayload<T>): void {
    if (this.#closed) return;
    const checked = EVENTS[topic].payload.parse(payload); // a malformed event is an engine bug: fail loudly
    this.#seq += 1;
    this.#o.send({ kind: 'event', stream: this.stream, seq: this.#seq, topic, at: this.#o.clock.now().toISOString(), payload: checked });
  }

  /** Queues a log segment reference; merged per check and flushed at most once per interval. */
  log(runId: string, checkRunId: string, segment: LogSegment): void {
    if (this.#closed) return;
    const entry = this.#pendingLogs.get(checkRunId) ?? { runId, segments: [] };
    const last = entry.segments.at(-1);
    if (last && last.stream === segment.stream && last.offset + last.length === segment.offset) last.length += segment.length;
    else entry.segments.push({ ...segment });
    this.#pendingLogs.set(checkRunId, entry);
    this.#logTimer ??= this.#o.schedule(() => this.flushLogs(), this.#o.logIntervalMs);
  }

  flushLogs(): void {
    this.#logTimer?.cancel();
    this.#logTimer = null;
    const pending = [...this.#pendingLogs.entries()];
    this.#pendingLogs.clear();
    for (const [checkRunId, { runId, segments }] of pending) this.emit('check.log', { runId, checkRunId, segments });
  }

  close(): void {
    this.flushLogs();
    this.#closed = true;
  }
}
