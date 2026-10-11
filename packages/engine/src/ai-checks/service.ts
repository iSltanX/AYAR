// C-25 as a service (D-41, FR-66 to FR-68, FR-71; DEV-9). aiChecks.needs computes what the project needs (needs.ts)
// from its facts, its files and its last run; aiChecks.provideInput keeps a value the owner supplied for a missing
// input; aiChecks.generate renders the instruction file (instruction.ts), redacted and bounded, and keeps it with its
// id `AI-{code}-NNN` (D-36) — nothing runs, nothing is written; aiChecks.save writes it where the save dialog said
// (principle 4); aiChecks.importResults reads `.ayar/ai-results/*.json` as claims (results.ts) — each note an
// «ادعاء نموذج» with proof «اشتباه (من النموذج)» — and refuses the invalid, the oversized and the ones that claim a
// pass; the matching with local checks is integ.model-claims' at the next run (integrity/service.ts). An instruction
// whose facts changed since is shown «قديم» (12.9 point 6).
import type { Catalog } from '@ayar/catalog';
import type { AiChecksView, AiImportResult, AiInstruction, AiNeed, AiNeeds, FindingLocation, Lang, ModelClaim, Reason } from '@ayar/protocol';
import { AI_RESULT_MAX_BYTES } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { advisorFactsFromSnapshot } from '../advisor/facts.ts';
import type { EvidenceService } from '../evidence/service.ts';
import type { EventBus } from '../host/event-bus.ts';
import { CommandError, withFs } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import type { ProfileService } from '../profile/service.ts';
import { latestSnapshot } from '../profile/service.ts';
import type { ProjectsService } from '../projects/service.ts';
import type { RedactionService } from '../redaction/service.ts';
import { newToken } from '../reports/boundaries.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import type { VerdictService } from '../verdict/service.ts';
import { renderInstruction } from './instruction.ts';
import { computeNeeds, type ComputedNeed } from './needs.ts';
import { readAiResult } from './results.ts';

export interface AiChecksServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger: Logger;
  redaction: RedactionService;
  projects: ProjectsService;
  profiles: ProfileService;
  verdict: VerdictService;
  events: EventBus;
  evidence: EvidenceService;
}

interface AiCheckRow {
  id: string;
  display_id: string;
  project_id: string;
  template_id: string;
  template_version: string | null;
  status: string;
  need_json: string | null;
  instruction_text: string | null;
  instruction_hash: string | null;
  generated_at: string | null;
  saved_path: string | null;
  result_path: string | null;
  result_hash: string | null;
  imported_at: string | null;
  reject_reason: string | null;
  lang: string | null;
  inputs_json: string | null;
  token: string | null;
  facts_hash: string | null;
  redaction_counts_json: string | null;
}

/** The project's current results: the latest finished execution of each check (FR-66, FR-67), whichever run ran it. */
interface LastRun {
  runId: string;
  outcomes: Map<string, string>;
  checkRunIds: Map<string, string>;
  findings: { checkId: string; ruleId: string; path: string | null; line: number | null; message: string }[];
}

const AI_COLUMNS = 'id, display_id, project_id, template_id, template_version, status, need_json, instruction_text, instruction_hash, generated_at, saved_path, result_path, result_hash, imported_at, reject_reason, lang, inputs_json, token, facts_hash, redaction_counts_json';
const README_LINES = 60;
const MAX_README_CHARS = 6000;

const needIdOf = (templateId: string, projectId: string) => `need.${templateId.slice('ai.'.length)}.${projectId}`;
const parseNeedId = (needId: string): { templateId: string; projectId: string } | null => {
  const m = /^need\.([a-z][a-z0-9-]*)\.(.+)$/.exec(needId);
  return m ? { templateId: `ai.${m[1]}`, projectId: m[2]! } : null;
};

export class AiChecksService {
  readonly #o: AiChecksServiceOptions;

  constructor(o: AiChecksServiceOptions) {
    this.#o = o;
  }

