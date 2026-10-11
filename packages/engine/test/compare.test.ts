// C-22 «المقارنة» (FR-39, 11.5, AT-22 at the data level): two runs of one project, their findings sorted into
// resolved, new, persisting and reappeared, the checks before and after, and the comparability notes — a different
// profile, catalog, tools, environment or scope, and more blocking failures, under which a higher karat is never
// called an improvement. On a migrated database with rows written directly.
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/storage/migrations.ts';
import { compareRuns } from '../src/reports/compare.ts';
import { openDatabase } from '../src/storage/db.ts';
import { ensureDataDir } from '../src/storage/data-dir.ts';
import { nodeFileSystem as fs } from '../src/node/fs.ts';
import { fakeClock, tempRoot } from './support/tmp.ts';

async function db() {
  const { dir, cleanup } = tempRoot('ayar-DEV-9-compare-');
  const { layout } = await ensureDataDir(fs, `${dir}/AYAR`, process.getuid!());
  const d = openDatabase(layout.db);
  await migrate(d, { fs, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
  return { d, cleanup };
}

const purity = (karat: number, blocking: number, criteria = 7, checks = 18, tools: Record<string, string> = { vitest: '5.0.3' }) =>
  JSON.stringify({
    formula: 'purity/1',
    scope: { kind: 'round', roundId: null },
    verdict: blocking ? 'blocked' : karat === 24 ? 'pure' : 'incomplete',
    karat,
    p: karat / 24,
    criteriaCount: criteria,
    checksCount: checks,
    narrow: false,
    narrowThreshold: 3,
    criteria: [],
    checks: [],
    counts: { byOutcome: {}, absent: 0 },
    blockingFailures: Array.from({ length: blocking }, (_, i) => ({ instance: `b${i}@.`, checkId: `b${i}`, component: '.', findings: 1 })),
    incompleteReasons: [],
    excludedByReview: 0,
    integrity: { stateChanged: false, guardUnreviewed: 0, modelClaimsOpen: 0, reviewsExpired: 0, checks: [] },
    notes: [],
    meta: { profileVersion: 1, profileHash: 'h', catalogVersion: '1.3.0', toolVersions: tools, environmentSource: 'login_shell', snapshotId: null, commit: null, computedAt: '2026-10-11T00:00:00.000Z' },
  });

describe('compare.runs (C-22, 11.5)', () => {
  it('sorts the findings, lists the checks, and notes what makes the comparison indirect', async () => {
    const { d, cleanup } = await db();
    try {
      d.run("INSERT INTO projects (id, display_name, root_path, root_realpath, created_at) VALUES ('p', 'P', '/p', '/p', 'x')");
      const run = (id: string, n: number, karat: number, blocking: number, profile: number, selection = '{"kind":"full"}', tools?: Record<string, string>) =>
        d.run(
          "INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, profile_version, profile_hash, catalog_version, purity_formula, state, purity_json, verdict, finished_at) VALUES (?, ?, 'p', 'full', ?, '{}', ?, ?, '1.3.0', 'purity/1', 'finished', ?, ?, ?)",
          id,
          `RUN-20261011-00${n}`,
          selection,
          profile,
          `hash${profile}`,
          purity(karat, blocking, 7, 18, tools),
          blocking ? 'blocked' : 'incomplete',
          `2026-10-11T0${n}:00:00.000Z`,
        );
      run('r1', 1, 18, 1, 1);
      run('r2', 2, 20, 1, 2, '{"kind":"full"}', { vitest: '5.1.0' });
      run('r3', 3, 22, 2, 2);
      const check = (id: string, runId: string, checkId: string, outcome: string) => d.run("INSERT INTO check_runs (id, run_id, check_id, component, state, outcome) VALUES (?, ?, ?, '.', 'finished', ?)", id, runId, checkId, outcome);
      check('c1', 'r1', 'beh.unit', 'failed');
      check('c2', 'r1', 'code.lint', 'failed');
      check('c3', 'r2', 'beh.unit', 'passed');
      check('c4', 'r2', 'code.lint', 'failed');
      check('c5', 'r3', 'beh.unit', 'failed');
      check('c6', 'r3', 'code.lint', 'failed');
      const finding = (id: string, checkRunId: string, fp: string, display: string, effect = 'violation') =>
        d.run("INSERT INTO findings (id, check_run_id, fingerprint, display_id, check_id, component, severity, proof, origin, title_key, effect) VALUES (?, ?, ?, ?, 'beh.unit', '.', 'high', 'proven', 'project', 'k', ?)", id, checkRunId, fp, display, effect);
      d.run("INSERT INTO finding_ids (project_id, fingerprint, display_id, first_seen_run_id) VALUES ('p', 'fa', 'AYR-BEH-UNIT-0001', 'r1'), ('p', 'fb', 'AYR-BEH-UNIT-0002', 'r1'), ('p', 'fc', 'AYR-BEH-UNIT-0003', 'r2'), ('p', 'fd', 'AYR-BEH-UNIT-0004', 'r3')");
      finding('f1', 'c1', 'fa', 'AYR-BEH-UNIT-0001');
      finding('f2', 'c2', 'fb', 'AYR-BEH-UNIT-0002');
      finding('f3', 'c4', 'fb', 'AYR-BEH-UNIT-0002');
      finding('f4', 'c4', 'fc', 'AYR-BEH-UNIT-0003');
      finding('f5', 'c5', 'fa', 'AYR-BEH-UNIT-0001'); // reappeared in r3
      finding('f6', 'c6', 'fd', 'AYR-BEH-UNIT-0004');
      finding('f7', 'c6', 'fb', 'AYR-BEH-UNIT-0002', 'note'); // a note never counts

      const a = compareRuns(d, 'r1', 'r2');
      expect(a.findings.resolved.map((f) => f.displayId)).toEqual(['AYR-BEH-UNIT-0001']);
      expect(a.findings.persisting.map((f) => f.displayId)).toEqual(['AYR-BEH-UNIT-0002']);
      expect(a.findings.new.map((f) => f.displayId)).toEqual(['AYR-BEH-UNIT-0003']);
      expect(a.checks).toEqual([
        { instance: 'beh.unit@.', before: 'failed', after: 'passed', changed: true },
        { instance: 'code.lint@.', before: 'failed', after: 'failed', changed: false },
      ]);
      // A newer profile and a newer tool: «النطاق مختلف» is not said, but the comparison is indirect.
      expect(a.notes.map((n) => n.key).sort()).toEqual(['compare.note.profileDiffers', 'compare.note.toolsDiffer']);
      expect(a.karatChange).toBe('improved');
      expect(a.from).toMatchObject({ karat: 18, blockingFailures: 1 });
      expect(a.to).toMatchObject({ karat: 20, blockingFailures: 1 });

      // More blocking failures: a higher karat is not an improvement (11.5).
      const b = compareRuns(d, 'r2', 'r3');
      expect(b.karatChange).toBe('not_comparable');
      expect(b.notes.map((n) => n.key)).toContain('compare.note.blockingGrew');
      expect(b.findings.reappeared.map((f) => f.displayId)).toEqual(['AYR-BEH-UNIT-0001']);
      expect(b.findings.new.map((f) => f.displayId)).toEqual(['AYR-BEH-UNIT-0004']);
      expect(b.findings.resolved.map((f) => f.displayId).sort()).toEqual(['AYR-BEH-UNIT-0002', 'AYR-BEH-UNIT-0003']);
    } finally {
      d.close();
      cleanup();
    }
  });

  it('a changed scope makes the comparison indirect, and two projects never compare', async () => {
    const { d, cleanup } = await db();
    try {
      d.run("INSERT INTO projects (id, display_name, root_path, root_realpath, created_at) VALUES ('p', 'P', '/p', '/p', 'x'), ('q', 'Q', '/q', '/q', 'x')");
      d.run("INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, profile_version, profile_hash, catalog_version, purity_formula, state, purity_json) VALUES ('r1', 'RUN-1', 'p', 'full', '{\"kind\":\"full\"}', '{}', 1, 'h', '1.3.0', 'purity/1', 'finished', ?)", purity(18, 0, 7, 18));
      d.run("INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, profile_version, profile_hash, catalog_version, purity_formula, state, purity_json) VALUES ('r2', 'RUN-2', 'p', 'section', '{\"kind\":\"section\",\"section\":\"code\"}', '{}', 1, 'h', '1.3.0', 'purity/1', 'finished', ?)", purity(24, 0, 3, 5));
      d.run("INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, profile_version, profile_hash, catalog_version, purity_formula, state) VALUES ('r3', 'RUN-3', 'q', 'full', '{}', '{}', 1, 'h', '1.3.0', 'purity/1', 'finished')");
      const c = compareRuns(d, 'r1', 'r2');
      expect(c.notes.map((n) => n.key)).toContain('compare.note.scopeDiffers');
      expect(c.karatChange).toBe('not_comparable');
      expect(() => compareRuns(d, 'r1', 'r3')).toThrow(/invalid_payload/);
      expect(() => compareRuns(d, 'r1', 'nope')).toThrow(/not_found/);
    } finally {
      d.close();
      cleanup();
    }
  });
});
