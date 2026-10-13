// C-22 «المقارنة» (FR-39, 11.5, AT-22): two runs of one project side by side — each check's outcome before and
// after, the findings new, persisting, resolved and reappeared, the karat and the verdict — with the comparability
// notes of 11.5: a different profile version, catalog, formula, tool versions, environment or scope makes the
// comparison indirect, and a higher karat is never called an improvement when the blocking failures grew or the
// scope changed. Pure over what the database holds; it computes nothing new about the project.
import type { CheckOutcome, FindingLocation, PurityResult, Reason, RunComparison } from '@ayar/protocol';
import { PurityResult as PuritySchema } from '@ayar/protocol';
import { CommandError } from '../host/errors.ts';
import { parseRunEnvironment } from '../projects/context.ts';
import type { Db } from '../storage/db.ts';

interface RunRow {
  id: string;
  display_id: string;
  project_id: string;
  kind: string;
  profile_version: number | null;
  profile_hash: string | null;
  catalog_version: string | null;
  purity_formula: string | null;
  purity_json: string | null;
  verdict: string | null;
  round_id: string | null;
  env_json: string | null;
  selection_json: string;
}

interface FindingRow {
  fingerprint: string;
  display_id: string;
  check_id: string;
  rule_id: string | null;
  location_json: string | null;
  effect: string | null;
}

const side = (r: RunRow, p: PurityResult | null, roundDisplayId: string | null): RunComparison['from'] => ({
  runId: r.id,
  displayId: r.display_id,
  roundDisplayId,
  karat: p?.karat ?? null,
  verdict: p?.verdict ?? r.verdict ?? null,
  criteria: p?.criteriaCount ?? 0,
  checks: p?.checksCount ?? 0,
  blockingFailures: p?.blockingFailures.length ?? 0,
});

const brief = (f: FindingRow) => ({ displayId: f.display_id, checkId: f.check_id, ruleId: f.rule_id ?? '', location: f.location_json ? (JSON.parse(f.location_json) as FindingLocation) : null });