  #project(projectId: string): { root: string; name: string } {
    const r = this.#o.db.get<{ root_realpath: string; display_name: string }>('SELECT root_realpath, display_name FROM projects WHERE id = ?', projectId);
    if (!r) throw new CommandError('not_found', { reason: 'project' });
    return { root: r.root_realpath, name: r.display_name };
  }

  /** The project's files as its latest state snapshot lists them (the discovery inventory keeps counts, not paths). */
  async #files(projectId: string): Promise<string[]> {
    const snap = this.#o.db.get<{ id: string }>('SELECT id FROM snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', projectId);
    if (!snap) return [];
    const m = await this.#o.evidence.snapshots.load(snap.id).catch(() => null);
    return m ? m.files.filter((f) => f[6] !== 'link').map((f) => f[0]) : [];
  }

  #lastRun(projectId: string): LastRun | null {
    const { db } = this.#o;
    const run = db.get<{ id: string }>("SELECT id FROM runs WHERE project_id = ? AND state IN ('finished', 'interrupted') ORDER BY coalesce(finished_at, started_at, '') DESC LIMIT 1", projectId);
    if (!run) return null;
    // The latest finished execution of each check (its latest instance), across the project's finished runs.
    const latest = new Map<string, { id: string; outcome: string }>();
    for (const c of db.all<{ id: string; check_id: string; outcome: string | null }>("SELECT c.id, c.check_id, c.outcome FROM check_runs c JOIN runs r ON r.id = c.run_id WHERE r.project_id = ? AND r.state IN ('finished', 'interrupted') AND c.outcome IS NOT NULL ORDER BY coalesce(r.finished_at, r.started_at, ''), c.rowid", projectId)) latest.set(c.check_id, { id: c.id, outcome: c.outcome! });
    const outcomes = new Map([...latest].map(([k, v]) => [k, v.outcome]));
    const checkRunIds = new Map([...latest].map(([k, v]) => [k, v.id]));
    const ids = [...checkRunIds.values()];
    const findings = ids.length
      ? db.all<{ check_id: string; rule_id: string | null; location_json: string | null; message_redacted: string | null; effect: string | null }>(`SELECT f.check_id, f.rule_id, f.location_json, f.message_redacted, f.effect FROM findings f WHERE f.check_run_id IN (${ids.map(() => '?').join(', ')}) AND coalesce(f.effect, '') <> 'excluded'`, ...ids).map((f) => {
      const loc = f.location_json ? (JSON.parse(f.location_json) as FindingLocation) : null;
      return { checkId: f.check_id, ruleId: f.rule_id ?? '', path: loc?.path ?? null, line: loc?.line ?? null, message: f.message_redacted ?? '' };
    })
      : [];
    return { runId: run.id, outcomes, checkRunIds, findings };
  }

  #userInputs(projectId: string): Map<string, Map<string, string>> {
    const out = new Map<string, Map<string, string>>();
    for (const r of this.#o.db.all<{ template_id: string; key: string; value: string }>('SELECT template_id, key, value FROM ai_need_inputs WHERE project_id = ?', projectId)) {
      if (!out.has(r.template_id)) out.set(r.template_id, new Map());
      out.get(r.template_id)!.set(r.key, r.value);
    }
    return out;
  }

  async #computed(projectId: string): Promise<{ needs: ComputedNeed[]; files: string[] }> {
    const snapshot = latestSnapshot(this.#o.db, projectId);
    const files = await this.#files(projectId);
    const audience = this.#o.profiles.settingsOf(projectId).context.audience;
    return { needs: computeNeeds({ catalog: this.#o.catalog, facts: snapshot?.facts ?? [], files, audience: audience ?? null, lastRun: this.#lastRun(projectId), userInputs: this.#userInputs(projectId) }), files };
  }

  #latestCheckOf(projectId: string, templateId: string): AiCheckRow | null {
    return this.#o.db.get<AiCheckRow>(`SELECT ${AI_COLUMNS} FROM ai_checks WHERE project_id = ? AND template_id = ? ORDER BY generated_at DESC, rowid DESC LIMIT 1`, projectId, templateId) ?? null;
  }

  #needView(projectId: string, c: ComputedNeed, run: LastRun | null): AiNeed {
    const existing = this.#latestCheckOf(projectId, c.template.id);
    const stale = existing?.facts_hash !== null && existing?.facts_hash !== undefined && existing.facts_hash !== createHash('sha256').update(c.factsKey).digest('hex') && existing.status !== 'rejected';
    const missing = c.inputs.filter((x) => x.value === null && !c.template.inputs.find((i) => i.key === x.key)?.optional).map((x) => x.key);
    const passed = run ? [...run.outcomes].filter(([id, o]) => o === 'passed' && (c.template.provableBy.includes(id) || id.startsWith('code.') || id.startsWith('sec.') || id.startsWith('beh.'))).map(([id]) => ({ checkId: id, instance: `${id}@.`, reason: null })) : [];
    const open = run ? run.findings.filter((f) => c.template.provableBy.includes(f.checkId) || c.files.includes(f.path ?? '')).slice(0, 50).map((f) => ({ displayId: this.#displayOf(projectId, f), checkId: f.checkId, titleKey: `catalog.rule.${f.ruleId}.title`, location: f.path ? { path: f.path, ...(f.line ? { line: f.line } : {}) } : null })) : [];
    return {
      needId: needIdOf(c.template.id, projectId),
      template: c.template.id,
      templateVersion: c.template.version,
      titleKey: c.template.text.title,
      roleKey: c.template.text.role,
      cost: 'model',
      reasons: c.reasons,
      applies: c.applies,
      notApplicableReason: c.applies ? null : c.notApplicableReason,
      inputs: c.inputs,
      missingInputs: missing,
      canGenerate: c.applies && missing.length === 0,
      files: c.files,
      passed,
      openFindings: open,
      aiCheckId: existing?.id ?? null,
      status: existing ? (stale ? 'stale' : (existing.status as AiNeed['status'])) : null,
    };
  }

  #displayOf(projectId: string, f: { checkId: string; path: string | null; line: number | null; ruleId: string }): string {
    const row = this.#o.db.get<{ display_id: string }>("SELECT f.display_id FROM findings f JOIN check_runs c ON c.id = f.check_run_id JOIN runs r ON r.id = c.run_id WHERE r.project_id = ? AND f.check_id = ? AND f.rule_id = ? AND (f.location_json IS NULL OR json_extract(f.location_json, '$.path') = ?) ORDER BY f.rowid DESC LIMIT 1", projectId, f.checkId, f.ruleId, f.path);
    return row?.display_id ?? `AYR-???-${f.checkId}`;
  }

  async needs(projectId: string): Promise<AiNeeds> {
    this.#project(projectId);
    const { needs } = await this.#computed(projectId);
    const run = this.#lastRun(projectId);
    return { projectId, needs: needs.map((c) => this.#needView(projectId, c, run)), computedAt: this.#o.ports.clock.now().toISOString() };
  }

  async provideInput(needId: string, key: string, value: string): Promise<AiNeed> {
    const parsed = parseNeedId(needId);
    if (!parsed) throw new CommandError('not_found', { reason: 'need' });
    this.#project(parsed.projectId);
    const template = this.#o.catalog.aiTemplates.find((t) => t.id === parsed.templateId);
    if (!template) throw new CommandError('not_found', { reason: 'template' });
    if (!template.inputs.some((i) => i.key === key)) throw new CommandError('invalid_payload', { path: 'key', reason: 'unknown_input' });
    const text = this.#o.redaction.redactor().redactText(value).text;
    this.#o.db.run('INSERT INTO ai_need_inputs (project_id, template_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (project_id, template_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', parsed.projectId, parsed.templateId, key, text, this.#o.ports.clock.now().toISOString());
    const { needs } = await this.#computed(parsed.projectId);
    const c = needs.find((n) => n.template.id === parsed.templateId)!;
    return this.#needView(parsed.projectId, c, this.#lastRun(parsed.projectId));
  }

  async generate(needId: string, lang: Lang): Promise<AiInstruction> {
    const { db, ports } = this.#o;
    const parsed = parseNeedId(needId);
    if (!parsed) throw new CommandError('not_found', { reason: 'need' });
    const project = this.#project(parsed.projectId);
    const { needs, files } = await this.#computed(parsed.projectId);
    const c = needs.find((n) => n.template.id === parsed.templateId);
    if (!c) throw new CommandError('not_found', { reason: 'template' });
    const run = this.#lastRun(parsed.projectId);
    const view = this.#needView(parsed.projectId, c, run);
    // 12.9: not applicable, or an input missing → nothing is generated by an assumption.
    if (!view.applies) throw new CommandError('invalid_payload', { path: 'needId', reason: 'not_applicable' });
    if (view.missingInputs.length) throw new CommandError('invalid_payload', { path: 'needId', reason: 'missing_inputs', inputs: view.missingInputs.join(',') });
    const code = c.template.code;
    const n = db.all<{ display_id: string }>('SELECT display_id FROM ai_checks WHERE project_id = ? AND template_id = ?', parsed.projectId, c.template.id).reduce((m, r) => Math.max(m, Number(/-(\d+)$/.exec(r.display_id)?.[1] ?? 0)), 0) + 1;
    const displayId = `AI-${code}-${String(n).padStart(3, '0')}`;
    const token = newToken(ports.random);
    const now = ports.clock.now();
    const resultPath = `.ayar/ai-results/${displayId}.json`;
    // A README's head for the docs and logic templates (the project's words inside the boundaries).
    const quotes: { source: string; text: string }[] = [];
    const readme = files.find((f) => /(^|\/)readme(\.[a-z]+)?$/i.test(f));
    if (readme && (c.template.id === 'ai.docs-consistency' || c.template.id === 'ai.logic-review' || c.template.id === 'ai.test-gaps')) {
      const text = await withFs(async () => {
        const { data } = await ports.fs.readFilePrefix(posix.join(project.root, readme), 256 * 1024);
        return new TextDecoder().decode(data);
      }).catch(() => null);
      if (text) quotes.push({ source: readme, text: text.split('\n').slice(0, README_LINES).join('\n').slice(0, MAX_README_CHARS) });
    }
    const snapshot = latestSnapshot(db, parsed.projectId);
    const raw = renderInstruction({
      catalog: this.#o.catalog,
      template: c.template,
      lang,
      displayId,
      projectName: project.name,
      ecosystems: advisorFactsFromSnapshot(snapshot).ecosystems ?? [],
      reasons: c.reasons,
      inputs: view.inputs,
      files: c.files,
      passed: view.passed.map((p) => ({ ...p, reason: run?.checkRunIds.has(p.checkId) ? this.#reasonOf(run.checkRunIds.get(p.checkId)!) : null })),
      openFindings: view.openFindings.map((f) => ({ displayId: f.displayId, checkId: f.checkId, titleKey: f.titleKey, where: f.location?.path ? `${f.location.path}${f.location.line ? `:${f.location.line}` : ''}` : null })),
      quotes,
      resultPath,
      token,
      createdAt: now.toISOString(),
    });
    // C-18 on its way out: redacted, and refused if a high-confidence secret survives.
    const redactor = this.#o.redaction.redactor();
    const red = redactor.redactText(raw);
    if (!redactor.secondPass(red.text).ok) throw new CommandError('report_blocked', { reason: 'secret_survived', where: 'instruction' });
    const hash = createHash('sha256').update(red.text).digest('hex');
    const id = newId(ports.random, 'aic');
    db.transaction(() => {
      db.run(
        'INSERT INTO ai_checks (id, display_id, project_id, template_id, template_version, status, need_json, instruction_text, instruction_hash, generated_at, result_path, lang, inputs_json, token, facts_hash, redaction_counts_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        displayId,
        parsed.projectId,
        c.template.id,
        c.template.version,
        'generated',
        JSON.stringify({ reasons: c.reasons, files: c.files }),
        red.text,
        hash,
        now.toISOString(),
        resultPath,
        lang,
        JSON.stringify(view.inputs),
        token,
        createHash('sha256').update(c.factsKey).digest('hex'),
        JSON.stringify(red.counts),
      );
      recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'aiCheck.generated', projectId: parsed.projectId, details: { aiCheckId: id, displayId, template: c.template.id, lang, chars: red.text.length } });
    });
    return this.get(id);
  }

  #reasonOf(checkRunId: string): Reason | null {
    const r = this.#o.db.get<{ outcome_reason: string | null }>('SELECT outcome_reason FROM check_runs WHERE id = ?', checkRunId);
    return r?.outcome_reason ? (JSON.parse(r.outcome_reason) as Reason) : null;
  }

  #row(aiCheckId: string): AiCheckRow {
    const r = this.#o.db.get<AiCheckRow>(`SELECT ${AI_COLUMNS} FROM ai_checks WHERE id = ?`, aiCheckId);
    if (!r) throw new CommandError('not_found', { reason: 'ai_check' });
    return r;
  }

  #view(r: AiCheckRow, withText: boolean): AiInstruction {
    const counts = r.redaction_counts_json ? (JSON.parse(r.redaction_counts_json) as Record<string, number>) : {};
    const text = withText ? (r.instruction_text ?? '') : '';
    return {
      schema: 'ai-check/1',
      aiCheckId: r.id,
      displayId: r.display_id,
      template: r.template_id,
      templateVersion: r.template_version ?? '',
      lang: (r.lang as Lang | null) ?? 'ar',
      suggestedPath: `.ayar/ai-checks/${r.display_id}.md`,
      resultPath: r.result_path ?? `.ayar/ai-results/${r.display_id}.json`,
      text,
      chars: r.instruction_text?.length ?? 0,
      token: r.token ?? '000000',
      hash: r.instruction_hash ?? '0'.repeat(64),
      redactions: { total: Object.values(counts).reduce((a, b) => a + b, 0), byRule: counts },
      status: (['generated', 'awaiting_result', 'result_received', 'matched_partially', 'matched', 'rejected', 'stale'].includes(r.status) ? r.status : 'generated') as AiInstruction['status'],
      generatedAt: r.generated_at ?? this.#o.ports.clock.now().toISOString(),
      badges: { generated: true, notExecuted: true, cost: 'model' },
    };
  }

  get(aiCheckId: string): AiInstruction {
    return this.#view(this.#row(aiCheckId), true);
  }

  /** aiChecks.save (12.9, principle 4): the instruction written where the dialog said; never anywhere else. */
  async save(aiCheckId: string, destination: string): Promise<{ written: true; bytes: number; path: string; suggestGitignore: boolean }> {
    const { db, ports } = this.#o;
    const r = this.#row(aiCheckId);
    if (!r.instruction_text) throw new CommandError('not_found', { reason: 'instruction_text' });
    const data = new TextEncoder().encode(r.instruction_text);
    await withFs(() => ports.fs.writeFileAtomic(destination, data, 0o644));
    const project = this.#project(r.project_id);
    const inside = destination.startsWith(`${project.root}/`);
    let suggestGitignore = false;
    if (inside) {
      const gi = await ports.fs.readFilePrefix(posix.join(project.root, '.gitignore'), 256 * 1024).then((x) => new TextDecoder().decode(x.data)).catch(() => '');
      suggestGitignore = !/^\.ayar\/ai-results\/?$/m.test(gi);
    }
    const now = ports.clock.now();
    db.transaction(() => {
      db.run("UPDATE ai_checks SET saved_path = ?, status = CASE WHEN status = 'generated' THEN 'awaiting_result' ELSE status END WHERE id = ?", inside ? posix.relative(project.root, destination) : destination, aiCheckId);
      recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'aiCheck.saved', projectId: r.project_id, details: { aiCheckId, displayId: r.display_id, insideProject: inside, bytes: data.length } });
    });
    return { written: true, bytes: data.length, path: destination, suggestGitignore };
  }

  /** aiChecks.importResults (FR-68): `.ayar/ai-results/*.json`, each as claims or refused with its reason. */
  async importResults(projectId: string): Promise<AiImportResult> {
    const { db, ports } = this.#o;
    const project = this.#project(projectId);
    const dir = posix.join(project.root, '.ayar', 'ai-results');
    const entries = await ports.fs.readdirEntries(dir).catch(() => []);
    const items: AiImportResult['items'] = [];
    const claims: ModelClaim[] = [];
    const redactor = this.#o.redaction.redactor();
    const now = ports.clock.now();
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.kind !== 'file' || !e.name.endsWith('.json')) continue;
      const path = posix.join(dir, e.name);
      const rel = `.ayar/ai-results/${e.name}`;
      const st = await ports.fs.lstat(path).catch(() => null);
      if (!st?.isFile) continue;
      // The instruction this file answers: by its name (`AI-LOGIC-001.json`), else by its `id` field once read.
      const byName = db.get<AiCheckRow>(`SELECT ${AI_COLUMNS} FROM ai_checks WHERE project_id = ? AND display_id = ?`, projectId, e.name.replace(/\.json$/, '')) ?? null;
      if (st.size > AI_RESULT_MAX_BYTES) {
        const reason: Reason = { key: 'aichecks.rejected.tooLarge', params: { bytes: st.size, limit: AI_RESULT_MAX_BYTES } };
        items.push(this.#reject(byName, rel, reason, now, projectId));
        continue;
      }
      const text = new TextDecoder().decode((await ports.fs.readFilePrefix(path, AI_RESULT_MAX_BYTES + 1)).data);
      const hash = createHash('sha256').update(text).digest('hex');
      const read = readAiResult(text, st.size);
      const target = byName ?? (read.ok ? (db.get<AiCheckRow>(`SELECT ${AI_COLUMNS} FROM ai_checks WHERE project_id = ? AND display_id = ?`, projectId, read.result.id) ?? null) : null);
      if (!read.ok) {
        items.push(this.#reject(target, rel, read.reason, now, projectId, hash));
        continue;
      }
      if (!target) {
        items.push({ path: rel, aiCheckId: null, aiCheckDisplayId: null, status: 'rejected', rejectReason: { key: 'aichecks.rejected.unknownCheck', params: { id: read.result.id } }, claims: 0 });
        recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'aiResult.rejected', projectId, details: { path: rel, reason: 'unknownCheck', id: read.result.id } });
        continue;
      }
      if (target.result_hash === hash && target.status !== 'rejected') {
        items.push({ path: rel, aiCheckId: target.id, aiCheckDisplayId: target.display_id, status: 'unchanged', rejectReason: null, claims: db.get<{ n: number }>('SELECT count(*) AS n FROM model_claims WHERE ai_check_id = ?', target.id)?.n ?? 0 });
        claims.push(...this.#claimsOf(target));
        continue;
      }
      if (read.result.template !== target.template_id) {
        items.push(this.#reject(target, rel, { key: 'aichecks.rejected.templateMismatch', params: { expected: target.template_id, got: read.result.template } }, now, projectId, hash));
        continue;
      }
      const template = this.#o.catalog.aiTemplates.find((t) => t.id === target.template_id);
      db.transaction(() => {
        // Claims the owner decided stay; the rest are replaced by the new file's notes.
        db.run("DELETE FROM model_claims WHERE ai_check_id = ? AND coalesce(match_status, 'open') IN ('open', 'proven')", target.id);
        read.result.notes.forEach((note, i) => {
          const displayId = `${target.display_id}.${i + 1}`;
          if (db.get('SELECT id FROM model_claims WHERE ai_check_id = ? AND display_id = ?', target.id, displayId)) return; // a decided one
          // 12.7: a note that names a local check, or points at a location with a suspicion or a suggestion, is «أثبِت
          // بإعادة الفحص»; a question or a note with no location is for the owner's review.
          const local = note.localCheck && this.#o.catalog.check(note.localCheck) ? note.localCheck : note.location && note.kind !== 'question' ? (template?.provableBy[0] ?? null) : null;
          const location: FindingLocation | null = note.location ? { path: note.location.path.replace(/^\.\//, '').slice(0, 4096), ...(note.location.line ? { line: note.location.line } : {}), ...(note.location.symbol ? { key: note.location.symbol } : {}) } : null;
          db.run(
            'INSERT INTO model_claims (id, display_id, ai_check_id, location_json, kind, severity_suggested, evidence_quote_redacted, matched_check_id, match_status, note_index, summary_redacted, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            newId(ports.random, 'clm'),
            displayId,
            target.id,
            location ? JSON.stringify(location) : null,
            note.kind,
            note.severity,
            note.evidence ? redactor.redactText(note.evidence).text : null,
            local,
            'open',
            i + 1,
            redactor.redactText(note.summary).text,
            now.toISOString(),
          );
        });
        db.run("UPDATE ai_checks SET status = 'result_received', result_path = ?, result_hash = ?, imported_at = ?, reject_reason = NULL WHERE id = ?", rel, hash, now.toISOString(), target.id);
        recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'aiResult.imported', projectId, details: { aiCheckId: target.id, displayId: target.display_id, path: rel, notes: read.result.notes.length, model: read.result.model ?? '' } });
      });
      const made = this.#claimsOf(target);
      claims.push(...made);
      items.push({ path: rel, aiCheckId: target.id, aiCheckDisplayId: target.display_id, status: 'imported', rejectReason: null, claims: made.length });
    }
    return { projectId, items, claims };
  }

  #reject(target: AiCheckRow | null, rel: string, reason: Reason, now: Date, projectId: string, hash?: string): AiImportResult['items'][number] {
    const { db, ports } = this.#o;
    // 12.9: «مرفوض» is a status of the model check, not an outcome of any check; the content is not kept.
    if (target) db.run("UPDATE ai_checks SET status = 'rejected', reject_reason = ?, result_path = ?, result_hash = ?, imported_at = ? WHERE id = ?", JSON.stringify(reason), rel, hash ?? null, now.toISOString(), target.id);
    recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'aiResult.rejected', projectId, details: { path: rel, reason: reason.key, aiCheckId: target?.id ?? null } });
    return { path: rel, aiCheckId: target?.id ?? null, aiCheckDisplayId: target?.display_id ?? null, status: 'rejected', rejectReason: reason, claims: 0 };
  }

  #claimsOf(a: AiCheckRow): ModelClaim[] {
    return this.#o.db
      .all<{ id: string; display_id: string; location_json: string | null; kind: string | null; severity_suggested: ModelClaim['severitySuggested']; evidence_quote_redacted: string | null; matched_check_id: string | null; match_status: string | null; summary_redacted: string | null; proven_finding_id: string | null; review_id: string | null }>(
        'SELECT id, display_id, location_json, kind, severity_suggested, evidence_quote_redacted, matched_check_id, match_status, summary_redacted, proven_finding_id, review_id FROM model_claims WHERE ai_check_id = ? ORDER BY note_index, rowid',
        a.id,
      )
      .map((c) => {
        const status: ModelClaim['status'] = c.match_status === 'proven' || c.match_status === 'decided_card' || c.match_status === 'decided_not_issue' ? c.match_status : 'open';
        return {
          id: c.id,
          displayId: c.display_id,
          aiCheckId: a.id,
          aiCheckDisplayId: a.display_id,
          template: a.template_id,
          kind: (c.kind as ModelClaim['kind'] | null) ?? 'suspicion',
          severitySuggested: c.severity_suggested,
          location: c.location_json ? (JSON.parse(c.location_json) as FindingLocation) : null,
          summary: c.summary_redacted ?? '',
          evidenceQuote: c.evidence_quote_redacted,
          proof: 'suspected',
          origin: 'model',
          matchedCheckId: c.matched_check_id,
          status,
          provenFindingId: c.proven_finding_id,
          reviewId: c.review_id,
          nextStep: c.matched_check_id ? 'direct' : 'review',
        };
      });
  }

  /** aiChecks.list (AT-44): instructions, claims, and what was proven locally — three groups that never mix. */
  list(projectId: string): AiChecksView {
    this.#project(projectId);
    const rows = this.#o.db.all<AiCheckRow>(`SELECT ${AI_COLUMNS} FROM ai_checks WHERE project_id = ? ORDER BY generated_at DESC, rowid DESC`, projectId);
    const claims = rows.flatMap((r) => this.#claimsOf(r));
    const proven = claims
      .filter((c): c is ModelClaim & { provenFindingId: string } => c.status === 'proven' && c.provenFindingId !== null)
      .map((c) => {
        const f = this.#o.db.get<{ display_id: string; check_id: string }>('SELECT display_id, check_id FROM findings WHERE id = ?', c.provenFindingId);
        return f ? { claimDisplayId: c.displayId, findingId: c.provenFindingId, findingDisplayId: f.display_id, checkId: f.check_id } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return {
      projectId,
      instructions: rows.map((r) => {
        const { text: _text, ...rest } = this.#view(r, false);
        return rest;
      }),
      claims,
      proven,
    };
  }
}
