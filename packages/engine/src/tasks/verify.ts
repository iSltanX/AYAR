// 12.8 «ما يثبته عِيَار عند الإغلاق، وما لا يثبته»: a test card is «متحققة» when the verifying run proves four
// things — the count of executed tests rose since the card was made, the related check passed, a new or changed test
// file names the target symbol or file, and no integrity finding touches the card's checks. «يفشل عند كسر السلوك» is
// an instruction to the implementer, not something AYAR proves: the verified card carries «قوة الاختبار غير مثبتة»
// until beh.mutation, run with per-test coverage and without bail (`--coverageAnalysis perTest --disableBail`, S-30),
// shows a mutant the new test killed (`killedBy`). A setup card closes when its gap is gone; a fix-verification card
// when its finding is gone in a recheck without an integrity finding on its check. A model's note that a card is
// done changes nothing here: it is not among the inputs.
import type { TaskRecord, TaskVerification } from '@ayar/protocol';
import { posix } from 'node:path';
import type { Manifest, ManifestEntry } from '../evidence/snapshot.ts';
import type { EnginePorts } from '../ports/index.ts';

/** What was true when the card was made (kept with it): the last run, its state, the test count of its checks. */
export interface CardBase {
  runId: string | null;
  snapshotId: string | null;
  tests: number;
}

export interface RunFacts {
  runId: string;
  checks: { checkRunId: string; checkId: string; component: string; outcome: string | null; tests: number | null }[];
  guardFindings: { checkId: string; rule: string; path: string | null }[];
  /** The fingerprints present (not excluded) in this run. */
  presentFingerprints: ReadonlySet<string>;
  fingerprintOf: (displayId: string) => string | null;
  /** The run's end state (or start), for the test files that are new or changed since the card's base. */
  manifest: Manifest | null;
  text: (entry: ManifestEntry) => Promise<string | null>;
}

const TEST_FILE = /(^|\/)(__tests__\/.*|.*\.(test|spec)\.[cm]?[jt]sx?|test_[^/]*\.py|[^/]*_test\.py)$/;
const TEST_TYPES = new Set(['unit_test', 'integration_test', 'journey_test', 'property_test', 'characterization_test', 'bug_repro_test', 'strengthen_assertions']);
const SETUP_TYPES = new Set(['check_setup', 'ui_states_definition']);
const MAX_REPORT_BYTES = 50 * 1024 * 1024;

