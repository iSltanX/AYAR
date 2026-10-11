// Q-05: the gate after StrykerJS (packages/engine/stryker-gate.mjs): 70% for each of the four components on its own,
// on Stryker's score (detected over valid), never rounded up to the threshold, and nothing passes unmeasured.
import { describe, expect, it } from 'vitest';
import { BREAK, componentScores, gate } from '../stryker-gate.mjs';

type Status = 'Killed' | 'Timeout' | 'Survived' | 'NoCoverage' | 'CompileError' | 'RuntimeError' | 'Ignored';
const mutants = (counts: Partial<Record<Status, number>>) => Object.entries(counts).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status })));
const report = (files: Record<string, Partial<Record<Status, number>>>) => ({ files: Object.fromEntries(Object.entries(files).map(([f, c]) => [f, { mutants: mutants(c) }])) });
const ALL = {
  'packages/engine/src/classifier/classify.ts': { Killed: 8, Survived: 2 },
  'packages/engine/src/purity/compute.ts': { Killed: 6, Timeout: 1, Survived: 3, CompileError: 4 },
  'packages/engine/src/redaction/redactor.ts': { Killed: 5, Survived: 3 },
  'packages/engine/src/redaction/names.ts': { Killed: 2, NoCoverage: 0 },
  'packages/engine/src/planner/plan.ts': { Killed: 7, Survived: 2, NoCoverage: 1, Ignored: 9 },
};

describe('the mutation gate of Q-05', () => {
  it('scores each component on its own files: detected (killed, timed out) over valid; errors and ignored left out', () => {
    expect(componentScores(report(ALL)).map((r) => [r.id, r.detected, r.valid, r.score, r.measured])).toEqual([
      ['classifier', 8, 10, 80, true],
      ['purity', 7, 10, 70, true],
      ['redaction', 7, 10, 70, true],
      ['planner', 7, 10, 70, true],
    ]);
    expect(BREAK).toBe(70);
    expect(gate(report(ALL))).toMatchObject({ ok: true, threshold: 70 });
  });

  it('fails a component under 70 however high the others, and never rounds up to the threshold', () => {
    expect(gate(report({ ...ALL, 'packages/engine/src/planner/plan.ts': { Killed: 6, Survived: 4 } })).ok).toBe(false);
    // 699/1000 = 69.9%; and 6999/10000 = 69.99%: under 70 both.
    expect(gate(report({ ...ALL, 'packages/engine/src/purity/compute.ts': { Killed: 699, Survived: 301 } })).ok).toBe(false);
    const close = componentScores(report({ ...ALL, 'packages/engine/src/purity/compute.ts': { Killed: 69_995, Survived: 30_005 } }))[1]!;
    expect([close.score, gate(report({ ...ALL, 'packages/engine/src/purity/compute.ts': { Killed: 69_995, Survived: 30_005 } })).ok]).toEqual([69.99, false]);
  });

  it('passes nothing unmeasured: a missing component, a component with one of its files missing, or no mutant', () => {
    const { ['packages/engine/src/planner/plan.ts']: _planner, ...noPlanner } = ALL;
    expect(gate(report(noPlanner))).toMatchObject({ ok: false });
    expect(componentScores(report(noPlanner))[3]).toMatchObject({ measured: false, score: null });
    const { ['packages/engine/src/redaction/names.ts']: _names, ...noNames } = ALL;
    expect(componentScores(report(noNames))[2]).toMatchObject({ measured: false });
    expect(gate(report(noNames)).ok).toBe(false);
    expect(gate(report({ ...ALL, 'packages/engine/src/classifier/classify.ts': { CompileError: 3 } })).ok).toBe(false);
    expect(gate({}).ok).toBe(false);
    // A report from another folder (absolute paths) is the same component.
    expect(gate(report(Object.fromEntries(Object.entries(ALL).map(([f, c]) => [`/repo/${f}`, c])))).ok).toBe(true);
  });
});
