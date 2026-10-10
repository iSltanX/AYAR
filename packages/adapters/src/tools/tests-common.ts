// What every test-runner adapter shares: a test's outcome as AYAR keeps it, the findings of failures, collection
// errors and flakiness, and the reading of beh.stability's repetitions (10.3: «تُشتق نتيجة beh.unit من التكرارات:
// نجاحها كلها اجتاز، والتعارض بينها متذبذب، والإخفاق الثابت أخفق»). Each attempt is read on its own; a test that
// failed in every attempt is a failure, one whose result changed between attempts is flaky.
import type { FindingLocation, ParsedReport } from '@ayar/protocol';
import { finding, pushFinding } from '../framework.ts';

export interface TestResult {
  fullName: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  location: FindingLocation | null;
  message: string;
  /** A missing snapshot (E-12: «أخفق» because the snapshot is missing; its approval is suggested). */
  snapshotMissing?: boolean;
}

export interface Attempt {
  tests: TestResult[];
  /** Errors outside a test: a file that failed to load or collect (with its location when known). */
  collectionErrors: { message: string; location: FindingLocation | null }[];
}

const SNAPSHOT = /snapshot.{0,40}(missing|not (?:been )?written|obsolete|mismatch)|missing snapshot|new snapshot|toMatchSnapshot|A snapshot doesn't exist|writing (?:a )?new snapshot/i;

export function isSnapshotMissing(message: string): boolean {
  return SNAPSHOT.test(message) && /missing|doesn't exist|not (?:been )?written|new snapshot|writing/i.test(message);
}

/** Fills a report from one or more attempts (one, unless beh.stability repeats them). */
export function fillTests(r: ParsedReport, attempts: readonly Attempt[]): void {
  const byName = new Map<string, TestResult[]>();
  for (const a of attempts) {
    for (const t of a.tests) {
      const list = byName.get(t.fullName) ?? [];
      list.push(t);
      byName.set(t.fullName, list);
    }
  }
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let flaky = 0;
  for (const [name, results] of byName) {
    const statuses = new Set(results.map((t) => t.status));
    const last = results.at(-1)!;
    if (statuses.has('flaky') || (statuses.has('passed') && statuses.has('failed'))) {
      flaky++;
      r.signals.flaky = true;
      pushFinding(r, finding({ rule: 'test.flaky', message: attempts.length > 1 ? `${name}: ${results.map((t) => t.status).join(' → ')}` : `${name}: passed after a retry`, location: last.location, anchor: { kind: 'test', value: name } }));
    } else if (statuses.has('failed')) {
      failed++;
      const bad = results.find((t) => t.status === 'failed')!;
      pushFinding(r, finding({ rule: bad.snapshotMissing ? 'test.snapshot-missing' : 'test.failed', message: bad.message || name, location: bad.location, anchor: { kind: 'test', value: name } }));
    } else if (statuses.has('passed')) passed++;
    else skipped++;
  }
  const errors = attempts.reduce((n, a) => n + a.collectionErrors.length, 0);
  // A collection error is the project's (a syntax or import error in a test file): a failure of its own.
  const seen = new Set<string>();
  for (const a of attempts) {
    for (const e of a.collectionErrors) {
      const key = `${e.location?.path ?? ''}\0${e.message.slice(0, 200)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      r.signals.collectionError = true;
      pushFinding(r, finding({ rule: 'test.collection-error', message: e.message, location: e.location, anchor: { kind: 'code', value: '' } }));
    }
  }
  r.tests = { total: byName.size, passed, failed, skipped, errors, flaky };
  if (attempts.length > 1) r.info.attempts = attempts.length;
}

/** The common exit map of a test runner (7.3 rules 3 to 5), from the counts it read. */
export function testsExit(o: { exitCode: number | null; tests: ParsedReport['tests']; okCodes: readonly number[]; failCodes: readonly number[]; noInputs: boolean; tool: string }):
  | { kind: 'ok' }
  | { kind: 'missing'; reason: { key: string; params?: Record<string, string | number> } }
  | { kind: 'conflict'; reason: { key: string; params?: Record<string, string | number> } }
  | null {
  const t = o.tests;
  if (!t) return null;
  const failing = t.failed + t.errors;
  if (o.noInputs) return { kind: 'missing', reason: { key: 'adapter.reason.noTestsRan', params: { tool: o.tool } } };
  if (o.okCodes.includes(o.exitCode ?? -1)) {
    if (failing > 0) return { kind: 'conflict', reason: { key: 'adapter.reason.conflictExitPass', params: { tool: o.tool, exit: o.exitCode ?? -1, failed: failing } } };
    if (t.passed + t.flaky === 0) return { kind: 'missing', reason: { key: 'adapter.reason.noTestsRan', params: { tool: o.tool } } };
    return { kind: 'ok' };
  }
  if (o.failCodes.includes(o.exitCode ?? -1)) {
    // Nothing ran and nothing failed: the adapter knows why (a configuration that broke before any test).
    if (failing === 0) return t.total === 0 ? null : { kind: 'conflict', reason: { key: 'adapter.reason.conflictExitFail', params: { tool: o.tool, exit: o.exitCode ?? -1 } } };
    return { kind: 'ok' };
  }
  return null;
}

/**
 * After each attempt of beh.stability agreed with its own exit (7.3 rule 5, checked by the adapter), the attempts
 * together are judged by the tests themselves: flaky, failing, or passing. Null for a single execution.
 */
export function repeatedExit(attempts: number, tests: ParsedReport['tests'], tool: string): { kind: 'ok' } | { kind: 'missing'; reason: { key: string; params: Record<string, string> } } | null {
  if (attempts <= 1) return null;
  return tests && tests.passed + tests.flaky + tests.failed > 0 ? { kind: 'ok' } : { kind: 'missing', reason: { key: 'adapter.reason.noTestsRan', params: { tool } } };
}
