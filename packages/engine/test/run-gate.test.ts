import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RunGate } from '../src/host/run-gate.ts';

describe('one active run (D-33)', () => {
  it('activates the first run and queues the others in order', () => {
    const g = new RunGate();
    expect(g.request('a')).toBe(0);
    expect(g.request('b')).toBe(1);
    expect(g.request('c')).toBe(2);
    expect(g.request('b')).toBe(1); // asking again does not duplicate
    expect(g.snapshot()).toEqual({ active: 'a', queue: ['b', 'c'] });
    expect(g.release('a')).toBe('b');
    expect(g.release('c')).toBeNull();
    expect(g.snapshot()).toEqual({ active: 'b', queue: [] });
  });

  it('never has two active runs, whatever the sequence', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), fc.constantFrom('a', 'b', 'c', 'd')), { maxLength: 60 }), (ops) => {
        const g = new RunGate();
        for (const [req, id] of ops) {
          if (req) g.request(id);
          else g.release(id);
          const s = g.snapshot();
          const all = [s.active, ...s.queue].filter(Boolean);
          if (new Set(all).size !== all.length) return false; // a run is either active or queued once
          if (s.active === null && s.queue.length > 0) return false; // nobody waits while the slot is free
        }
        return true;
      }),
    );
  });
});
