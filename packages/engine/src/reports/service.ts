// C-21 and C-23 as a service (DEV-9): report.build makes `report/1` (build.ts), derives both formats (render.ts),
// passes them through the second redaction (C-18) and the parity check (parity.ts), cuts them at their limits
// (12.5 rule 2) and keeps the row in `reports` with the object itself; internal.clipboardText hands the main process
// the model text alone (FR-44, 12.6), and internal.recordCopy records the copy (G-21) and moves a copied card to
// «نُسخت»; report.export writes one of the four formats where the save dialog said (export.ts); compare.runs is
// C-22's comparison (compare.ts). A high-confidence secret that survives the second pass blocks copying and exporting
// (12.5 rule 1) and names where it was, never what it was.
import type { Catalog } from '@ayar/catalog';
import type { Lang, RedactionSummary, RenderedFormat, Report, ReportBuilt, ReportExported, ReportOptions, ReportRecord, RunComparison } from '@ayar/protocol';
import { Report as ReportSchema } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { EvidenceService } from '../evidence/service.ts';
import type { RunService } from '../executor/run.ts';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { IntegrityService } from '../integrity/service.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import type { ProfileService } from '../profile/service.ts';
import type { ProjectsService } from '../projects/service.ts';
import type { PurityService } from '../purity/service.ts';
import type { RedactionCounts } from '../redaction/redactor.ts';
import type { RedactionService } from '../redaction/service.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import type { TasksService } from '../tasks/service.ts';
import type { VerdictService } from '../verdict/service.ts';
import { capText, newToken, PROMPT_CHARS, RUN_CHARS, markerCounts } from './boundaries.ts';
import { ReportBuilder, type BuildTarget } from './build.ts';
import { compareRuns } from './compare.ts';
import { render as renderExport, type ExportFormat } from './export.ts';
import { checkParity } from './parity.ts';
import { Renderer } from './render.ts';

export interface ReportsServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger: Logger;
  evidence: EvidenceService;
  redaction: RedactionService;
  purity: PurityService;
  verdict: VerdictService;
  projects: ProjectsService;
  profiles: ProfileService;
  tasks: TasksService;
  runs: RunService;
  integrity: IntegrityService;
}

interface ReportRow {
  id: string;
  display_id: string;
  project_id: string;
  run_id: string | null;
  target_kind: 'run' | 'findings' | 'card';
  finding_ids_json: string | null;
  lang: Lang;
  template_version: string;
  model_text_redacted: string | null;
  human_chars: number | null;
  model_chars: number | null;
  redaction_counts_json: string | null;
  parity_ok: number | null;
  copied_at: string | null;
  created_at: string;
  report_json: string | null;
  blocked_reason: string | null;
}

const COLUMNS = 'id, display_id, project_id, run_id, target_kind, finding_ids_json, lang, template_version, model_text_redacted, human_chars, model_chars, redaction_counts_json, parity_ok, copied_at, created_at, report_json, blocked_reason';
const MAX_EVIDENCE_FILE = 64 * 1024 * 1024;

const summary = (counts: RedactionCounts, text: string): RedactionSummary => {
  const byRule: Record<string, number> = { ...counts };
  for (const [k, v] of Object.entries(markerCounts(text))) byRule[k] = (byRule[k] ?? 0) + v;
  return { total: Object.values(byRule).reduce((a, b) => a + b, 0), byRule };
};

export class ReportsService {
  readonly #o: ReportsServiceOptions;
  readonly #builder: ReportBuilder;

  constructor(o: ReportsServiceOptions) {
    this.#o = o;
    this.#builder = new ReportBuilder({ db: o.db, catalog: o.catalog, evidence: o.evidence, integrity: o.integrity, ports: o.ports });
  }

