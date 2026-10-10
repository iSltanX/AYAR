// 28.2-و «البنود غير الموصى بها» with the plan's correction (G-37.2, C-20 rule 4): the archive's fixed reasons could
// state a consequence or a rollback that contradicts the input («إصلاح خلل يمس بيانات بعاقبة 4 وتراجع صعب يُغفل
// بروفة الترحيل، بتفسير ثابت يقول إن العاقبة دون تعطّل جوهري والتراجع سهل», 3.1). Here each reason is the list of
// the actual input values that kept the item out, plus the archive's advice that names no input (`hint`).
import type { Explanation } from '@ayar/protocol';
import { any, has, sourceOf, type Effective } from './context.ts';

interface OmitRule {
  item: string;
  /** The archive's condition for showing the item as «غير موصى به» (28.2-و), transcribed. */
  when(e: Effective): boolean;
  /** The input facts that explain the absence, and which of the kb hints applies. */
  facts(e: Effective): { facts: Explanation[]; hint: number };
}

const fact = (e: Effective, key: 'impact' | 'audience' | 'reversibility' | 'scope' | 'evidence' | 'situation' | 'expected'): Explanation => {
  if (key === 'expected') return { code: 'advisor.fact.expected', values: { expected: e.expected ?? 'unknown' } };
  if (key === 'situation') return { code: 'advisor.fact.situation', values: { situation: e.situation } };
  return { code: `advisor.fact.${key}`, values: { [key]: e[key], source: sourceOf(e, key) } };
};
const areaFact = (e: Effective, area: string): Explanation => ({ code: has(e.areas, area as Effective['areas'][number]) ? 'advisor.fact.areaPresent' : 'advisor.fact.areaAbsent', values: { area } });

export const OMIT_RULES: readonly OmitRule[] = [
  {
    item: 'e2e_critical',
    when: (e) => e.situation !== 'cosmetic',
    facts: (e) => (has(e.areas, 'ui') ? { facts: [fact(e, 'impact'), fact(e, 'situation')], hint: 0 } : { facts: [areaFact(e, 'ui'), fact(e, 'situation')], hint: 1 }),
  },
  { item: 'regression_full', when: (e) => e.situation !== 'cosmetic', facts: (e) => ({ facts: [fact(e, 'situation'), fact(e, 'scope')], hint: 0 }) },
  { item: 'perf_budget', when: (e) => any(e.areas, ['logic', 'data', 'ui']) && e.situation !== 'cosmetic', facts: (e) => ({ facts: [areaFact(e, 'perf')], hint: 0 }) },
  { item: 'load_test', when: (e) => has(e.platform, 'api'), facts: (e) => ({ facts: [fact(e, 'audience'), areaFact(e, 'perf')], hint: 0 }) },
  { item: 'security_authz', when: (e) => e.audience !== 'me' && any(e.areas, ['data', 'external']), facts: (e) => ({ facts: [areaFact(e, 'auth')], hint: 0 }) },
  { item: 'a11y_check', when: (e) => has(e.areas, 'ui') && e.situation !== 'cosmetic', facts: (e) => ({ facts: [fact(e, 'audience')], hint: 0 }) },
  {
    item: 'migration_rehearsal',
    when: (e) => has(e.areas, 'data'),
    facts: (e) => ({
      facts: [fact(e, 'impact'), fact(e, 'reversibility'), { code: 'advisor.fact.migrations', values: { migrations: e.migrations ? 'yes' : 'no' } }],
      hint: 0,
    }),
  },
  { item: 'exploratory_session', when: (e) => e.situation !== 'cosmetic', facts: (e) => ({ facts: [fact(e, 'scope'), fact(e, 'expected')], hint: 0 }) },
  {
    item: 'characterization',
    when: (e) => ['refactor', 'change_behavior', 'shared_change'].includes(e.situation) && e.evidence === 'good',
    facts: (e) => ({ facts: [fact(e, 'evidence')], hint: 0 }),
  },
];
