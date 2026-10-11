// Plan 20's expected results against what the engine found (AT-14, AT-16): for each expectation of a variant,
// the outcome, the origin, and — when a finding is expected — the finding at its place with its rule, the tool's
// rule and its proof; and in a clean variant, no finding that weighs on an outcome. What belongs to a later phase
// (the integrity checks and the guard's effect, DEV-9) is listed apart with why, never counted as a pass.
import type { CheckRunDetail, Finding, RunDetail } from '@ayar/protocol';
import { ORIGIN, OUTCOME, PROOF, type Expectation } from './scan.ts';

/** The checks whose runner is a later phase's: the integrity checks (DEV-9). The probe's are DEV-7's, and checked. */
export const LATER: Record<string, string> = {
  'integ.guard': 'DEV-9',
  'integ.state': 'DEV-9',
  'integ.reviews': 'DEV-9',
  'integ.model-claims': 'DEV-9',
};

export interface Row {
  project: string;
  variant: string;
  instance: string;
  expected: string;
  actual: string;
  ok: boolean;
  /** Why it differs, or why it is not DEV-6's to check. */
  notes: string[];
  later: string | null;
  finding: Finding | null;
}

const weighs = (f: Finding) => f.effect === 'violation' || f.effect === 'warning' || f.effect === 'review';

/** The finding an expectation names: at its file (and line), by its tool rule or its rule when given. */
export function matchFinding(e: Expectation, findings: readonly Finding[]): Finding | null {
  if (!e.location?.path) return null;
  const at = findings.filter((f) => f.location?.path === e.location!.path && (e.location!.line === undefined || f.location?.line === e.location!.line));
  const byRule = at.filter((f) => (!e.rule || f.ruleId === e.rule) && (!e.tool_rule || f.toolRuleId === e.tool_rule));
  return byRule.find(weighs) ?? byRule[0] ?? at.find(weighs) ?? at[0] ?? null;
}

export function compare(project: string, variant: string, e: Expectation, instance: string, c: CheckRunDetail | undefined, findings: readonly Finding[], later: string | null): Row {
  const want = OUTCOME[e.result] ?? `?${e.result}`;
  const notes: string[] = [];
  const mine = c ? findings.filter((f) => f.checkRunId === c.checkRunId) : [];
  const f = c ? matchFinding(e, mine) : null;
  if (!c) notes.push('not run');
  else {
    if (c.outcome !== want) notes.push(`outcome ${c.outcome ?? 'null'} (${c.outcomeReason?.key ?? ''}${c.outcomeReason?.params ? ` ${JSON.stringify(c.outcomeReason.params)}` : ''})`);
    if (e.origin && (want === 'failed' || want === 'unavailable') && c.origin !== ORIGIN[e.origin]) notes.push(`origin ${c.origin ?? 'null'}, expected ${ORIGIN[e.origin] ?? e.origin}`);
    if (e.exit_code !== undefined && want !== 'timed_out' && c.raw && c.raw.exitCode !== e.exit_code) notes.push(`exit ${c.raw.exitCode ?? 'null'}, expected ${e.exit_code}`);
    // A finding is expected wherever a place is given, except for an outcome that reads no report.
    const expectsFinding = e.location?.path && e.location.history === undefined && !['missing', 'unavailable', 'timed_out', 'not_applicable', 'skipped'].includes(want);
    if (expectsFinding) {
      if (!f) notes.push(`no finding at ${e.location!.path}${e.location!.line ? `:${e.location!.line}` : ''} (found: ${mine.map((x) => `${x.ruleId}@${x.location?.path ?? '-'}:${x.location?.line ?? '-'}`).join(', ') || 'none'})`);
      else {
        if (e.rule && f.ruleId !== e.rule) notes.push(`rule ${f.ruleId}, expected ${e.rule}`);
        if (e.tool_rule && f.toolRuleId !== e.tool_rule) notes.push(`tool rule ${f.toolRuleId ?? 'null'}, expected ${e.tool_rule}`);
        if (e.confidence && PROOF[e.confidence] && f.proof !== PROOF[e.confidence]) notes.push(`proof ${f.proof}, expected ${PROOF[e.confidence]}`);
      }
    }
    // Zero findings that weigh in a pass (a clean variant, or a passing check of a defect one).
    if (want === 'passed' && mine.some(weighs)) notes.push(`a passing check with findings: ${mine.filter(weighs).map((x) => `${x.ruleId}@${x.location?.path ?? '-'}`).join(', ')}`);
  }
  const actual = c ? `${c.outcome ?? 'null'}${f ? ` ${f.ruleId}@${f.location?.path ?? '-'}:${f.location?.line ?? '-'} ${f.proof}` : ''}` : 'not run';
  return { project, variant, instance, expected: `${want}${e.location?.path ? ` @${e.location.path}:${e.location.line ?? '-'}` : ''}`, actual, ok: later !== null || notes.length === 0, notes: later ? [`${later}: ${notes.join('; ') || 'matches already'}`] : notes, later, finding: f };
}

/** The engine's result for one expectation of a run. */
export function rowFor(project: string, variant: string, e: Expectation, instance: string, detail: RunDetail | null, findings: readonly Finding[], laterReason?: string | null, shown?: string): Row {
  const later = laterReason ?? LATER[e.check] ?? null;
  const row = compare(project, variant, e, instance, detail?.checks.find((x) => x.instance === instance), findings, later);
  return shown ? { ...row, instance: shown } : row;
}

/** The conformance report printed as the acceptance evidence (one line per expectation). */
export function report(rows: readonly Row[]): string {
  const bad = rows.filter((r) => !r.ok);
  const lines = rows.map((r) => `${r.ok ? (r.later ? '·' : '✓') : '✗'} ${r.project}/${r.variant} ${r.instance}: expected ${r.expected}; got ${r.actual}${r.notes.length ? ` — ${r.notes.join('; ')}` : ''}`);
  return `${lines.join('\n')}\n${rows.length - bad.length}/${rows.length} as expected (${rows.filter((r) => r.later).length} for a later phase), ${bad.length} different`;
}
