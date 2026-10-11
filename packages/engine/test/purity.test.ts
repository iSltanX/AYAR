// C-19 `purity/1` (plan 11, D-10, NFR-10) and AT-21's engine part: the examples of 11.7 give 19, 17 and 19 exactly;
// the outcomes that do not count; K = 0, K < 3; a blocking failure; an integrity finding that keeps «نقي» away at
// P = 1; a section's karat «جزئي». And the properties of plan 19 (fast-check): 24 if and only if every required
// check passed; the rounding never raises; adding a passing check to a criterion does not raise its weight; a
// blocking failure is never shown under another verdict; the same inputs give the same result.
import type { CheckOutcome, IntegrityInputs, PurityMeta } from '@ayar/protocol';
import { CHECK_OUTCOMES, PurityResult as PurityResultSchema } from '@ayar/protocol';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computePurity, inR, outcomeWord, puritySummary, type PurityCheckInput } from '../src/purity/compute.ts';

const META: PurityMeta = { profileVersion: 1, profileHash: 'h', catalogVersion: '1.1.0', toolVersions: {}, environmentSource: 'login_shell', snapshotId: null, commit: null, computedAt: '2026-10-11T10:00:00.000Z' };
const CLEAN: IntegrityInputs = { stateChanged: false, guardUnreviewed: 0, modelClaimsOpen: 0, reviewsExpired: 0, checks: [{ checkId: 'integ.guard', outcome: 'passed' }, { checkId: 'integ.state', outcome: 'passed' }, { checkId: 'integ.model-claims', outcome: 'not_applicable' }, { checkId: 'integ.reviews', outcome: 'not_applicable' }] };

/** The criterion and section of a check of 11.6. */
const CRITERION: Record<string, [string, string]> = {
  'code.build': ['build', 'code'],
  'code.types': ['types', 'code'],
  'code.lint': ['lint', 'code'],
  'code.refs.local': ['references', 'code'],
  'beh.unit': ['behavior', 'behavior'],
  'beh.ext.host': ['host', 'behavior'],
  'sec.secrets.files': ['secrets', 'security'],
  'sec.deps': ['vulnerabilities', 'security'],
  'sec.sast': ['security-patterns', 'security'],
  'sec.ext.manifest': ['manifest', 'security'],
  'sec.ext.permissions': ['permissions', 'security'],
  'design.rtl.static': ['direction', 'design'],
  'design.rtl.render': ['direction', 'design'],
  'design.a11y': ['accessibility', 'design'],
  'design.a11y.review': ['accessibility', 'design'],
};

function check(checkId: string, outcome: CheckOutcome | null, o: Partial<PurityCheckInput> = {}): PurityCheckInput {
  const [criterion, section] = CRITERION[checkId] ?? (checkId.startsWith('custom.') ? ['custom', 'custom'] : ['x', 'code']);
  return { instance: `${checkId}@.`, checkId, component: '.', section, criterion, inIndex: true, required: true, applicable: true, blocking: false, outcome, reviewed: false, violations: outcome === 'failed' ? 1 : 0, excludedByReview: 0, checkRunId: null, ...o };
}
const round = (checks: PurityCheckInput[], integrity: IntegrityInputs = CLEAN) => computePurity({ scope: { kind: 'round', roundId: 'rnd_1' }, checks, integrity, meta: META });

/** 11.7 (a): a browser extension with an Arabic UI for the public: 13 criteria, 15 checks. */
function exampleA(): PurityCheckInput[] {
  return [
    check('code.build', 'passed', { blocking: true }),
    check('code.types', 'passed', { blocking: true }),
    check('code.refs.local', 'passed'),
    check('beh.unit', 'passed', { blocking: true }),
    check('beh.ext.host', 'passed'),
    check('sec.secrets.files', 'passed', { blocking: true }),
    check('sec.deps', 'passed'),
    check('sec.ext.manifest', 'passed', { blocking: true }),
    check('sec.ext.permissions', 'passed'),
    check('design.rtl.static', 'passed'),
    check('design.rtl.render', 'passed'),
    check('code.lint', 'warning'),
    check('sec.sast', 'needs_review'),
    check('design.a11y', 'passed'),
    check('design.a11y.review', 'needs_review'),
  ];
}