export function compareRuns(db: Db, fromRunId: string, toRunId: string): RunComparison {
  const cols = 'id, display_id, project_id, kind, profile_version, profile_hash, catalog_version, purity_formula, purity_json, verdict, round_id, env_json, selection_json';
  const a = db.get<RunRow>(`SELECT ${cols} FROM runs WHERE id = ?`, fromRunId);
  const b = db.get<RunRow>(`SELECT ${cols} FROM runs WHERE id = ?`, toRunId);
  if (!a || !b) throw new CommandError('not_found', { reason: 'run' });
  if (a.project_id !== b.project_id) throw new CommandError('invalid_payload', { path: 'toRunId', reason: 'different_project' });
  const purity = (r: RunRow): PurityResult | null => {
    if (!r.purity_json) return null;
    const p = PuritySchema.safeParse(JSON.parse(r.purity_json));
    return p.success ? p.data : null;
  };
  const pa = purity(a);
  const pb = purity(b);
  const roundOf = (r: RunRow) => (r.round_id ? db.get<{ display_id: string }>('SELECT display_id FROM rounds WHERE id = ?', r.round_id)?.display_id ?? null : null);

  // 11.5 «ملاحظات قابلية المقارنة».
  const notes: Reason[] = [];
  if (a.profile_version !== b.profile_version || a.profile_hash !== b.profile_hash) notes.push({ key: 'compare.note.profileDiffers', params: { from: a.profile_version ?? 0, to: b.profile_version ?? 0 } });
  if (a.catalog_version !== b.catalog_version) notes.push({ key: 'compare.note.catalogDiffers', params: { from: a.catalog_version ?? '', to: b.catalog_version ?? '' } });
  if (a.purity_formula !== b.purity_formula) notes.push({ key: 'compare.note.formulaDiffers', params: { from: a.purity_formula ?? '', to: b.purity_formula ?? '' } });
  const toolsA = pa?.meta.toolVersions ?? {};
  const toolsB = pb?.meta.toolVersions ?? {};
  const toolDiffs = [...new Set([...Object.keys(toolsA), ...Object.keys(toolsB)])].filter((k) => toolsA[k] !== undefined && toolsB[k] !== undefined && toolsA[k] !== toolsB[k]);
  if (toolDiffs.length) notes.push({ key: 'compare.note.toolsDiffer', params: { tools: toolDiffs.slice(0, 10).join(', '), count: toolDiffs.length } });
  if ((pa?.meta.environmentSource ?? null) !== (pb?.meta.environmentSource ?? null)) notes.push({ key: 'compare.note.environmentDiffers' });
  // The environment each run recorded (runs.env_json): the system, the environment's source, Node, Python and the
  // package manager. The project's types and AYAR's own version are not the environment.
  const envOf = (r: RunRow) => {
    const e = parseRunEnvironment(r.env_json);
    return e ? JSON.stringify([e.os, e.source, e.node, e.python, e.packageManager]) : null;
  };
  const envA = envOf(a);
  const envB = envOf(b);
  if (envA && envB && envA !== envB) notes.push({ key: 'compare.note.environmentDiffers' });
  const scopeChanged = a.kind !== b.kind || a.selection_json !== b.selection_json || (pa && pb && (pa.criteriaCount !== pb.criteriaCount || pa.checksCount !== pb.checksCount));
  if (scopeChanged) notes.push({ key: 'compare.note.scopeDiffers', params: { from: `${pa?.criteriaCount ?? 0}/${pa?.checksCount ?? 0}`, to: `${pb?.criteriaCount ?? 0}/${pb?.checksCount ?? 0}` } });

  // The karat's movement, honestly (11.5).
  let karatChange: RunComparison['karatChange'] = 'no_karat';
  if (pa?.karat !== null && pa?.karat !== undefined && pb?.karat !== null && pb?.karat !== undefined) {
    const blockingGrew = pb.blockingFailures.length > pa.blockingFailures.length;
    if (scopeChanged || blockingGrew) karatChange = 'not_comparable';
    else if (pb.karat > pa.karat) karatChange = 'improved';
    else if (pb.karat < pa.karat) karatChange = 'declined';
    else karatChange = 'same';
    if (blockingGrew) notes.push({ key: 'compare.note.blockingGrew', params: { from: pa.blockingFailures.length, to: pb.blockingFailures.length } });
  }

  // Each check: before and after.
  const outcomes = (runId: string) => new Map(db.all<{ check_id: string; component: string; outcome: string | null }>('SELECT check_id, component, outcome FROM check_runs WHERE run_id = ?', runId).map((r) => [`${r.check_id}@${r.component}`, (r.outcome as CheckOutcome | null) ?? null]));
  const oa = outcomes(a.id);
  const ob = outcomes(b.id);
  const instances = [...new Set([...oa.keys(), ...ob.keys()])].sort();
  const checks = instances.map((instance) => ({ instance, before: oa.get(instance) ?? null, after: ob.get(instance) ?? null, changed: (oa.get(instance) ?? null) !== (ob.get(instance) ?? null) }));

  // Findings: by fingerprint, excluding what a review excluded and the notes.
  const findings = (runId: string) => db.all<FindingRow>("SELECT f.fingerprint, f.display_id, f.check_id, f.rule_id, f.location_json, f.effect FROM findings f JOIN check_runs c ON c.id = f.check_run_id WHERE c.run_id = ? AND coalesce(f.effect, '') NOT IN ('excluded', 'note') AND f.check_id NOT LIKE 'integ.%' ORDER BY f.display_id", runId);
  const fa = new Map(findings(a.id).map((f) => [f.fingerprint, f]));
  const fb = new Map(findings(b.id).map((f) => [f.fingerprint, f]));
  const everBefore = new Set(db.all<{ fingerprint: string }>('SELECT fingerprint FROM finding_ids WHERE project_id = ? AND first_seen_run_id IS NOT NULL AND first_seen_run_id <> ?', a.project_id, b.id).map((r) => r.fingerprint));
  const resolved = [...fa.values()].filter((f) => !fb.has(f.fingerprint)).map(brief);
  const persisting = [...fb.values()].filter((f) => fa.has(f.fingerprint)).map(brief);
  const fresh = [...fb.values()].filter((f) => !fa.has(f.fingerprint));
  const reappeared = fresh.filter((f) => everBefore.has(f.fingerprint)).map(brief);
  const neu = fresh.filter((f) => !everBefore.has(f.fingerprint)).map(brief);
  return { from: side(a, pa, roundOf(a)), to: side(b, pb, roundOf(b)), notes, karatChange, checks, findings: { resolved, new: neu, persisting, reappeared } };
}