  /** Both formats from one object, redacted again, cut at their limits, and compared (12.1, 12.5, 12.6). */
  #render(report: Report, lang: Lang, options: ReportOptions): { human: RenderedFormat; model: RenderedFormat; parity: ReportBuilt['parity']; blocked: ReportBuilt['blocked'] } {
    const r = new Renderer(lang);
    const redactor = this.#o.redaction.redactor();
    const limits = options.limits ?? {};
    const modelLimit = report.target.kind === 'run' ? (limits.runChars ?? RUN_CHARS) : (limits.promptChars ?? PROMPT_CHARS);
    const rawModel = r.renderModel(report).text;
    const rawHuman = r.renderHuman(report).text;
    // The second redaction pass (C-18, 12.5 rule 1), counted; then what survives it decides whether the text may leave.
    const m = redactor.redactText(rawModel);
    const h = redactor.redactText(rawHuman);
    const survived = [redactor.secondPass(m.text), redactor.secondPass(h.text)].find((x) => !x.ok);
    const blocked = survived && !survived.ok ? { reason: 'secret_survived', where: survived.rules.join(', ') } : null;
    const tail = (lang === 'ar' ? '⟦اقتُطع التقرير عند حده؛ قسّمه بالأقسام ثم بالاكتشافات⟧' : '⟦the report was cut at its limit; split it by sections, then by findings⟧');
    const modelCut = capText(m.text, modelLimit, tail);
    const humanCut = capText(h.text, Math.max(modelLimit, RUN_CHARS), tail);
    const parity = checkParity(report, h.text, m.text, lang);
    const splitSuggestion = modelCut.truncated ? { key: report.findings.length > 1 ? 'report.split.byFindings' : 'report.split.bySections', params: { limit: modelLimit } } : null;
    return {
      human: { text: humanCut.text, chars: humanCut.text.length, truncated: humanCut.truncated, splitSuggestion: humanCut.truncated ? splitSuggestion ?? { key: 'report.split.bySections', params: { limit: modelLimit } } : null, redactions: summary(h.counts, humanCut.text) },
      model: { text: modelCut.text, chars: modelCut.text.length, truncated: modelCut.truncated, splitSuggestion, redactions: summary(m.counts, modelCut.text) },
      parity,
      blocked,
    };
  }

  async build(target: BuildTarget, options: ReportOptions): Promise<ReportBuilt> {
    const { db, ports } = this.#o;
    const token = newToken(ports.random);
    const built = await this.#builder.build(target, options, token);
    const report = ReportSchema.parse(built.report);
    const out = this.#render(report, options.lang, options);
    // 12.1 and 12.6: a parity failure is an internal error that keeps the formats from being shown.
    if (!out.parity.ok) {
      this.#o.logger.log('error', 'report parity failed', { displayId: report.displayId, mismatches: JSON.stringify(out.parity.mismatches).slice(0, 1000) });
      throw new CommandError('internal', { reason: 'report_parity', fields: out.parity.mismatches.map((x) => x.field).join(',') });
    }
    const id = newId(ports.random, 'rep');
    const now = ports.clock.now();
    const verificationCards: string[] = [];
    db.transaction(() => {
      db.run(
        `INSERT INTO reports (id, display_id, project_id, run_id, target_kind, finding_ids_json, lang, template_version, model_text_redacted, human_chars, model_chars, redaction_counts_json, parity_ok, created_at, report_json, blocked_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        report.displayId,
        built.projectId,
        report.head.run?.id ?? null,
        report.target.kind,
        report.target.kind === 'findings' ? JSON.stringify(report.target.findingIds) : null,
        options.lang,
        'model-report/1',
        out.blocked ? null : out.model.text,
        out.human.chars,
        out.model.chars,
        JSON.stringify({ human: out.human.redactions.byRule, model: out.model.redactions.byRule }),
        out.parity.ok ? 1 : 0,
        now.toISOString(),
        JSON.stringify(report),
        out.blocked ? `${out.blocked.reason}:${out.blocked.where}` : null,
      );
      recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'report.built', projectId: built.projectId, details: { reportId: id, displayId: report.displayId, target: report.target.kind, lang: options.lang, modelChars: out.model.chars, humanChars: out.human.chars, redactions: out.model.redactions.total, blocked: out.blocked !== null } });
      // 12.6 «وأنشئ بطاقة تحقق»: a fix-verification card per chosen finding, followed until the recheck.
      if (options.createVerificationCards && report.target.kind === 'findings') {
        for (const f of report.findings) {
          if (f.effect === 'note' || f.effect === 'excluded') continue;
          try {
            verificationCards.push(this.#o.tasks.create(built.projectId, { kind: 'fixVerification', findingId: f.id, reportId: id }, {}, this.#o.tasks.contextOf(built.projectId)).displayId);
          } catch (e) {
            this.#o.logger.log('warn', 'a verification card could not be made', { finding: f.displayId, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
          }
        }
      }
    });
    return { reportId: id, displayId: report.displayId, lang: options.lang, report, human: out.human, model: out.model, parity: out.parity, blocked: out.blocked, verificationCards };
  }

  #row(reportId: string): ReportRow {
    const r = this.#o.db.get<ReportRow>(`SELECT ${COLUMNS} FROM reports WHERE id = ?`, reportId);
    if (!r) throw new CommandError('not_found', { reason: 'report' });
    return r;
  }

  /** internal.clipboardText (FR-44, 12.6): the model text of a report, a card's text, or an instruction file. */
  clipboardText(kind: 'report' | 'card' | 'instructions', id: string): string {
    const { db } = this.#o;
    if (kind === 'report') {
      const r = this.#row(id);
      if (r.blocked_reason) throw new CommandError('report_blocked', { reason: r.blocked_reason.split(':')[0] ?? 'secret_survived', where: r.blocked_reason.split(':')[1] ?? '' });
      if (r.model_text_redacted === null) throw new CommandError('not_found', { reason: 'report_text' });
      return r.model_text_redacted;
    }
    if (kind === 'card') return this.#o.tasks.get(id).card.text;
    const a = db.get<{ instruction_text: string | null; status: string }>('SELECT instruction_text, status FROM ai_checks WHERE id = ?', id);
    if (!a) throw new CommandError('not_found', { reason: 'ai_check' });
    if (a.instruction_text === null) throw new CommandError('not_found', { reason: 'instruction_text' });
    return a.instruction_text;
  }

  /** internal.recordCopy (G-21): the audit record after the clipboard write succeeded, and what the copy means. */
  recordCopy(kind: 'report' | 'card' | 'instructions', id: string, chars: number): void {
    const { db, ports } = this.#o;
    const now = ports.clock.now();
    let projectId: string | null = null;
    let displayId = id;
    let redactions = 0;
    db.transaction(() => {
      if (kind === 'report') {
        const r = this.#row(id);
        projectId = r.project_id;
        displayId = r.display_id;
        const counts = r.redaction_counts_json ? (JSON.parse(r.redaction_counts_json) as { model?: Record<string, number> }) : {};
        redactions = Object.values(counts.model ?? {}).reduce((a, b) => a + b, 0);
        db.run('UPDATE reports SET copied_at = ? WHERE id = ?', now.toISOString(), id);
      } else if (kind === 'card') {
        const t = this.#o.tasks.get(id);
        projectId = t.projectId;
        displayId = t.displayId;
        this.#o.tasks.markCopied(id);
      } else {
        const a = db.get<{ project_id: string; display_id: string; status: string }>('SELECT project_id, display_id, status FROM ai_checks WHERE id = ?', id);
        if (!a) throw new CommandError('not_found', { reason: 'ai_check' });
        projectId = a.project_id;
        displayId = a.display_id;
        // 12.9: copied to the model, so a result may come back: «بانتظار تقرير النموذج».
        if (a.status === 'generated') db.run("UPDATE ai_checks SET status = 'awaiting_result' WHERE id = ?", id);
      }
      recordAudit(db, { id: newId(ports.random, 'aud'), at: now, action: 'report.copied', projectId, details: { kind, id, displayId, chars, redactions } });
    });
  }

  list(projectId: string): ReportRecord[] {
    if (!this.#o.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
    return this.#o.db.all<ReportRow>(`SELECT ${COLUMNS} FROM reports WHERE project_id = ? ORDER BY created_at DESC, rowid DESC`, projectId).map((r) => {
      const counts = r.redaction_counts_json ? (JSON.parse(r.redaction_counts_json) as { human?: Record<string, number>; model?: Record<string, number> }) : {};
      const byRule: Record<string, number> = { ...(counts.model ?? {}) };
      return {
        id: r.id,
        displayId: r.display_id,
        projectId: r.project_id,
        runId: r.run_id,
        targetKind: r.target_kind,
        findingIds: r.finding_ids_json ? (JSON.parse(r.finding_ids_json) as string[]) : [],
        lang: r.lang,
        templateVersion: r.template_version,
        humanChars: r.human_chars,
        modelChars: r.model_chars,
        redactions: { total: Object.values(byRule).reduce((a, b) => a + b, 0), byRule },
        parityOk: r.parity_ok === null ? null : r.parity_ok === 1,
        copiedAt: r.copied_at,
        createdAt: r.created_at,
      };
    });
  }

  compare(fromRunId: string, toRunId: string): RunComparison {
    return compareRuns(this.#o.db, fromRunId, toRunId);
  }

  /** report.export (C-23): one format, written where the dialog said, after the second pass. */
  async export(target: BuildTarget, o: { format: ExportFormat; lang: Lang; destination: string; includeScreenshots: boolean; content: 'both' | 'human' | 'model' }): Promise<ReportExported> {
    const { ports, db } = this.#o;
    const built = await this.build(target, { lang: o.lang, scope: 'wholeRun' });
    if (built.blocked) throw new CommandError('report_blocked', { reason: built.blocked.reason, where: built.blocked.where });
    const generatedAt = ports.clock.now().toISOString();
    const evidence: { name: string; data: Uint8Array; ok: boolean; id: string; screenshot: boolean }[] = [];
    if (o.format === 'evidence-bundle') {
      const redactor = this.#o.redaction.redactor();
      for (const c of built.report.checks) {
        if (!c.checkRunId) continue;
        for (const ref of this.#o.evidence.store.refsOf(c.checkRunId)) {
          const screenshot = ref.kind === 'capture' || ref.kind === 'capture_diff' || /\.(png|jpe?g|webp)$/i.test(ref.relPath);
          if (screenshot && !o.includeScreenshots) continue;
          const path = this.#o.evidence.store.absolute(ref.relPath);
          let data: Uint8Array | null = null;
          let ok = false;
          try {
            const st = await ports.fs.lstat(path);
            if (st?.isFile && st.size <= MAX_EVIDENCE_FILE) {
              data = (await ports.fs.readFilePrefix(path, MAX_EVIDENCE_FILE)).data;
              ok = createHash('sha256').update(data).digest('hex') === ref.sha256;
            }
          } catch {
            data = null;
          }
          // Text evidence passes the second redaction (12.5 rule 1); pixels cannot (D-46: the explicit choice above).
          if (data && ok && !screenshot) {
            const text = new TextDecoder().decode(data);
            const r = redactor.redactText(text);
            if (!redactor.secondPass(r.text).ok) throw new CommandError('report_blocked', { reason: 'secret_survived', where: ref.relPath });
            data = new TextEncoder().encode(r.text);
          }
          evidence.push({ name: posix.join(c.checkId.replace(/[^A-Za-z0-9.-]/g, '_'), posix.basename(posix.dirname(ref.relPath)).slice(0, 12), ref.relPath.split('/').slice(3).join('/')), data: data ?? new Uint8Array(0), ok: data !== null && ok, id: ref.id, screenshot });
        }
      }
    }
    const rendered = renderExport({ report: built.report, lang: o.lang, human: built.human.text, model: built.model.text, content: o.content, format: o.format, generatedAt, evidence, includeScreenshots: o.includeScreenshots });
    await ports.fs.writeFileAtomic(o.destination, rendered.data, 0o644);
    const sha256 = createHash('sha256').update(rendered.data).digest('hex');
    const projectId = db.get<{ project_id: string }>('SELECT project_id FROM reports WHERE id = ?', built.reportId)?.project_id ?? null;
    recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'report.exported', projectId, details: { reportId: built.reportId, displayId: built.displayId, format: o.format, lang: o.lang, bytes: rendered.data.length, sha256, screenshots: rendered.evidence?.screenshots ?? 0, damaged: rendered.evidence?.damaged.length ?? 0 } });
    const byRule = { ...built.model.redactions.byRule };
    for (const [k, v] of Object.entries(built.human.redactions.byRule)) byRule[k] = (byRule[k] ?? 0) + v;
    return { written: true, format: o.format, bytes: rendered.data.length, sha256, evidence: rendered.evidence, redactions: { total: Object.values(byRule).reduce((a, b) => a + b, 0), byRule } };
  }
}