describe('11.7: the examples are contracts (AT-21)', () => {
  it('(a) 19: «غير مكتمل · عيار 19 · 13 معيارًا، 15 فحصًا · تحذير 1، يحتاج مراجعة 2»', () => {
    const r = round(exampleA());
    expect(r).toMatchObject({ verdict: 'incomplete', karat: 19, criteriaCount: 13, checksCount: 15, narrow: false });
    expect(r.p).toBeCloseTo(10.5 / 13, 10);
    expect(r.counts.byOutcome).toEqual({ passed: 12, warning: 1, needs_review: 2 });
    expect(r.criteria.find((c) => c.id === 'accessibility')).toEqual({ id: 'accessibility', section: 'design', n: 2, passed: 1, share: 0.5 });
    expect(r.criteria.find((c) => c.id === 'lint')!.share).toBe(0);
    expect(r.incompleteReasons).toEqual([{ key: 'purity.reason.warning', params: { count: 1 } }, { key: 'purity.reason.needsReview', params: { count: 2 } }]);
    expect(PurityResultSchema.parse(r)).toEqual(r);
  });

  it('(b) 17 «محجوب»: the unit tests fail (blocking), the blocking failure comes first', () => {
    const checks = exampleA().map((c) => (c.checkId === 'beh.unit' ? { ...c, outcome: 'failed' as const, violations: 3 } : c));
    const r = round(checks);
    expect(r).toMatchObject({ verdict: 'blocked', karat: 17 });
    expect(r.p).toBeCloseTo(9.5 / 13, 10);
    expect(r.blockingFailures).toEqual([{ instance: 'beh.unit@.', checkId: 'beh.unit', component: '.', findings: 3 }]);
  });

  it('(c) 19 «غير مكتمل»: a Python library without tests never gets 24', () => {
    const r = round([check('code.lint', 'passed'), check('beh.unit', 'missing', { blocking: true }), check('sec.secrets.files', 'passed', { blocking: true }), check('sec.deps', 'passed'), check('code.refs.local', 'passed')]);
    expect(r).toMatchObject({ verdict: 'incomplete', karat: 19, criteriaCount: 5, checksCount: 5 });
    expect(r.criteria.find((c) => c.id === 'behavior')).toMatchObject({ n: 1, passed: 0, share: 0 });
    expect(r.incompleteReasons).toContainEqual({ key: 'purity.reason.missing', params: { count: 1 } });
  });

  it('(d) ten passing custom checks stay one criterion; a blocking secrets failure blocks whatever the number', () => {
    const customs = Array.from({ length: 10 }, (_, i) => check(`custom.c${i}`, 'passed'));
    const ok = round([...customs, check('sec.secrets.files', 'passed', { blocking: true })]);
    expect(ok).toMatchObject({ criteriaCount: 2, checksCount: 11, karat: 24, verdict: 'pure', narrow: true });
    const bad = round([...customs, check('sec.secrets.files', 'failed', { blocking: true })]);
    expect(bad).toMatchObject({ criteriaCount: 2, karat: 12, verdict: 'blocked' });
  });
});

