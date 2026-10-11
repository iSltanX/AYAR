// Kept task cards (C-20, C-17 `tasks`, 12.8 «دورة البطاقة»): task.create generates the card from its source and
// stores it «مفتوحة» with the next display id TASK-NNNN of the project (D-36); tasks.list returns them. DEV-9 adds
// the sources that read the results (sources.ts), the user's transitions (task.update: copied, awaiting verification,
// closed with a reason), the copy recorded by the clipboard, and the verification by evidence alone after every run
// (verify.ts): «متحققة» is never given because a model, or anyone, said the card was done.
import type { Catalog } from '@ayar/catalog';
import { TaskCard, TaskStatus, TaskVerification, type FindingLocation, type TaskPatch, type TaskRecord, type TaskSource } from '@ayar/protocol';
import { untestedUnits } from '@ayar/analyzers';
import type { AdvisorFacts } from '../advisor/context.ts';
import { cardContextFromSnapshot } from '../advisor/facts.ts';
import type { EvidenceService } from '../evidence/service.ts';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { latestSnapshot } from '../profile/service.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import { generateCard, CardSourceError, type CardProjectContext } from './cards.ts';
import { cardFromClaim, cardFromFix, cardFromMaintenance, cardFromMutant, cardFromTestGap, cardFromUiState, type FindingForCard } from './sources.ts';
import { verifyCard, type CardBase, type RunFacts } from './verify.ts';

interface Row {
  id: string;
  display_id: string;
  project_id: string;
  kind: string;
  body_json: string;
  status: string;
  created_at: string;
  updated_at: string;
  verification_json: string | null;
  close_reason: string | null;
  follows: string | null;
  base_json: string | null;
  verified_by_run_id: string | null;
}

export interface TasksServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger?: Logger;
  evidence?: EvidenceService;
}

const DISPLAY = /^TASK-(\d+)$/;
const COLUMNS = 'id, display_id, project_id, kind, body_json, status, created_at, updated_at, verification_json, close_reason, follows, base_json, verified_by_run_id';
/** The user's transitions (12.8): never into «متحققة». */
const USER_TRANSITIONS: Record<string, readonly string[]> = {
  open: ['copied', 'awaiting_verification', 'closed'],
  copied: ['awaiting_verification', 'closed', 'open'],
  awaiting_verification: ['closed', 'open', 'copied'],
  verified: ['closed'],
  closed: ['open'],
};

export class TasksService {
  readonly #o: TasksServiceOptions;
  constructor(o: TasksServiceOptions) {
    this.#o = o;
  }

  /** The card's «السياق» from the project's last discovery (the handlers pass it; the services ask here). */
  contextOf(projectId: string): CardProjectContext {
    return cardContextFromSnapshot(latestSnapshot(this.#o.db, projectId));
  }

  /** Units of logic with no test file of their name, from a manifest's paths (C-20 source 2; the needs read it too). */
  static gapsIn(paths: readonly string[]): string[] {
    return untestedUnits(paths).map((g) => g.file);
  }

  /** tasks.gaps (DEV-12, J4): those units in the project's latest files snapshot, at most 500, for «أنشئ بطاقة». */
  async gaps(projectId: string): Promise<{ files: string[]; total: number; truncated: boolean }> {
    const snap = this.#o.db.get<{ id: string }>('SELECT id FROM snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', projectId);
    const manifest = snap && this.#o.evidence ? await this.#o.evidence.snapshots.load(snap.id).catch(() => null) : null;
    const paths = manifest ? manifest.files.filter((f) => f[6] !== 'link').map((f) => f[0]).filter((f) => !f.startsWith('node_modules/') && !f.includes('/node_modules/')) : [];
    const all = TasksService.gapsIn(paths);
    return { files: all.slice(0, 500), total: all.length, truncated: all.length > 500 };
  }

  #finding(findingId: string, projectId: string): FindingForCard {
    const f = this.#o.db.get<{ id: string; display_id: string; check_id: string; rule_id: string | null; title_key: string; message_redacted: string | null; location_json: string | null; severity: string; project_id: string }>(
      'SELECT f.id, f.display_id, f.check_id, f.rule_id, f.title_key, f.message_redacted, f.location_json, f.severity, r.project_id FROM findings f JOIN check_runs c ON c.id = f.check_run_id JOIN runs r ON r.id = c.run_id WHERE f.id = ?',
      findingId,
    );
    if (!f || f.project_id !== projectId) throw new CommandError('not_found', { reason: 'finding' });
    return { id: f.id, displayId: f.display_id, checkId: f.check_id, ruleId: f.rule_id ?? '', titleKey: f.title_key, message: f.message_redacted ?? '', location: f.location_json ? (JSON.parse(f.location_json) as FindingLocation) : null, severity: f.severity };
  }

