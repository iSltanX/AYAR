// Pure types and logic only: the UI imports from here, so no Node imports (see io.ts).
export type Outcome = 'passed' | 'failed' | 'blocked' | 'needs-review';
export interface CheckResult {
  readonly id: string;
  readonly outcome: Outcome;
  readonly required: boolean;
}
export type SectionVerdict = 'pure' | 'impure' | 'blocked';

// "Pure" only when every required check passed (plan: grade 24 iff all required passed).
export function sectionVerdict(results: readonly CheckResult[]): SectionVerdict {
  const required = results.filter((r) => r.required);
  if (required.some((r) => r.outcome === 'blocked')) return 'blocked';
  return required.length > 0 && required.every((r) => r.outcome === 'passed') ? 'pure' : 'impure';
}

