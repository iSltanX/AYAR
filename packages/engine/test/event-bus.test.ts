import { describe, expect, it } from 'vitest';
import { EventBus, type Schedule } from '../src/host/event-bus.ts';
import { fakeClock } from './support/tmp.ts';

const health = { source: 'engine', state: 'ready', reason: null, attempt: null, retryInMs: null, logPath: null, schemaVersion: 1, hmacKeySource: 'test' } as const;

function manualSchedule() {
  const tasks: (() => void)[] = [];
  const schedule: Schedule = (fn) => {
    tasks.push(fn);
    return { cancel: () => tasks.splice(tasks.indexOf(fn), 1) };
  };
  return { schedule, run: () => tasks.splice(0).forEach((t) => t()), pending: () => tasks.length };
}

describe('event bus (C-04: numbered events)', () => {
  it('numbers events 1, 2, 3 in one stream, with a UTC timestamp', () => {
    const sent: { seq: number; stream: string; at: string }[] = [];
    const bus = new EventBus({ stream: 'engine-abcdef', clock: fakeClock(), send: (m) => sent.push(m as never) });
    bus.emit('engine.health', health);
    bus.emit('engine.health', { ...health, state: 'degraded', reason: 'db_corrupt' });
    bus.emit('engine.health', health);
    expect(sent.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(new Set(sent.map((m) => m.stream))).toEqual(new Set(['engine-abcdef']));
    expect(sent[0]!.at).toBe('2026-10-10T08:00:00.000Z');
    expect(bus.lastSeq).toBe(3);
  });

  it('refuses to send a payload that breaks its topic, without consuming a number', () => {
    const sent: unknown[] = [];
    const bus = new EventBus({ stream: 'engine-abcdef', clock: fakeClock(), send: (m) => sent.push(m) });
    expect(() => bus.emit('engine.health', { ...health, state: 'exploded' } as never)).toThrow();
    bus.emit('engine.health', health);
    expect((sent[0] as { seq: number }).seq).toBe(1);
  });

  it('aggregates check.log: contiguous segments merge, and one event per check per interval', () => {
    const sent: { topic: string; payload: { checkRunId: string; segments: unknown[] } }[] = [];
    const timer = manualSchedule();
    const bus = new EventBus({ stream: 'engine-abcdef', clock: fakeClock(), send: (m) => sent.push(m as never), schedule: timer.schedule });
    bus.log('r1', 'c1', { stream: 'stdout', offset: 0, length: 10 });
    bus.log('r1', 'c1', { stream: 'stdout', offset: 10, length: 5 });
    bus.log('r1', 'c1', { stream: 'stderr', offset: 0, length: 3 });
    bus.log('r1', 'c2', { stream: 'stdout', offset: 0, length: 1 });
    expect(sent).toHaveLength(0);
    expect(timer.pending()).toBe(1);
    timer.run();
    expect(sent.map((m) => m.payload)).toEqual([
      { runId: 'r1', checkRunId: 'c1', segments: [{ stream: 'stdout', offset: 0, length: 15 }, { stream: 'stderr', offset: 0, length: 3 }] },
      { runId: 'r1', checkRunId: 'c2', segments: [{ stream: 'stdout', offset: 0, length: 1 }] },
    ]);
  });

  it('flushes pending logs on close and sends nothing after', () => {
    const sent: unknown[] = [];
    const bus = new EventBus({ stream: 'engine-abcdef', clock: fakeClock(), send: (m) => sent.push(m), schedule: manualSchedule().schedule });
    bus.log('r1', 'c1', { stream: 'stdout', offset: 0, length: 1 });
    bus.close();
    bus.emit('engine.health', health);
    expect(sent).toHaveLength(1);
  });
});
