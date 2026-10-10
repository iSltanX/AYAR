// C-16 (7.3, 7.4, D-34, D-35): the ordered rules — the first that applies decides — the policies of warnings and
// flakiness, the effect of each finding by its proof and level, the false alarms a review excluded, and the
// properties: never «اجتاز» without the adapter's «ok», with a report problem, or with a counted violation; the
// same inputs give the same verdict (NFR-10).
import type { ExitSignal, ParsedFinding, ParsedReport } from '@ayar/protocol';
import { loadCatalog } from '@ayar/catalog';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify, weigh, type ClassifyInput } from '../src/classifier/classify.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-11T00:00:00Z') });

function report(o: Partial<ParsedReport> = {}): ParsedReport {
  return { reader: 'test', readerVersion: '1.0.0', formats: [], tests: null, findings: [], findingsDropped: 0, signals: { noInputs: false, collectionError: false, configError: false, flaky: false, unresolved: 0 }, problems: [], info: {}, ...o };
}
function finding(rule: string, o: Partial<ParsedFinding> = {}): ParsedFinding {
  return { rule, toolRule: null, severity: null, proof: null, level: null, origin: 'project', message: rule, location: { path: 'src/a.ts', line: 1 }, anchor: { kind: 'code', value: '' }, expected: null, actual: null, ...o };
}
const OK: ExitSignal = { kind: 'ok' };
function input(checkId: string, r: ParsedReport, o: Partial<ClassifyInput> = {}): ClassifyInput {
  const entry = catalog.rules.forCheck(checkId)!;
  return { checkId, exit: OK, report: r, policy: { warnings: 'warn', flaky: 'flaky' }, suspected: entry.suspected, rule: (id) => catalog.rules.rule(id), suspectedToolRules: catalog.rules.suspectedToolRules(checkId), excluded: new Set(), guardTouches: false, ...o };
}
const tests = (failed: number, total: number, flaky = 0) => ({ total, passed: total - failed - flaky, failed, skipped: 0, errors: 0, flaky });

describe('7.3: the ordered rules (D-30)', () => {
  it('rule 3: a missing requirement is «ناقص», before anything the report says', () => {
    const r = classify(input('beh.unit', report({ findings: [finding('test.failed')] }), { exit: { kind: 'missing', reason: { key: 'adapter.reason.noTests' } } }));
    expect(r).toMatchObject({ outcome: 'missing', reason: { key: 'adapter.reason.noTests' }, origin: null });
  });

  it('rule 4: a tool error, or a report that could not be read, is «تعذّر» with the tool as origin', () => {
    expect(classify(input('code.lint', report(), { exit: { kind: 'tool_error', reason: { key: 'adapter.reason.configError', params: { tool: 'eslint', code: 2 } } } }))).toMatchObject({ outcome: 'unavailable', origin: 'tool', reason: { key: 'adapter.reason.configError' } });
    const r = classify(input('beh.unit', report({ tests: tests(0, 3), problems: [{ code: 'too_large', file: 'vitest.json', detail: '52 MB' }] })));
    expect(r).toMatchObject({ outcome: 'unavailable', origin: 'tool', reason: { key: 'verdict.reason.report.too_large', params: { file: 'vitest.json' } } });
  });

  it('rule 5: an exit that contradicts the reports is «تعذّر», never a pass', () => {
    const r = classify(input('beh.unit', report({ tests: tests(1, 3), findings: [finding('test.failed', { anchor: { kind: 'test', value: 'a' } })] }), { exit: { kind: 'conflict', reason: { key: 'adapter.reason.conflict', params: { exit: 0, failed: 1 } } } }));
    expect(r).toMatchObject({ outcome: 'unavailable', origin: 'tool', reason: { key: 'adapter.reason.conflict' } });
  });

  it('rule 6: a proven violation fails, with the project as origin; a failure with flakiness stays «أخفق»', () => {
    const r = classify(input('beh.unit', report({ tests: tests(1, 4, 1), signals: { noInputs: false, collectionError: false, configError: false, flaky: true, unresolved: 0 }, findings: [finding('test.failed', { anchor: { kind: 'test', value: 'a' } }), finding('test.flaky', { anchor: { kind: 'test', value: 'b' } })] })));
    expect(r).toMatchObject({ outcome: 'failed', origin: 'project', reason: { key: 'verdict.reason.testsFailed', params: { failed: 1, total: 4 } } });
    expect(r.findings.map((f) => [f.rule, f.effect])).toEqual([['test.failed', 'violation'], ['test.flaky', 'note']]);
    expect(classify(input('code.build', report(), { exit: { kind: 'project_failure', reason: { key: 'adapter.reason.buildFailed' } } }))).toMatchObject({ outcome: 'failed', origin: 'project' });
  });

  it('rule 7: flakiness alone is «متذبذب», or «أخفق» by the flaky policy', () => {
    const r = report({ tests: tests(0, 3, 1), signals: { noInputs: false, collectionError: false, configError: false, flaky: true, unresolved: 0 }, findings: [finding('test.flaky', { anchor: { kind: 'test', value: 'b' } })] });
    expect(classify(input('beh.e2e', r))).toMatchObject({ outcome: 'flaky', reason: { key: 'verdict.reason.flaky', params: { count: 1 } }, origin: null });
    expect(classify(input('beh.e2e', r, { policy: { warnings: 'warn', flaky: 'fail' } }))).toMatchObject({ outcome: 'failed', reason: { key: 'verdict.reason.flakyAsFailure' } });
  });

  it('rule 8: a suspicion the catalog sends to review, undecided items, the guard → «يحتاج مراجعة»', () => {
    expect(classify(input('sec.sast', report({ findings: [finding('ayar.js.html-injection')] })))).toMatchObject({ outcome: 'needs_review', reason: { key: 'verdict.reason.review', params: { count: 1 } } });
    expect(classify(input('code.refs.external', report({ signals: { noInputs: false, collectionError: false, configError: false, flaky: false, unresolved: 2 } })))).toMatchObject({ outcome: 'needs_review', reason: { key: 'verdict.reason.unresolved', params: { count: 2 } } });
    expect(classify(input('beh.unit', report({ tests: tests(0, 3) }), { guardTouches: true }))).toMatchObject({ outcome: 'needs_review', reason: { key: 'verdict.reason.guardTouched' } });
  });

  it('rule 9: warnings by the policy, and suspicions the catalog makes warnings (code.unused)', () => {
    expect(classify(input('code.lint', report({ findings: [finding('lint.warning', { toolRule: 'no-console' })] })))).toMatchObject({ outcome: 'warning', reason: { key: 'verdict.reason.warnings', params: { count: 1 } } });
    expect(classify(input('code.unused', report({ findings: [finding('unused.item')] })))).toMatchObject({ outcome: 'warning' });
    expect(classify(input('design.fonts.static', report({ findings: [finding('fonts.remote')] })))).toMatchObject({ outcome: 'warning' });
  });

  it('rule 10: a pass, with its suggestions as notes that touch nothing', () => {
    expect(classify(input('beh.unit', report({ tests: tests(0, 5) })))).toMatchObject({ outcome: 'passed', reason: { key: 'verdict.reason.testsPassed', params: { passed: 5, total: 5 } } });
    const r = classify(input('code.complexity', report({ findings: [finding('complexity.cyclomatic', { toolRule: 'complexity' })] })));
    expect(r).toMatchObject({ outcome: 'passed', reason: { key: 'verdict.reason.passedWithNotes', params: { notes: 1 } }, counts: { notes: 1, violations: 0 } });
  });
});

