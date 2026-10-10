// 28.2-أ «التطبيع والافتراضات» (normalize): the effective inputs `e` the rules read, with every assumption
// visible (`assumed`) and every unknown recorded (`missing`), never a silent default (C-20 rule 3).
import type { AdvisorArea, AdvisorContext, AdvisorImpact, AdvisorSituation, Explanation } from '@ayar/protocol';

/** 28.2-أ: the situations where «هل السلوك المتوقع محدد؟» applies (`APPLIES_EXPECTED` in the archive). */
export const APPLIES_EXPECTED: readonly AdvisorSituation[] = ['new_feature', 'change_behavior', 'new_project'];
/** 28.2-أ: the situations where an empty `areas` is not «ناقص». */
const AREAS_OPTIONAL: readonly AdvisorSituation[] = ['legacy_assess', 'new_project', 'release'];
const WIDE_BY_DEFAULT: readonly AdvisorSituation[] = ['release', 'legacy_assess', 'new_project'];

/** The project facts the advisor may read (C-20 «المدخلات»: حقائق الاكتشاف، نتائج آخر تشغيل). All optional. */
export interface AdvisorFacts {
  /** C-06's ecosystems for the project; they win over the `stack` text (28.9). */
  ecosystems?: readonly string[];
  /** Migration folders C-06 found (C-20 rule 5 «ترحيل مكتشف»). */
  migrationsDetected?: readonly string[];
  /** C-20 rule 7: the last AYAR run over the same scope, and whether it can stand as evidence. */
  priorRun?: { runId: string; sameState: boolean; sameTools: boolean; sameScope: boolean; passed: boolean } | null;
}

/** The effective inputs: what the rules of 28.3 call `e`. */
export interface Effective {
  situation: AdvisorSituation;
  areas: readonly AdvisorArea[];
  expected: 'clear' | 'vague' | null;
  impact: AdvisorImpact;
  audience: 'me' | 'small' | 'public';
  reversibility: 'easy' | 'hard';
  scope: 'local' | 'module' | 'wide';
  factors: readonly NonNullable<AdvisorContext['factors']>[number][];
  evidence: 'none' | 'weak' | 'good';
  automation: 'auto' | 'manual' | 'none' | null;
  flaky: boolean;
  platform: readonly NonNullable<AdvisorContext['platform']>[number][];
  stack: string;
  stage: 'proto' | 'active' | 'released' | 'maintenance' | null;
  frequency: 'rare' | 'frequent' | null;
  time: 'minutes' | 'hours' | 'days' | null;
  /** C-20 rule 5: a migration declared in the context or detected by C-06. */
  migrations: boolean;
  /** Which keys were assumed, so explanations can say «مفترض». */
  assumedKeys: ReadonlySet<string>;
}

export interface Normalized {
  e: Effective;
  assumed: { key: string; value: string | number; why: Explanation }[];
  missing: string[];
}

export const has = <T>(list: readonly T[], v: T): boolean => list.includes(v);
export const any = <T>(list: readonly T[], vs: readonly T[]): boolean => vs.some((v) => list.includes(v));

export function normalize(given: AdvisorContext, facts: AdvisorFacts = {}): Normalized {
  const assumed: Normalized['assumed'] = [];
  const missing: string[] = [];
  const assume = <V extends string | number>(key: string, value: V, values: Record<string, string | number> = {}): V => {
    assumed.push({ key, value, why: { code: `advisor.assume.${key}`, values: { [key]: value, ...values } } });
    missing.push(key);
    return value;
  };
  const areas = given.areas ?? [];
  const platform = given.platform ?? [];

  const impact = given.impact ?? assume('impact', 3);
  const audience = given.audience ?? assume('audience', 'small' as const);
  const scope = given.scope ?? assume('scope', WIDE_BY_DEFAULT.includes(given.situation) ? ('wide' as const) : ('module' as const), { situation: given.situation });
  const evidence = given.evidence ?? assume('evidence', 'weak' as const);
  let reversibility = given.reversibility;
  if (reversibility === undefined) {
    // 28.2-أ: hard for a mobile app, or when data is touched with a consequence of 3 or more; easy otherwise.
    const cause = has(platform, 'mobile') ? 'mobile' : has(areas, 'data') && impact >= 3 ? 'data' : 'none';
    reversibility = assume('reversibility', cause === 'none' ? ('easy' as const) : ('hard' as const), { cause });
  }
  // Recorded as missing without an assumption (28.2-أ).
  if (given.expected === undefined && APPLIES_EXPECTED.includes(given.situation)) missing.push('expected');
  if (!areas.length && !AREAS_OPTIONAL.includes(given.situation)) missing.push('areas');
  if (!given.stack) missing.push('stack');

  const e: Effective = {
    situation: given.situation,
    areas,
    expected: given.expected ?? null,
    impact,
    audience,
    reversibility,
    scope,
    factors: given.factors ?? [],
    evidence,
    automation: given.automation ?? null,
    flaky: given.flaky ?? false,
    platform,
    stack: given.stack ?? '',
    stage: given.stage ?? null,
    frequency: given.frequency ?? null,
    time: given.time ?? null,
    migrations: given.migrations === true || (facts.migrationsDetected?.length ?? 0) > 0,
    assumedKeys: new Set(assumed.map((a) => a.key)),
  };
  return { e, assumed, missing };
}

/** The effective inputs as JSON, for the output (`input.effective`). */
export function effectiveJson(e: Effective): Record<string, string | number | boolean | string[] | null> {
  return {
    situation: e.situation,
    areas: [...e.areas],
    expected: e.expected,
    impact: e.impact,
    audience: e.audience,
    reversibility: e.reversibility,
    scope: e.scope,
    factors: [...e.factors],
    evidence: e.evidence,
    automation: e.automation,
    flaky: e.flaky,
    platform: [...e.platform],
    stack: e.stack,
    stage: e.stage,
    frequency: e.frequency,
    time: e.time,
    migrations: e.migrations,
  };
}

/** `source` for an explanation that names an input: given by the user, or assumed. */
export const sourceOf = (e: Effective, key: string): 'given' | 'assumed' => (e.assumedKeys.has(key) ? 'assumed' : 'given');