describe('11.3 and 11.4: the rules of counting (AT-21)', () => {
  it('gives 24 with «نقي» only when every required check passed; «اجتاز بمراجعة» counts', () => {
    const all = round([check('code.build', 'passed'), check('beh.unit', 'passed', { reviewed: true }), check('code.lint', 'passed')]);
    expect(all).toMatchObject({ karat: 24, verdict: 'pure', p: 1, incompleteReasons: [] });
  });

  it('counts none of missing, unavailable, flaky, skipped, cancelled, warning, pending review, timed out, interrupted', () => {
    for (const o of ['missing', 'unavailable', 'flaky', 'skipped', 'cancelled', 'warning', 'needs_review', 'timed_out', 'interrupted', 'failed'] as const) {
      const r = round([check('code.build', 'passed'), check('code.lint', o)]);
      expect(r.karat, o).toBe(12);
      expect(r.verdict, o).toBe('incomplete');
      expect(r.incompleteReasons, o).toContainEqual({ key: `purity.reason.${outcomeWord(o)}`, params: { count: 1 } });
    }
    const absent = round([check('code.build', 'passed'), check('code.lint', null)]);
    expect(absent).toMatchObject({ karat: 12, counts: { absent: 1 } });
  });

  it('leaves a not applicable or optional check out of the denominator, and integ.* and code.complexity always', () => {
    const r = round([
      check('code.build', 'passed'),
      check('code.types', 'failed', { applicable: false }),
      check('code.lint', 'failed', { required: false }),
      { ...check('code.complexity', 'passed'), criterion: null, inIndex: false },
      { ...check('integ.guard', 'needs_review'), section: 'integrity', criterion: null, inIndex: false },
    ]);
    expect(r).toMatchObject({ karat: 24, criteriaCount: 1, checksCount: 1 });
  });

  it('shows no number when K = 0, and the verdict is «غير مكتمل» with why', () => {
    const r = round([check('code.lint', 'passed', { required: false })]);
    expect(r).toMatchObject({ karat: null, p: null, criteriaCount: 0, verdict: 'incomplete', narrow: false });
    expect(r.incompleteReasons[0]).toEqual({ key: 'purity.reason.noScope' });
  });

  it('marks a narrow scope below three criteria (and the threshold is a setting)', () => {
    expect(round([check('code.build', 'passed')])).toMatchObject({ narrow: true, criteriaCount: 1 });
    expect(round([check('code.build', 'passed'), check('code.lint', 'passed')])).toMatchObject({ narrow: true, criteriaCount: 2 });
    expect(round([check('code.build', 'passed'), check('code.lint', 'passed'), check('code.types', 'passed')])).toMatchObject({ narrow: false });
    expect(computePurity({ scope: { kind: 'round', roundId: null }, checks: [check('code.build', 'passed'), check('code.lint', 'passed'), check('code.types', 'passed')], integrity: CLEAN, narrowThreshold: 4, meta: META }).narrow).toBe(true);
  });

  it('keeps «نقي» away at P = 1 when an integrity reason holds (11.4 rules 8 to 10)', () => {
    const all = [check('code.build', 'passed'), check('code.lint', 'passed'), check('code.types', 'passed')];
    expect(round(all, { ...CLEAN, guardUnreviewed: 1 })).toMatchObject({ karat: 24, verdict: 'incomplete', incompleteReasons: [{ key: 'purity.reason.guardUnreviewed', params: { count: 1 } }] });
    expect(round(all, { ...CLEAN, stateChanged: true })).toMatchObject({ karat: 24, verdict: 'incomplete', incompleteReasons: [{ key: 'purity.reason.stateChanged' }] });
    expect(round(all, { ...CLEAN, modelClaimsOpen: 2 }).verdict).toBe('incomplete');
    expect(round(all, { ...CLEAN, reviewsExpired: 1 }).verdict).toBe('incomplete');
    expect(round(all, { ...CLEAN, checks: [...CLEAN.checks.slice(1), { checkId: 'integ.guard', outcome: 'unavailable' }] })).toMatchObject({ verdict: 'incomplete', incompleteReasons: [{ key: 'purity.reason.integrityCheck', params: { check: 'integ.guard', outcome: 'unavailable' } }] });
    // No integrity check at all is not a clean integrity (review, minor 1).
    expect(round(all, { ...CLEAN, checks: [] })).toMatchObject({ verdict: 'incomplete', karat: 24, incompleteReasons: [{ key: 'purity.reason.integrityNotEvaluated' }] });
    // A blocking failure still blocks, whatever the integrity says.
    expect(round([...all, check('beh.unit', 'failed', { blocking: true })], { ...CLEAN, stateChanged: true }).verdict).toBe('blocked');
  });

  it('counts what a review excluded beside the index (11.4 rule 7)', () => {
    expect(round([check('code.build', 'passed', { excludedByReview: 2 }), check('code.lint', 'passed', { excludedByReview: 1 })]).excludedByReview).toBe(3);
  });

  it('gives a section a karat marked «جزئي», with no verdict word', () => {
    const r = computePurity({ scope: { kind: 'section', section: 'security' }, checks: exampleA(), integrity: { ...CLEAN, stateChanged: true }, meta: META });
    expect(r).toMatchObject({ verdict: null, criteriaCount: 5, checksCount: 5 });
    expect(r.karat).toBe(19);
    expect(r.incompleteReasons).toEqual([{ key: 'purity.reason.needsReview', params: { count: 1 } }]);
    expect(puritySummary(r)).toMatchObject({ partial: true, section: 'security', verdict: null, karat: 19 });
    expect(puritySummary(round(exampleA()))).toMatchObject({ partial: false, roundId: 'rnd_1', verdict: 'incomplete', karat: 19, criteriaCount: 13, checksCount: 15 });
  });

  it('counts the instances of a check (AT-47: two components, n_k = 2)', () => {
    const r = round([check('beh.unit', 'failed', { instance: 'beh.unit@packages/a', component: 'packages/a', blocking: true }), check('beh.unit', 'passed', { instance: 'beh.unit@packages/b', component: 'packages/b', blocking: true })]);
    expect(r.criteria).toEqual([{ id: 'behavior', section: 'behavior', n: 2, passed: 1, share: 0.5 }]);
    expect(r).toMatchObject({ karat: 12, verdict: 'blocked' });
  });
});

// ── properties (plan 19, fast-check) ─────────────────────────────────────────────────────────────────────────

const POOL = ['build', 'types', 'lint', 'references', 'behavior', 'secrets', 'vulnerabilities', 'manifest', 'permissions', 'direction', 'accessibility', 'custom'];
const arbCheck = fc.record({
  criterion: fc.constantFrom(...POOL),
  outcome: fc.constantFrom<CheckOutcome | null>(...CHECK_OUTCOMES, null),
  blocking: fc.boolean(),
  required: fc.boolean(),
  applicable: fc.boolean(),
});
const arbChecks = fc.array(arbCheck, { minLength: 0, maxLength: 40 }).map((xs) =>
  xs.map((x, i): PurityCheckInput => ({ instance: `c${i}@.`, checkId: `c${i}`, component: '.', section: 'code', criterion: x.criterion, inIndex: true, required: x.required, applicable: x.applicable, blocking: x.blocking, outcome: x.outcome, reviewed: false, violations: 0, excludedByReview: 0, checkRunId: null })),
);
const scope = { kind: 'round' as const, roundId: null };