describe('7.4: the policies', () => {
  const w = report({ findings: [finding('lint.warning', { toolRule: 'no-console' })] });
  it('warnings: ignore makes them notes, warn a warning, fail a failure', () => {
    expect(classify(input('code.lint', w, { policy: { warnings: 'ignore', flaky: 'flaky' } }))).toMatchObject({ outcome: 'passed', counts: { notes: 1 } });
    expect(classify(input('code.lint', w, { policy: { warnings: 'warn', flaky: 'flaky' } })).outcome).toBe('warning');
    expect(classify(input('code.lint', w, { policy: { warnings: 'fail', flaky: 'flaky' } }))).toMatchObject({ outcome: 'failed', counts: { violations: 1 } });
  });
});

describe('the weight of a finding (D-34, G-38, 10.3)', () => {
  it('takes the severity and proof from the rule book unless the tool gives its own', () => {
    const base = input('sec.secrets.files', report());
    expect(weigh(finding('secret.detected', { toolRule: 'generic-api-key' }), base, false)).toMatchObject({ severity: 'critical', proof: 'proven', level: 'error', effect: 'violation' });
    expect(weigh(finding('vuln.known', { severity: 'low', level: 'warning' }), input('sec.deps', report()), false)).toMatchObject({ severity: 'low', effect: 'warning' });
  });

  it('makes a generic secret rule a suspicion for review (10.3: «المطابقات العامة يحتاج مراجعة»)', () => {
    const f = weigh(finding('secret.detected', { toolRule: 'generic-credential-uri' }), input('sec.secrets.files', report()), false);
    expect(f).toMatchObject({ proof: 'suspected', level: null, effect: 'review' });
  });

  it('never trusts an unknown rule as proven', () => {
    expect(weigh(finding('no.such-rule', { proof: 'proven', level: 'error' }), input('code.lint', report()), false)).toMatchObject({ proof: 'suspected', effect: 'review' });
  });

  it('excludes a reviewed false alarm (D-35): it never counts, and is counted apart', () => {
    const r = classify(input('sec.secrets.files', report({ findings: [finding('secret.detected', { toolRule: 'generic-api-key' })] }), { excluded: new Set([0]) }));
    expect(r).toMatchObject({ outcome: 'passed', counts: { violations: 0, excludedByReview: 1 } });
    expect(r.findings[0]!.effect).toBe('excluded');
  });
});

