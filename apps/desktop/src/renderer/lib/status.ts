// The status vocabularies the components draw (plan 6.1-6.5 of the Figma prompt, D-DES2-09). Ids are the
// English ids of the prompt, as in the Figma variants and the i18n keys (status.*).
export const RESULTS = [
  'passed', 'failed', 'warning', 'needs-review', 'flaky', 'missing', 'unavailable', 'timed-out', 'cancelled',
  'interrupted', 'skipped', 'not-applicable',
] as const;
export type Result = (typeof RESULTS)[number];

/** What a result badge may show: a result, its "missing configuration" wording, or a reviewed pass/fail. */
export const BADGE_RESULTS = [...RESULTS, 'missing-configuration', 'passed-reviewed', 'failed-reviewed'] as const;
export type BadgeResult = (typeof BADGE_RESULTS)[number];

export const CYCLES = ['queued', 'running', 'cancelling'] as const;
export type Cycle = (typeof CYCLES)[number];

export const READINESS = ['ready', 'needs-setup', 'needs-approval', 'not-applicable', 'not-included'] as const;
export type Readiness = (typeof READINESS)[number];

export const VERDICTS = ['pure', 'incomplete', 'blocked'] as const;
export type Verdict = (typeof VERDICTS)[number];

export type SymbolName = Result | Cycle | 'running-static' | 'cancelling-static';

/** The colour family (status.css class) and the symbol of a badge result. */
export function badgeParts(result: BadgeResult): { family: Result; reviewed: boolean } {
  if (result === 'missing-configuration') return { family: 'missing', reviewed: false };
  if (result === 'passed-reviewed') return { family: 'passed', reviewed: true };
  if (result === 'failed-reviewed') return { family: 'failed', reviewed: true };
  return { family: result, reviewed: false };
}
