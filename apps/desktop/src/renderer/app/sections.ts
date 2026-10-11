// A section's page (13.3 «صفحة القسم», screens 9–15): its checks from the profile, grouped as the design shows them
// — in the full scan, optional and not included, not applicable —, each instance's latest execution (its result, its
// date, its findings), the section's partial karat from the latest complete round (11.5: never the number alone),
// and the last run that touched the section. The engine stays the source of truth: everything is read, nothing is
// guessed, and an instance that never ran has no result.
import type { CheckOutcome, CheckRunDetail, CheckSpec, ProfileView, PurityResult, ReadinessReport, RunDetail, RunView } from '@ayar/protocol';
import { attempt } from './client.ts';
import { rememberCustomTitles } from './format.ts';
import { sectionKarat } from './purity.ts';

/** One instance's latest finished execution, with the run it belongs to. */
export interface LatestExecution {
  run: RunView;
  check: CheckRunDetail;
}

export interface SectionModel {
  profile: ProfileView;
  readiness: ReadinessReport | null;
  runs: RunView[];
  /** Applicable and in the full scan («الفحوص المطلوبة وفي الفحص الكامل»). */
  included: CheckSpec[];
  /** Applicable, not included («اختيارية وغير مضمّنة»), with what each lacks. */
  optional: CheckSpec[];
  /** Not applicable to this project, with why (folded). */
  notApplicable: CheckSpec[];
  latest: Map<string, LatestExecution>;
  /** The latest complete full round (no cancel), for the section's karat. */
  round: RunDetail | null;
  /** The latest run that executed a check of this section. */
  lastRun: RunView | null;
}

/** Runs read at most when looking for each instance's latest execution (the retention keeps 20 by default). */
const RUNS_READ = 25;

export async function loadSection(projectId: string, section: string): Promise<SectionModel | null> {
  const [prof, ready, list] = await Promise.all([attempt('profile.get', { projectId }), attempt('readiness.evaluate', { projectId, probe: false }), attempt('runs.list', { projectId })]);
  if (!prof.ok) return null;
  const profile = prof.result;
  rememberCustomTitles(profile.custom);
  const specs = profile.checks.filter((c) => c.section === section);
  const runs = list.ok ? list.result.runs : [];
  const wanted = new Set(specs.map((s) => s.instance));
  const latest = new Map<string, LatestExecution>();
  let round: RunDetail | null = null;
  let lastRun: RunView | null = null;
  const finished = runs.filter((r) => r.state === 'finished' || r.state === 'interrupted').slice(0, RUNS_READ);
  for (const run of finished) {
    const roundCandidate = !round && run.kind === 'full' && !run.cancelReason && run.purity;
    if (latest.size === wanted.size && !roundCandidate) continue;
    const got = await attempt('run.get', { runId: run.runId });
    if (!got.ok) continue;
    if (roundCandidate) round = got.result;
    for (const c of got.result.checks) {
      if (!wanted.has(c.instance) || c.state !== 'finished' || !c.outcome || latest.has(c.instance)) continue;
      latest.set(c.instance, { run, check: c });
      lastRun ??= run;
    }
    if (latest.size === wanted.size && round) break;
  }
  return {
    profile,
    readiness: ready.ok ? ready.result : null,
    runs,
    included: specs.filter((s) => s.applicable && s.enabled && s.included),
    optional: specs.filter((s) => s.applicable && !(s.enabled && s.included)),
    notApplicable: specs.filter((s) => !s.applicable),
    latest,
    round,
    lastRun,
  };
}

/** The section's partial karat from the latest complete round (9.10, 11.5), or its absence. */
export function karatOf(model: SectionModel, section: string): { karat: number | null; criteria: number; purity: PurityResult | null } {
  const purity = model.round?.purity ?? null;
  return { ...sectionKarat(purity, section), purity };
}

/** Counts of the latest outcomes of the included checks, in the status order («اجتاز 4 · ناقص 2»). */
export function latestCounts(model: SectionModel, specs: readonly CheckSpec[]): Partial<Record<CheckOutcome, number>> {
  const by: Partial<Record<CheckOutcome, number>> = {};
  for (const s of specs) {
    const o = model.latest.get(s.instance)?.check.outcome;
    if (o) by[o] = (by[o] ?? 0) + 1;
  }
  return by;
}

/** The findings behind an execution's outcome, excluded ones apart (D-35: never a silent exclusion). */
export function findingsCount(c: CheckRunDetail): number {
  return c.findings.violations + c.findings.warnings + c.findings.review + c.findings.notes;
}

/** The readiness of an instance now: the readiness report's, or its spec's missing requirements. */
export function readinessOfInstance(model: SectionModel, spec: CheckSpec): ReadinessReport['items'][number]['readiness'] {
  const item = model.readiness?.items.find((i) => i.instance === spec.instance);
  if (item) return item.readiness;
  if (!spec.applicable) return 'not_applicable';
  if (!spec.included) return 'not_included';
  return 'ready';
}

/** What an optional instance lacks to become required, and the one action that gives it (screen 9 «اختيارية»). */
export type OptionalAction = { kind: 'define'; ref: string } | { kind: 'approve' } | { kind: 'include' } | { kind: 'none' };

export function optionalAction(model: SectionModel, spec: CheckSpec): OptionalAction {
  const ref = spec.missing.find((m) => m.kind === 'configuration' && m.ref)?.ref;
  if (ref) return { kind: 'define', ref };
  if (model.profile.pending.items.some((i) => i.instance === spec.instance)) return { kind: 'approve' };
  if (spec.reasons.some((r) => r.key === 'profile.reason.defaultOptional' || r.key === 'profile.reason.conditionUnmet' || r.key === 'profile.reason.suggested')) return { kind: 'include' };
  return { kind: 'none' };
}
