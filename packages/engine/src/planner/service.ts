// C-10 as a service: run.plan, run.rerun, run.continueRound, and the saved groups. A plan is saved with an id
// (G-24: the plans table) and the profile version and hash it was built on; it is frozen by the run that starts
// from it, so it never starts twice, and a profile changed since makes it stale (plan again).
import type { Catalog } from '@ayar/catalog';
import type { CheckOutcome, RerunFilter, RunKind, RunPlan, RunSelection, SavedGroup } from '@ayar/protocol';
import { RERUN_FAILED_DEFAULT, RERUN_INCOMPLETE_DEFAULT, RunPlan as RunPlanSchema } from '@ayar/protocol';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts } from '../ports/index.ts';
import { latestSnapshot, type ProfileService } from '../profile/service.ts';
import { approvalsOf, latestProfile } from '../profile/store.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import { setupActionId, type SetupService } from '../setup/service.ts';
import { buildPlan, PlanError, type ResolvedSelection } from './plan.ts';

export interface PlannerOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  profiles: ProfileService;
  setup: SetupService;
}

interface PlanRow {
  id: string;
  project_id: string;
  plan_json: string;
  profile_version: number;
  profile_hash: string;
  frozen_at: string | null;
  run_id: string | null;
}

const KIND: Record<RunSelection['kind'], RunKind> = {
  full: 'full',
  section: 'section',
  check: 'check',
  group: 'group',
  savedGroup: 'group',
  fullExcluding: 'full',
  rerun: 'rerun_incomplete',
  continueRound: 'continue_round',
  advisor: 'advisor',
};

export class PlannerService {
  readonly #o: PlannerOptions;

  constructor(o: PlannerOptions) {
    this.#o = o;
  }