// ── properties ───────────────────────────────────────────────────────────────────────────────────────────────

const RULES = ['test.failed', 'test.flaky', 'lint.error', 'lint.warning', 'unused.item', 'complexity.cyclomatic', 'ayar.js.html-injection', 'secret.detected', 'no.such-rule'];
const arbFinding = fc.record({ rule: fc.constantFrom(...RULES), proof: fc.constantFrom(null, 'proven' as const, 'suspected' as const, 'suggestion' as const), level: fc.constantFrom(null, 'error' as const, 'warning' as const) }).map((x) => finding(x.rule, { proof: x.proof, level: x.level }));
const arbExit = fc.constantFrom<ExitSignal>(OK, OK, OK, { kind: 'missing', reason: { key: 'adapter.reason.noTests' } }, { kind: 'tool_error', reason: { key: 'adapter.reason.configError' } }, { kind: 'conflict', reason: { key: 'adapter.reason.conflict' } }, { kind: 'project_failure', reason: { key: 'adapter.reason.buildFailed' } });
const arbInput = fc.record({
  exit: arbExit,
  findings: fc.array(arbFinding, { maxLength: 8 }),
  flaky: fc.boolean(),
  unresolved: fc.nat({ max: 2 }),
  problem: fc.boolean(),
  warnings: fc.constantFrom('ignore' as const, 'warn' as const, 'fail' as const),
  flakyPolicy: fc.constantFrom('flaky' as const, 'fail' as const),
  guard: fc.boolean(),
  check: fc.constantFrom('beh.unit', 'code.lint', 'sec.sast', 'code.unused', 'code.complexity'),
  excludedMask: fc.nat({ max: 255 }),
});

describe('properties of the classifier (D-30, NFR-10)', () => {
  it('never passes without the adapter\'s ok, with a report problem, a counted violation, flakiness or a review item', () => {
    fc.assert(
      fc.property(arbInput, (x) => {
        const r = report({ findings: x.findings, problems: x.problem ? [{ code: 'malformed', file: 'r.json', detail: 'x' }] : [], signals: { noInputs: false, collectionError: false, configError: false, flaky: x.flaky, unresolved: x.unresolved } });
        const excluded = new Set(x.findings.map((_, n) => n).filter((n) => (x.excludedMask >> n) & 1));
        const c = classify(input(x.check, r, { exit: x.exit, policy: { warnings: x.warnings, flaky: x.flakyPolicy }, guardTouches: x.guard, excluded }));
        if (c.outcome !== 'passed') return true;
        return x.exit.kind === 'ok' && !x.problem && !x.flaky && x.unresolved === 0 && !x.guard && c.counts.violations === 0 && c.counts.review === 0 && c.counts.warnings === 0;
      }),
      { numRuns: 3000 },
    );
  });

  it('follows the order: the first rule that applies decides', () => {
    fc.assert(
      fc.property(arbInput, (x) => {
        const r = report({ findings: x.findings, problems: x.problem ? [{ code: 'malformed', file: 'r.json', detail: 'x' }] : [], signals: { noInputs: false, collectionError: false, configError: false, flaky: x.flaky, unresolved: x.unresolved } });
        const c = classify(input(x.check, r, { exit: x.exit, policy: { warnings: x.warnings, flaky: x.flakyPolicy }, guardTouches: x.guard }));
        if (x.exit.kind === 'missing') return c.outcome === 'missing';
        if (x.exit.kind === 'tool_error' || x.problem || x.exit.kind === 'conflict') return c.outcome === 'unavailable';
        if (x.exit.kind === 'project_failure' || c.counts.violations > 0) return c.outcome === 'failed';
        if (x.flaky) return c.outcome === (x.flakyPolicy === 'fail' ? 'failed' : 'flaky');
        if (x.guard || x.unresolved > 0 || c.counts.review > 0) return c.outcome === 'needs_review';
        if (c.counts.warnings > 0) return c.outcome === 'warning';
        return c.outcome === 'passed';
      }),
      { numRuns: 3000 },
    );
  });

  it('gives the same verdict for the same inputs', () => {
    fc.assert(
      fc.property(arbInput, (x) => {
        const r = report({ findings: x.findings, signals: { noInputs: false, collectionError: false, configError: false, flaky: x.flaky, unresolved: x.unresolved } });
        const a = classify(input(x.check, r, { exit: x.exit }));
        const b = classify(input(x.check, structuredClone(r), { exit: x.exit }));
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: 500 },
    );
  });
});