/** P as an exact fraction, recomputed independently of the module. */
function exactP(checks: readonly PurityCheckInput[]): { num: bigint; den: bigint } | null {
  const R = checks.filter((c) => inR(c, scope));
  const by = new Map<string, { n: number; passed: number }>();
  for (const c of R) {
    const k = by.get(c.criterion!) ?? { n: 0, passed: 0 };
    k.n++;
    if (c.outcome === 'passed') k.passed++;
    by.set(c.criterion!, k);
  }
  if (!by.size) return null;
  // Σ passed_k/n_k over K, with the product of the denominators (independent of the module's lcm).
  let num = 0n;
  let den = 1n;
  for (const k of by.values()) {
    num = num * BigInt(k.n) + BigInt(k.passed) * den;
    den *= BigInt(k.n);
  }
  return { num, den: den * BigInt(by.size) };
}

describe('properties of purity/1 (plan 19, D-10, NFR-10)', () => {
  it('gives 24 if and only if every required, applicable check passed (K > 0)', () => {
    fc.assert(
      fc.property(arbChecks, (checks) => {
        const r = computePurity({ scope, checks, integrity: CLEAN, meta: META });
        const R = checks.filter((c) => inR(c, scope));
        const allPassed = R.length > 0 && R.every((c) => c.outcome === 'passed');
        return (r.karat === 24) === allPassed;
      }),
      { numRuns: 2000 },
    );
  });

  it('never rounds up: karat ≤ 24·P < karat + 1, exactly', () => {
    fc.assert(
      fc.property(arbChecks, (checks) => {
        const r = computePurity({ scope, checks, integrity: CLEAN, meta: META });
        const p = exactP(checks);
        if (!p) return r.karat === null;
        const k = BigInt(r.karat!);
        return k * p.den <= 24n * p.num && 24n * p.num < (k + 1n) * p.den;
      }),
      { numRuns: 2000 },
    );
  });

  it('does not raise a criterion\'s weight by adding passing checks to it', () => {
    fc.assert(
      fc.property(arbChecks, fc.integer({ min: 1, max: 20 }), fc.nat(), (checks, extra, pick) => {
        const before = computePurity({ scope, checks, integrity: CLEAN, meta: META });
        if (before.criteriaCount === 0) return true;
        const k = before.criteria[pick % before.criteria.length]!;
        const added = Array.from({ length: extra }, (_, i): PurityCheckInput => ({ instance: `x${i}@.`, checkId: `x${i}`, component: '.', section: 'code', criterion: k.id, inIndex: true, required: true, applicable: true, blocking: false, outcome: 'passed', reviewed: false, violations: 0, excludedByReview: 0, checkRunId: null }));
        const after = computePurity({ scope, checks: [...checks, ...added], integrity: CLEAN, meta: META });
        // The same K; every other criterion unchanged; this one's share stays within [0, 1], so the total rises
        // by at most (1 - share_k) / K: the weight of a criterion is 1/K, never more.
        const others = (r: typeof before) => r.criteria.filter((c) => c.id !== k.id);
        const kAfter = after.criteria.find((c) => c.id === k.id)!;
        return after.criteriaCount === before.criteriaCount && JSON.stringify(others(after)) === JSON.stringify(others(before)) && kAfter.share <= 1 && after.p! <= before.p! + (1 - k.share) / before.criteriaCount + 1e-12;
      }),
      { numRuns: 1000 },
    );
  });

  it('never shows a blocking failure under another verdict than «محجوب»', () => {
    fc.assert(
      fc.property(arbChecks, (checks) => {
        const r = computePurity({ scope, checks, integrity: CLEAN, meta: META });
        const blockingFailed = checks.some((c) => c.blocking && c.applicable && c.outcome === 'failed');
        return blockingFailed === (r.verdict === 'blocked') && (r.verdict !== 'pure' || (r.karat === 24 && r.blockingFailures.length === 0));
      }),
      { numRuns: 2000 },
    );
  });

  it('gives the same result for the same inputs, in any order (NFR-10)', () => {
    fc.assert(
      fc.property(arbChecks, (checks) => {
        const a = computePurity({ scope, checks, integrity: CLEAN, meta: META });
        const b = computePurity({ scope, checks: [...checks].reverse(), integrity: CLEAN, meta: META });
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: 500 },
    );
  });
});