  create(projectId: string, source: TaskSource, facts: AdvisorFacts, project: CardProjectContext): TaskRecord {
    const { catalog, db } = this.#o;
    let card: TaskCard;
    let follows: string | null = null;
    switch (source.kind) {
      case 'advisorItem':
      case 'check':
        card = generateCard(source, catalog, facts, project);
        break;
      case 'testGap':
        card = cardFromTestGap(source, catalog, project);
        break;
      case 'survivingMutant': {
        const f = this.#finding(source.findingId, projectId);
        if (f.ruleId !== 'mutant.survived') throw new CardSourceError('outcome_mismatch', f.ruleId);
        card = cardFromMutant(f, catalog, project);
        follows = f.displayId;
        break;
      }
      case 'uiState': {
        const f = this.#finding(source.findingId, projectId);
        if (f.checkId !== 'design.states') throw new CardSourceError('outcome_mismatch', f.checkId);
        card = cardFromUiState(f, catalog, project);
        follows = f.displayId;
        break;
      }
      case 'maintenance': {
        const f = this.#finding(source.findingId, projectId);
        if (f.checkId !== 'code.complexity') throw new CardSourceError('outcome_mismatch', f.checkId);
        card = cardFromMaintenance(f, catalog, project);
        follows = f.displayId;
        break;
      }
      case 'fixVerification': {
        const f = this.#finding(source.findingId, projectId);
        card = cardFromFix(f, catalog, project);
        follows = f.displayId;
        break;
      }
      case 'modelClaim': {
        const c = db.get<{ id: string; display_id: string; template_id: string; kind: string | null; summary_redacted: string | null; location_json: string | null; matched_check_id: string | null; project_id: string }>('SELECT m.id, m.display_id, a.template_id, m.kind, m.summary_redacted, m.location_json, m.matched_check_id, a.project_id FROM model_claims m JOIN ai_checks a ON a.id = m.ai_check_id WHERE m.id = ?', source.claimId);
        if (!c || c.project_id !== projectId) throw new CommandError('not_found', { reason: 'model_claim' });
        card = cardFromClaim({ id: c.id, displayId: c.display_id, template: c.template_id, kind: (c.kind as 'suspicion' | 'suggestion' | 'question' | null) ?? 'suspicion', summary: c.summary_redacted ?? '', location: c.location_json ? (JSON.parse(c.location_json) as FindingLocation) : null, matchedCheckId: c.matched_check_id }, catalog, project);
        follows = c.display_id;
        break;
      }
    }
    const now = this.#o.ports.clock.now().toISOString();
    const id = newId(this.#o.ports.random, 'task');
    const base: CardBase = this.#baseOf(projectId, card);
    return db.transaction(() => {
      const last = db
        .all<{ display_id: string }>('SELECT display_id FROM tasks WHERE project_id = ?', projectId)
        .map((r) => Number(DISPLAY.exec(r.display_id)?.[1] ?? 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const displayId = `TASK-${String(last + 1).padStart(4, '0')}`;
      const kept: TaskCard = { ...card, text: card.text.replace(this.#o.catalog.kb.cards.template.draftId, displayId) };
      db.run(
        'INSERT INTO tasks (id, display_id, project_id, kind, title, body_json, priority, source_json, status, created_at, updated_at, follows, base_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        displayId,
        projectId,
        kept.type,
        kept.name,
        JSON.stringify(kept),
        String(kept.priority),
        JSON.stringify(source),
        'open',
        now,
        now,
        follows,
        JSON.stringify(base),
      );
      return { id, displayId, projectId, status: 'open' as const, card: kept, createdAt: now, updatedAt: now, verification: null, closeReason: null, follows };
    });
  }

  /** 12.8: what the verification compares against — the test count and the state when the card was made. */
  #baseOf(projectId: string, card: TaskCard): CardBase {
    const { db } = this.#o;
    const run = db.get<{ id: string; snapshot_start_id: string | null; snapshot_end_id: string | null }>("SELECT id, snapshot_start_id, snapshot_end_id FROM runs WHERE project_id = ? AND state IN ('finished', 'interrupted') ORDER BY coalesce(finished_at, started_at, '') DESC LIMIT 1", projectId);
    let tests = 0;
    if (run) {
      for (const c of card.verify) {
        const row = db.get<{ tests_json: string | null }>('SELECT tests_json FROM check_runs WHERE run_id = ? AND check_id = ? ORDER BY rowid LIMIT 1', run.id, c);
        const t = row?.tests_json ? (JSON.parse(row.tests_json) as { total?: number }) : null;
        tests += t?.total ?? 0;
      }
    }
    const latest = db.get<{ id: string }>('SELECT id FROM snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', projectId)?.id ?? null;
    return { runId: run?.id ?? null, snapshotId: run?.snapshot_end_id ?? run?.snapshot_start_id ?? latest, tests };
  }

  #row(taskId: string): Row {
    const r = this.#o.db.get<Row>(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`, taskId);
    if (!r) throw new CommandError('not_found', { reason: 'task' });
    return r;
  }

  #record(r: Row): TaskRecord | null {
    let body: unknown = null;
    try {
      body = JSON.parse(r.body_json);
    } catch {
      body = null;
    }
    const card = TaskCard.safeParse(body);
    const status = TaskStatus.safeParse(r.status);
    if (!card.success || !status.success) {
      // One unreadable row (damaged, or written by another card version) never hides the others (review m7).
      this.#o.logger?.log('warn', 'task row skipped: unreadable card', { displayId: r.display_id });
      return null;
    }
    let verification: TaskRecord['verification'] = null;
    if (r.verification_json) {
      const v = TaskVerification.safeParse(JSON.parse(r.verification_json));
      verification = v.success ? v.data : null;
    }
    return { id: r.id, displayId: r.display_id, projectId: r.project_id, status: status.data, card: card.data, createdAt: r.created_at, updatedAt: r.updated_at, verification, closeReason: r.close_reason, follows: r.follows };
  }

  get(taskId: string): TaskRecord {
    const rec = this.#record(this.#row(taskId));
    if (!rec) throw new CommandError('not_found', { reason: 'task' });
    return rec;
  }

  list(projectId: string): TaskRecord[] {
    const rows = this.#o.db.all<Row>(`SELECT ${COLUMNS} FROM tasks WHERE project_id = ? ORDER BY created_at, length(display_id), display_id`, projectId);
    return rows.map((r) => this.#record(r)).filter((r): r is TaskRecord => r !== null);
  }

  /** task.update (12.8): the user's own transitions; «متحققة» is never one of them. */
  update(taskId: string, patch: TaskPatch): TaskRecord {
    const { db, ports } = this.#o;
    const r = this.#row(taskId);
    if (patch.status) {
      const allowed = USER_TRANSITIONS[r.status] ?? [];
      if (!allowed.includes(patch.status)) throw new CommandError('invalid_payload', { path: 'patch.status', reason: `from_${r.status}` });
      if (patch.status === 'closed' && !patch.closeReason?.trim()) throw new CommandError('invalid_payload', { path: 'patch.closeReason', reason: 'required' });
    }
    const now = ports.clock.now();
    db.transaction(() => {
      if (patch.status) db.run('UPDATE tasks SET status = ?, close_reason = ?, updated_at = ? WHERE id = ?', patch.status, patch.status === 'closed' ? (patch.closeReason ?? '').trim() : null, now.toISOString(), taskId);
      else if (patch.closeReason !== undefined) db.run('UPDATE tasks SET close_reason = ?, updated_at = ? WHERE id = ?', patch.closeReason, now.toISOString(), taskId);
      recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'task.updated', projectId: r.project_id, details: { taskId, displayId: r.display_id, status: patch.status ?? r.status } });
    });
    return this.get(taskId);
  }

  /** The clipboard copied the card (internal.recordCopy): «مفتوحة ← نُسخت» (12.8). */
  markCopied(taskId: string): void {
    const r = this.#row(taskId);
    if (r.status === 'open') this.#o.db.run("UPDATE tasks SET status = 'copied', updated_at = ? WHERE id = ?", this.#o.ports.clock.now().toISOString(), taskId);
  }

  /**
   * 12.8 «ما يثبته عِيَار عند الإغلاق»: every card of the project that awaits proof is checked against the run — the
   * test count, the related check, a new test naming the target, no integrity finding; a fix card against its
   * finding's disappearance. The verdict is the evidence's alone.
   */
  async verifyAfterRun(runId: string, projectId: string): Promise<{ task: TaskRecord; verification: TaskVerification }[]> {
    const { db, ports } = this.#o;
    const run = db.get<{ id: string; project_id: string; snapshot_start_id: string | null; snapshot_end_id: string | null; state: string; kind: string }>('SELECT id, project_id, snapshot_start_id, snapshot_end_id, state, kind FROM runs WHERE id = ?', runId);
    if (!run || run.project_id !== projectId) throw new CommandError('not_found', { reason: 'run' });
    const rows = db.all<Row>(`SELECT ${COLUMNS} FROM tasks WHERE project_id = ? AND status IN ('open', 'copied', 'awaiting_verification')`, projectId);
    if (!rows.length) return [];
    const facts = await this.#runFacts(run);
    const root = db.get<{ root_realpath: string }>('SELECT root_realpath FROM projects WHERE id = ?', projectId)?.root_realpath ?? null;
    const out: { task: TaskRecord; verification: TaskVerification }[] = [];
    for (const r of rows) {
      const rec = this.#record(r);
      if (!rec) continue;
      const base: CardBase = r.base_json ? (JSON.parse(r.base_json) as CardBase) : { runId: null, snapshotId: null, tests: 0 };
      const baseManifest = base.snapshotId && this.#o.evidence ? await this.#o.evidence.snapshots.load(base.snapshotId).catch(() => null) : null;
      const v = await verifyCard(rec, base, facts, { baseManifest, ports, root });
      if (!v) continue; // a card this run says nothing about (none of its checks ran)
      const verified = v.reasons.length === 0;
      const status = verified ? 'verified' : r.status === 'open' ? 'open' : 'awaiting_verification';
      const now = ports.clock.now();
      db.transaction(() => {
        db.run('UPDATE tasks SET status = ?, verification_json = ?, verified_by_run_id = ?, updated_at = ? WHERE id = ?', status, JSON.stringify(v), verified ? runId : r.verified_by_run_id, now.toISOString(), r.id);
        recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'task.verified', projectId, details: { taskId: r.id, displayId: r.display_id, runId, verified, reasons: v.reasons.join(',') } });
      });
      out.push({ task: this.get(r.id), verification: v });
    }
    return out;
  }

  /** What one run says, for every card: its executions, their findings, and its end state. */
  async #runFacts(run: { id: string; snapshot_start_id: string | null; snapshot_end_id: string | null }): Promise<RunFacts> {
    const { db } = this.#o;
    const checks = db.all<{ id: string; check_id: string; component: string; outcome: string | null; tests_json: string | null }>('SELECT id, check_id, component, outcome, tests_json FROM check_runs WHERE run_id = ?', run.id);
    const guard = db.all<{ check_id: string; rule_id: string | null; location_json: string | null }>("SELECT f.check_id, f.rule_id, f.location_json FROM findings f JOIN check_runs c ON c.id = f.check_run_id WHERE c.run_id = ? AND f.rule_id LIKE 'guard.%' AND coalesce(f.effect, '') <> 'excluded'", run.id);
    const present = new Set(db.all<{ fingerprint: string }>("SELECT f.fingerprint FROM findings f JOIN check_runs c ON c.id = f.check_run_id WHERE c.run_id = ? AND coalesce(f.effect, '') <> 'excluded'", run.id).map((r) => r.fingerprint));
    const snapshotId = run.snapshot_end_id ?? run.snapshot_start_id;
    const manifest = snapshotId && this.#o.evidence ? await this.#o.evidence.snapshots.load(snapshotId).catch(() => null) : null;
    return {
      runId: run.id,
      checks: checks.map((c) => ({ checkRunId: c.id, checkId: c.check_id, component: c.component, outcome: c.outcome, tests: c.tests_json ? (JSON.parse(c.tests_json) as { total: number }).total : null })),
      guardFindings: guard.map((g) => ({ checkId: g.check_id, rule: g.rule_id ?? '', path: g.location_json ? ((JSON.parse(g.location_json) as FindingLocation).path ?? null) : null })),
      presentFingerprints: present,
      fingerprintOf: (displayId) => db.get<{ fingerprint: string }>('SELECT fingerprint FROM finding_ids WHERE project_id = (SELECT project_id FROM runs WHERE id = ?) AND display_id = ?', run.id, displayId)?.fingerprint ?? null,
      manifest,
      text: async (entry) => (this.#o.evidence ? this.#o.evidence.snapshots.content(entry).catch(() => null) : null),
    };
  }
}