  /** run.plan (and the rerun modes): the plan, saved, shown before «ابدأ». */
  async plan(projectId: string, selection: RunSelection): Promise<RunPlan> {
    const { db } = this.#o;
    const snapshot = latestSnapshot(db, projectId);
    if (!snapshot) throw new CommandError('not_found', { reason: 'no_snapshot' });
    const profile = latestProfile(db, projectId) ?? this.#o.profiles.regenerate(projectId, snapshot, 'proposed').row;
    let resolved: ResolvedSelection;
    let kind = KIND[selection.kind];
    let previousRunId: string | null = null;
    switch (selection.kind) {
      case 'full':
        resolved = { kind: 'full' };
        break;
      case 'section':
        resolved = { kind: 'section', section: selection.section };
        break;
      case 'fullExcluding':
        resolved = { kind: 'fullExcluding', exclude: selection.exclude };
        break;
      case 'check':
        resolved = { kind: 'instances', instances: [selection.instance], explicit: true };
        break;
      case 'group':
      case 'advisor':
        resolved = { kind: 'instances', instances: selection.instances, explicit: true };
        break;
      case 'savedGroup': {
        const g = this.groups(projectId).find((x) => x.id === selection.groupId);
        if (!g) throw new CommandError('not_found', { reason: 'group' });
        resolved = { kind: 'instances', instances: g.instances, explicit: true };
        break;
      }
      case 'rerun': {
        const r = this.#rerunInstances(projectId, selection.runId, { mode: selection.mode, ...(selection.outcomes ? { outcomes: selection.outcomes } : {}) });
        previousRunId = selection.runId;
        kind = selection.mode === 'failed' ? 'rerun_failed' : 'rerun_incomplete';
        resolved = { kind: 'instances', instances: r, explicit: true };
        break;
      }
      case 'continueRound': {
        const round = db.get<{ base_run_id: string | null; project_id: string }>('SELECT base_run_id, project_id FROM rounds WHERE id = ?', selection.roundId);
        if (!round || round.project_id !== projectId || !round.base_run_id) throw new CommandError('not_found', { reason: 'round' });
        previousRunId = round.base_run_id;
        resolved = { kind: 'instances', instances: this.#rerunInstances(projectId, round.base_run_id, { mode: 'incomplete' }), explicit: true };
        break;
      }
    }
    // The version probes run here too (C-10 «وسم الجاهزية», G-DEV4-04): a corepack shim is ready only once its version is read.
    const { items } = await this.#o.setup.instances(projectId, { probe: true });
    const readiness = new Map(items.map((x) => [x.instance, x]));
    const id = newId(this.#o.ports.random, 'pln');
    let plan: RunPlan;
    try {
      plan = buildPlan({
        id,
        projectId,
        createdAt: this.#o.ports.clock.now().toISOString(),
        kind,
        selection,
        resolved,
        catalog: this.#o.catalog,
        specs: profile.content.checks,
        facts: snapshot.facts,
        readiness,
        approvals: approvalsOf(db, projectId),
        profileVersion: profile.version,
        profileHash: profile.contentHash,
        untrusted: profile.content.untrusted,
        history: this.#history(projectId),
        previousRunId,
        reviews: (db.get<{ n: number }>('SELECT count(*) AS n FROM reviews WHERE project_id = ?', projectId)?.n ?? 0) > 0,
        setupActionId: (_instance, seed) => setupActionId(projectId, seed),
      });
    } catch (e) {
      if (e instanceof PlanError) throw new CommandError('plan_invalid', { reason: e.reason, ...e.details });
      throw e;
    }
    db.run(
      'INSERT INTO plans (id, project_id, kind, selection_json, plan_json, profile_version, profile_hash, snapshot_id, spec_inputs_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
      plan.id,
      projectId,
      plan.kind,
      JSON.stringify(selection),
      JSON.stringify(plan),
      plan.profileVersion,
      plan.profileHash,
      snapshot.id,
      plan.createdAt,
    );
    // Older unfrozen plans of the project are of no use (a plan is shown, then started or replaced).
    db.run('DELETE FROM plans WHERE project_id = ? AND frozen_at IS NULL AND id <> ? AND created_at < ?', projectId, plan.id, plan.createdAt);
    return plan;
  }

  /** 9.5 point 3: the instances of a previous run whose outcome is among those chosen (with the defaults). */
  #rerunInstances(projectId: string, runId: string, f: RerunFilter): string[] {
    const run = this.#o.db.get<{ project_id: string }>('SELECT project_id FROM runs WHERE id = ?', runId);
    if (!run || run.project_id !== projectId) throw new CommandError('not_found', { reason: 'run' });
    const outcomes = new Set<CheckOutcome>(f.outcomes ?? (f.mode === 'failed' ? RERUN_FAILED_DEFAULT : RERUN_INCOMPLETE_DEFAULT));
    return this.#o.db
      .all<{ check_id: string; component: string; outcome: string | null }>('SELECT check_id, component, outcome FROM check_runs WHERE run_id = ? ORDER BY rowid', runId)
      .filter((r) => r.outcome !== null && outcomes.has(r.outcome as CheckOutcome))
      .map((r) => `${r.check_id}@${r.component}`);
  }

  /** run.rerun: a plan over a previous run's outcomes; the executions it creates link to the old ones. */
  rerun(runId: string, filter: RerunFilter): Promise<RunPlan> {
    const run = this.#o.db.get<{ project_id: string }>('SELECT project_id FROM runs WHERE id = ?', runId);
    if (!run) throw new CommandError('not_found', { reason: 'run' });
    return this.plan(run.project_id, { kind: 'rerun', runId, mode: filter.mode, ...(filter.outcomes ? { outcomes: filter.outcomes } : {}) });
  }

  continueRound(roundId: string): Promise<RunPlan> {
    const round = this.#o.db.get<{ project_id: string }>('SELECT project_id FROM rounds WHERE id = ?', roundId);
    if (!round) throw new CommandError('not_found', { reason: 'round' });
    return this.plan(round.project_id, { kind: 'continueRound', roundId });
  }

  /** Durations of earlier executions that ran to their end, newest first (C-10 point 8). */
  #history(projectId: string): Map<string, number[]> {
    const rows = this.#o.db.all<{ check_id: string; component: string; duration_ms: number }>(
      "SELECT c.check_id, c.component, c.duration_ms FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE r.project_id = ? AND c.duration_ms IS NOT NULL AND c.started_at IS NOT NULL AND coalesce(c.outcome, '') NOT IN ('timed_out', 'cancelled', 'interrupted', 'skipped', 'missing') ORDER BY c.finished_at DESC LIMIT 2000",
      projectId,
    );
    const out = new Map<string, number[]>();
    for (const r of rows) {
      const k = `${r.check_id}@${r.component}`;
      out.set(k, [...(out.get(k) ?? []), r.duration_ms]);
    }
    return out;
  }

  /** A saved plan, as it was shown. */
  get(planId: string): { plan: RunPlan; frozen: boolean; runId: string | null } {
    const r = this.#o.db.get<PlanRow>('SELECT * FROM plans WHERE id = ?', planId);
    if (!r) throw new CommandError('not_found', { reason: 'plan' });
    return { plan: RunPlanSchema.parse(JSON.parse(r.plan_json)), frozen: r.frozen_at !== null, runId: r.run_id };
  }

  /** run.start freezes the plan: same plan never starts twice (G-24). */
  freeze(planId: string, runId: string): void {
    const at = this.#o.ports.clock.now().toISOString();
    const r = this.#o.db.run('UPDATE plans SET frozen_at = ?, run_id = ? WHERE id = ? AND frozen_at IS NULL', at, runId, planId);
    if (r.changes !== 1) throw new CommandError('plan_stale', { reason: 'frozen' });
  }

  groups(projectId: string): SavedGroup[] {
    return this.#o.db
      .all<{ id: string; project_id: string; name: string; instance_keys_json: string; created_at: string; updated_at: string }>('SELECT * FROM saved_groups WHERE project_id = ? ORDER BY name', projectId)
      .map((g) => ({ id: g.id, projectId: g.project_id, name: g.name, instances: JSON.parse(g.instance_keys_json) as string[], createdAt: g.created_at, updatedAt: g.updated_at }));
  }

  /** groups.save: a named selection (D-45 keys); the same name replaces its instances. */
  saveGroup(projectId: string, name: string, instances: readonly string[]): SavedGroup {
    const { db, ports } = this.#o;
    if (!db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
    const specs = new Set((latestProfile(db, projectId)?.content.checks ?? []).map((s) => s.instance));
    const unknown = instances.find((x) => !specs.has(x));
    if (unknown) throw new CommandError('plan_invalid', { reason: 'unknown_instance', instance: unknown });
    const at = ports.clock.now().toISOString();
    const keys = [...new Set(instances)];
    db.transaction(() => {
      db.run(
        `INSERT INTO saved_groups (id, project_id, name, instance_keys_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (project_id, name) DO UPDATE SET instance_keys_json = excluded.instance_keys_json, updated_at = excluded.updated_at`,
        newId(ports.random, 'grp'),
        projectId,
        name,
        JSON.stringify(keys),
        at,
        at,
      );
      recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'group.saved', projectId, details: { name, instances: keys.length } });
    });
    return this.groups(projectId).find((g) => g.name === name)!;
  }

  deleteGroup(groupId: string): boolean {
    const { db, ports } = this.#o;
    const g = db.get<{ project_id: string; name: string }>('SELECT project_id, name FROM saved_groups WHERE id = ?', groupId);
    if (!g) return false;
    db.transaction(() => {
      db.run('DELETE FROM saved_groups WHERE id = ?', groupId);
      recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'group.deleted', projectId: g.project_id, details: { name: g.name } });
    });
    return true;
  }
}