/** The words of the target the new test must name: the file's stem and the symbol, if the card has them. */
export function targetWords(card: TaskRecord['card']): string[] {
  const words = new Set<string>();
  const loc = card.location ?? '';
  const path = loc.split(':')[0] ?? '';
  const stem = posix.basename(path).replace(/\.[^.]+$/, '');
  if (stem && stem !== 'يحدده المالك') words.add(stem);
  // A symbol in the subject: `verifySession()` or `median([…])` — an identifier followed by a parenthesis, or a code span.
  for (const m of card.subject.matchAll(/`([^`]+)`|\b([A-Za-z_$][A-Za-z0-9_$]{2,})\s*\(/g)) words.add((m[1] ?? m[2] ?? '').replace(/\(.*$/, '').trim());
  return [...words].filter((w) => w.length >= 3);
}

/** Test files that are new or whose content changed between the base and the run's state. */
export function changedTestFiles(base: Manifest | null, now: Manifest): ManifestEntry[] {
  const before = new Map((base?.files ?? []).map((f) => [f[0], f[5]]));
  return now.files.filter((f) => TEST_FILE.test(f[0]) && before.get(f[0]) !== f[5]);
}

/** Stryker's report (`reports/mutation/mutation.json`): the test files whose tests killed at least one mutant. */
export function killingTestFiles(json: unknown): Set<string> {
  const out = new Set<string>();
  if (!json || typeof json !== 'object') return out;
  const r = json as { files?: Record<string, { mutants?: { status?: string; killedBy?: string[] }[] }>; testFiles?: Record<string, { tests?: { id?: string; name?: string }[] }> };
  const testById = new Map<string, string>();
  for (const [file, t] of Object.entries(r.testFiles ?? {})) for (const test of t.tests ?? []) if (test.id) testById.set(test.id, file);
  for (const f of Object.values(r.files ?? {})) for (const m of f.mutants ?? []) if (m.status === 'Killed') for (const id of m.killedBy ?? []) if (testById.has(id)) out.add(testById.get(id)!);
  return out;
}

export async function verifyCard(task: TaskRecord, base: CardBase, run: RunFacts, o: { baseManifest: Manifest | null; ports: EnginePorts; root: string | null }): Promise<TaskVerification | null> {
  const card = task.card;
  const checks = card.verify.length ? run.checks.filter((c) => card.verify.includes(c.checkId)) : [];
  const isTest = TEST_TYPES.has(card.type);
  const isSetup = SETUP_TYPES.has(card.type);
  const isFix = card.type === 'fix_verification';
  if (!isTest && !isSetup && !isFix) return null; // review cards close by decision alone (12.8)
  if ((isTest || isSetup) && !checks.length) return null; // the run says nothing about this card
  const reasons: string[] = [];
  const now = new Date().toISOString();
  const guardTouches = run.guardFindings.some((g) => card.verify.includes(g.checkId) || (isFix && g.checkId === card.verify[0]));
  const noIntegrityFinding = !guardTouches;
  if (!noIntegrityFinding) reasons.push('tasks.verify.integrityFinding');

  if (isFix) {
    const fp = task.follows ? run.fingerprintOf(task.follows) : null;
    const checkRan = checks.some((c) => ['passed', 'failed', 'warning', 'needs_review', 'flaky'].includes(c.outcome ?? ''));
    const resolved = fp !== null && checkRan ? !run.presentFingerprints.has(fp) : false;
    if (!checkRan) reasons.push('tasks.verify.checkDidNotRun');
    else if (!resolved) reasons.push('tasks.verify.findingPersists');
    return { runId: run.runId, checkedAt: now, testsIncreased: null, checkPassed: checkRan ? checks.every((c) => c.outcome === 'passed' || c.outcome === 'warning') : null, targetMentioned: null, noIntegrityFinding, findingResolved: resolved, strength: 'not_applicable', reasons };
  }

  if (isSetup) {
    // «تُغلق بزوال نقصها»: the check can run now (its outcome is not «ناقص» any more), whatever it found.
    const gone = checks.every((c) => c.outcome !== null && c.outcome !== 'missing' && c.outcome !== 'not_applicable' && c.outcome !== 'skipped');
    if (!gone) reasons.push('tasks.verify.stillMissing');
    return { runId: run.runId, checkedAt: now, testsIncreased: null, checkPassed: gone, targetMentioned: null, noIntegrityFinding, findingResolved: null, strength: 'not_applicable', reasons };
  }

  // A test card: the four conditions of 12.8.
  const tests = checks.reduce((n, c) => n + (c.tests ?? 0), 0);
  const counted = checks.some((c) => c.tests !== null);
  const testsIncreased = counted ? tests > base.tests : false;
  if (!testsIncreased) reasons.push(counted ? 'tasks.verify.testsNotIncreased' : 'tasks.verify.noTestCounts');
  const checkPassed = checks.every((c) => c.outcome === 'passed');
  if (!checkPassed) reasons.push('tasks.verify.checkNotPassed');
  let targetMentioned = false;
  const words = targetWords(card);
  const changed = run.manifest ? changedTestFiles(o.baseManifest, run.manifest) : [];
  if (words.length && changed.length) {
    for (const entry of changed) {
      const text = await run.text(entry);
      if (text !== null && words.some((w) => text.includes(w))) {
        targetMentioned = true;
        break;
      }
    }
  }
  if (!targetMentioned) reasons.push(changed.length ? 'tasks.verify.targetNotMentioned' : 'tasks.verify.noNewTest');

  // Strength: a mutant killed by a test in one of the new or changed test files (S-30), from the project's own report.
  let strength: TaskVerification['strength'] = 'unproven';
  if (o.root && changed.length && card.verify.some((c) => c === 'beh.mutation' || c === 'beh.unit')) {
    const component = (card.location ?? '').split(':')[0]?.split('/').slice(0, -1).join('/') ?? '';
    for (const rel of [...new Set([posix.join(component || '.', 'reports/mutation/mutation.json'), 'reports/mutation/mutation.json'])]) {
      try {
        const st = await o.ports.fs.lstat(posix.join(o.root, rel));
        if (!st?.isFile || st.size > MAX_REPORT_BYTES) continue;
        const { data } = await o.ports.fs.readFilePrefix(posix.join(o.root, rel), MAX_REPORT_BYTES);
        const killers = killingTestFiles(JSON.parse(new TextDecoder().decode(data)));
        if (changed.some((e) => [...killers].some((k) => k === e[0] || k.endsWith(`/${e[0]}`) || e[0].endsWith(k.replace(/^.*?\//, '/'))))) strength = 'proven';
        break;
      } catch {
        /* no report: the strength stays unproven */
      }
    }
  }
  return { runId: run.runId, checkedAt: now, testsIncreased, checkPassed, targetMentioned, noIntegrityFinding, findingResolved: null, strength, reasons };
}
