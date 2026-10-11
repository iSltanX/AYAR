// C-21 point 3: the two formats of one `report/1` (12.1, D-40). «لك» (12.2): what happened, what it means, each
// problem and its impact, the next step, the limits of the result, what passed — in the glossary's words, a hint at a
// term's first appearance, and none of 16.7's forbidden phrases. «للنموذج» (12.3, 12.4): the `model-report/1`
// template, Arabic or English, with the mandatory rules, the issues by priority with the fields of D-11, what passed
// and what it proves, what needs no model, earlier claims by the model, the change boundaries, the verification and
// the reply wanted. Both read the same object; both quote the project only inside the report's boundaries; both
// write the same identifiers, counts, scope and verdict in the forms parity.ts reads back.
import { createTranslator, formatDuration, type MessageKey, type Translate } from '@ayar/i18n';
import type { CheckOutcome, Lang, Report, ReportCheck, ReportClaim, ReportFinding } from '@ayar/protocol';
import { fenced, inline } from './boundaries.ts';

export type Rendered = { text: string; sections: Record<string, number> };

const OUTCOME_ORDER: readonly CheckOutcome[] = ['passed', 'failed', 'warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped', 'not_applicable'];
const outcomeKey = (o: CheckOutcome): MessageKey => `status.result.${o.replace(/_/g, '-')}` as MessageKey;

/** A translation that never throws for a key the catalog may lack (a rule without an impact text falls back). */
export function tryT(t: Translate, key: string, params?: Record<string, string | number>): string | null {
  try {
    return t(key as MessageKey, params);
  } catch {
    return null;
  }
}

export class Renderer {
  readonly t: Translate;
  readonly lang: Lang;
  #hinted = new Set<string>();

  constructor(lang: Lang) {
    this.lang = lang;
    this.t = createTranslator(lang);
  }

  /** 12.2 and 16.7: a glossary term gets its hint at its first appearance in the page. */
  term(key: string): string {
    const word = this.t(`glossary.${key}` as MessageKey);
    const hint = tryT(this.t, `report.hint.${key}`);
    if (!hint || this.#hinted.has(key)) return word;
    this.#hinted.add(key);
    return `${word} (${hint})`;
  }

  outcome(o: CheckOutcome | null, reviewed = false): string {
    if (o === null) return this.t('report.outcome.absent');
    if (reviewed && (o === 'passed' || o === 'failed')) return this.t(`status.result.${o}-reviewed` as MessageKey);
    return this.t(outcomeKey(o));
  }

  checkTitle(checkId: string): string {
    return tryT(this.t, `catalog.check.${checkId.replace('*', 'any')}.title`) ?? checkId;
  }

  ruleTitle(f: ReportFinding): string {
    return tryT(this.t, f.titleKey) ?? f.ruleId;
  }

  where(f: ReportFinding): string {
    const l = f.location;
    if (!l) return this.t('report.where.none');
    if (l.path) return inline(`${l.path}${l.line ? `:${l.line}${l.column ? `:${l.column}` : ''}` : ''}${l.outside ? ` (${this.t('report.where.outside')})` : ''}`);
    if (l.key) return inline(l.key);
    if (l.commit) return inline(`commit ${l.commit}`);
    const parts = [l.page, l.state, l.viewport, l.theme, l.lang].filter((x): x is string => !!x);
    return parts.length ? inline(parts.join(' · ')) : this.t('report.where.none');
  }

  nextStep(n: ReportFinding['nextStep']): string {
    const label = n.kind === 'direct' ? this.t('ui.nextStep.handleDirectly') : n.kind === 'model' ? this.t('ui.nextStep.needsModel') : n.kind === 'review' ? this.t('ui.nextStep.needsReview') : this.t('ui.nextStep.nothingRequired');
    const button = n.kind === 'model' ? this.t('ui.action.selectForCopy') : n.kind === 'review' ? this.t('ui.action.reviewAndDecide') : n.kind === 'direct' ? this.t(`report.button.${n.action ?? 'setup'}` as MessageKey) : null;
    const reason = tryT(this.t, n.reason.key, n.reason.params) ?? n.reason.key;
    const hand = n.orByHand ? ` ${this.t('report.next.orByHand')}` : '';
    return button ? `${label} — «${button}»: ${reason}${hand}` : `${label}: ${reason}`;
  }

  reason(r: { key: string; params?: Record<string, string | number> } | null): string {
    if (!r) return '';
    return tryT(this.t, r.key, r.params) ?? r.key;
  }

  /** The counts block both formats carry, one line per outcome: `- label: n` (parity reads it back). */
  countsBlock(report: Report): string[] {
    const out: string[] = [];
    for (const o of OUTCOME_ORDER) {
      const n = report.head.counts[o];
      if (n) out.push(`- ${this.t(outcomeKey(o))}: ${n}`);
    }
    return out.length ? out : [`- ${this.t('report.counts.none')}`];
  }

  verdictLine(report: Report): string {
    const v = report.head.verdict ? this.t(`status.verdict.${report.head.verdict}` as MessageKey) : this.t('report.verdict.none');
    const karat = report.head.karat !== null ? this.t('status.karat.value', { value: report.head.karat, total: 24 }) : this.t('status.karat.noScope');
    return `${this.t('report.label.verdict')}: ${v} · ${this.t('report.label.karat')}: ${karat}${report.head.narrow ? ` (${this.t('ui.marker.narrowScope')})` : ''}`;
  }

  scopeLine(report: Report): string {
    return `${this.t('report.label.scope')}: ${this.t('report.scope.value', { criteria: report.head.scope.criteria, checks: report.head.scope.checks, instances: report.head.scope.instances })}`;
  }

  /** The check's limits, and its execution notes (G-DEV7-04: the blocked external resources, the project command outside the network guarantee). */
  limitsLine(c: ReportCheck): string {
    const notes = c.notes.map((n) => ` ${this.t('report.label.note')}: ${tryT(this.t, n) ?? `\`${n}\``}`).join(' ·');
    return `- ${this.checkTitle(c.checkId)} (\`${c.checkId}\`): ${tryT(this.t, c.limitsKey) ?? ''}${notes ? ` ·${notes}` : ''}`;
  }

  // ── «للنموذج» (12.3 / 12.4) ───────────────────────────────────────────────────────────────────────────────

  renderModel(report: Report): Rendered {
    const { t } = this;
    const sections: Record<string, number> = {};
    const out: string[] = [];
    const mark = (name: string) => (sections[name] = out.join('\n').length);
    const created = report.head.createdAt.slice(0, 19).replace('T', ' ');
    out.push(t('report.model.title'));
    out.push(`<!-- ${t('report.model.meta', { template: 'model-report/1', lang: this.lang, id: report.displayId, created })} -->`);
    out.push('');
    mark('task');
    out.push(t('report.model.task.heading'));
    const issues = report.findings.filter((f) => f.effect !== 'note' && f.effect !== 'excluded');
    if (report.card) out.push(t('report.model.task.card', { id: report.target.kind === 'card' ? report.target.taskDisplayId : report.displayId }));
    else if (issues.length) out.push(t('report.model.task.fix', { project: inline(report.head.project.name) }), t('report.model.task.accepted'));
    else out.push(t('report.model.task.noIssues'));
    out.push('');
    mark('rules');
    out.push(t('report.model.rules.heading'));
    for (let i = 1; i <= 8; i++) out.push(`${i}. ${t(`report.model.rule${i}` as MessageKey, { token: report.token })}`);
    if (report.card) out.push(`9. ${t('report.model.rule9card')}`);
    out.push('');
    mark('context');
    out.push(t('report.model.context.heading'));
    const h = report.head;
    out.push(`- ${t('report.model.context.type', { types: inline(h.project.ecosystems.join(' · ') || t('report.unknown')) })}`);
    out.push(`- ${t('report.model.context.env', { os: h.environment.os, node: h.environment.node ?? '—', python: h.environment.python ?? '—', manager: inline(h.environment.packageManager ?? '—') })}`);
    out.push(`- ${t('report.model.context.state', { branch: inline(h.state.branch ?? '—'), commit: h.state.commit?.slice(0, 12) ?? '—', dirty: h.state.dirty === null ? t('report.unknown') : h.state.dirty ? t('report.yes') : t('report.no') })}`);
    out.push(`- ${t('report.model.context.versions', { profile: h.versions.profile ?? '—', catalog: h.versions.catalog, run: h.run?.displayId ?? '—', date: h.run?.startedAt?.slice(0, 10) ?? created.slice(0, 10) })}`);
    out.push(`- ${this.verdictLine(report)} · ${this.scopeLine(report)}`);
    out.push(`- ${t('report.label.counts')}:`, ...this.countsBlock(report));
    out.push('');
    mark('issues');
    out.push(t('report.model.issues.heading'));
    if (!issues.length) out.push(t('report.model.issues.none'));
    issues.forEach((f, i) => out.push(...this.#modelIssue(report, f, i + 1)));
    out.push('');
    mark('passed');
    out.push(t('report.model.passed.heading'));
    const passed = report.checks.filter((c) => c.outcome === 'passed');
    if (!passed.length) out.push(t('report.model.passed.none'));
    for (const c of passed) {
      const proves = c.proves ? (tryT(t, c.proves.key, c.proves.params) ?? t('report.proves.generic', { files: c.proves.params.files ?? 0 })) : '';
      out.push(`- \`${c.checkId}\` (${this.checkTitle(c.checkId)}${c.reviewed ? `، ${t('ui.marker.reviewed')}` : ''}) · ${proves} · ${t('report.label.scopeOf')}: \`${inline(c.component)}\` · ${t('report.label.limits')}: ${tryT(t, c.limitsKey) ?? ''}`);
    }
    out.push(t('report.model.passed.keep'));
    out.push('');
    mark('noModel');
    out.push(t('report.model.noModel.heading'));
    // G-41: one meaning in both languages — what the owner handles in AYAR directly: setup, approvals, references,
    // reviews, and the claims to prove by a recheck; the model does not attempt them.
    const direct = [...report.checks.filter((c) => c.nextStep.kind === 'direct'), ...report.notRun.filter((n) => n.nextStep.kind === 'direct' && !report.checks.some((c) => c.instance === n.instance))];
    const reviews = report.checks.filter((c) => c.nextStep.kind === 'review');
    const directFindings = report.findings.filter((f) => f.nextStep.kind === 'direct');
    const reviewFindings = report.findings.filter((f) => f.nextStep.kind === 'review');
    const lines: string[] = [];
    for (const c of direct) lines.push(`- \`${c.instance}\`: ${this.outcome(c.outcome)} — ${this.reason(c.reason)} → ${t('ui.nextStep.handleDirectly')} («${t(`report.button.${c.nextStep.action ?? 'setup'}` as MessageKey)}»)`);
    for (const c of reviews) lines.push(`- \`${c.instance}\`: ${this.outcome(c.outcome)} — ${this.reason(c.reason)} → ${t('ui.nextStep.needsReview')} («${t('ui.action.reviewAndDecide')}»)`);
    for (const f of directFindings) lines.push(`- ${f.displayId} (${this.ruleTitle(f)}): ${this.reason(f.nextStep.reason)} → ${t('ui.nextStep.handleDirectly')}`);
    for (const f of reviewFindings) lines.push(`- ${f.displayId} (${this.ruleTitle(f)}): ${this.reason(f.nextStep.reason)} → ${t('ui.nextStep.needsReview')}`);
    for (const c of report.integrity.claims.filter((x) => x.status === 'open')) lines.push(`- ${c.displayId} (${t('glossary.modelClaim')}): ${this.reason(c.nextStep.reason)} → ${c.nextStep.kind === 'direct' ? `${t('ui.nextStep.handleDirectly')} («${t('ui.action.proveByRecheck')}»)` : `${t('ui.nextStep.needsReview')} («${t('ui.action.reviewAndDecide')}»)`}`);
    out.push(...(lines.length ? lines : [t('report.model.noModel.none')]));
    out.push('');
    mark('claims');
    out.push(t('report.model.claims.heading'));
    if (!report.integrity.claims.length) out.push(t('report.model.claims.none'));
    for (const c of report.integrity.claims) out.push(this.#claimLine(c));
    out.push('');
    mark('boundaries');
    out.push(t('report.model.boundaries.heading'));
    const files = [...new Set(issues.map((f) => f.location?.path).filter((p): p is string => !!p && !p.includes('..')))].slice(0, 50);
    out.push(`- ${t('report.model.boundaries.files', { files: files.length ? files.map((p) => `\`${inline(p)}\``).join(', ') : t('report.model.boundaries.noFiles') })}`);
    out.push(`- ${t('report.model.boundaries.preserve')}`);
    out.push('');
    mark('verification');
    out.push(t('report.model.verification.heading'));
    const commands = [...new Set(report.checks.filter((c) => c.command && (issues.some((f) => f.checkRunId === c.checkRunId) || !issues.length)).map((c) => `\`${inline((c.command!.cwd && c.command!.cwd !== '.' ? `cd ${c.command!.cwd} && ` : '') + c.command!.argv.join(' '))}\``))].slice(0, 20);
    out.push(`- ${t('report.model.verification.local', { commands: commands.length ? commands.join(' · ') : t('report.model.verification.noCommands') })}`);
    const recheck = [...new Set((issues.length ? issues.map((f) => f.checkId) : report.checks.map((c) => c.checkId)).filter((id) => !id.startsWith('integ.')))];
    out.push(`- ${t('report.model.verification.ayar', { checks: recheck.map((c) => `\`${c}\``).join(', ') || '—', run: report.head.run?.displayId ?? '—' })}`);
    // 12.1 «حدود»: every limit «لك» names is here too (the parity reads both).
    const nonPassed = report.checks.filter((c) => c.outcome !== 'passed' && c.outcome !== null && c.outcome !== 'not_applicable');
    if (nonPassed.length) out.push(`- ${t('report.label.limitsOfChecks')}:`, ...nonPassed.map((c) => `  ${this.limitsLine(c)}`));
    out.push('');
    mark('reply');
    out.push(t('report.model.reply.heading'));
    for (let i = 1; i <= 4; i++) out.push(`${i}. ${t(`report.model.reply${i}` as MessageKey)}`);
    if (report.card) {
      out.push('');
      mark('card');
      out.push(t('report.model.card.heading'));
      out.push(fenced(report.token, report.card, { source: t('report.model.card.source'), range: report.displayId }));
    }
    return { text: `${out.join('\n')}\n`, sections };
  }

  #modelIssue(report: Report, f: ReportFinding, n: number): string[] {
    const { t } = this;
    const out: string[] = [];
    out.push('', `### ${n}. ${inline(this.ruleTitle(f))} — ${f.displayId}${f.fromClaim ? ` (${t('report.model.issue.fromClaim', { claim: f.fromClaim })})` : ''}`);
    out.push(`- ${t('report.model.issue.checkRule', { check: f.checkId, rule: `${f.ruleId}@${f.ruleVersion}`, toolRule: f.toolRuleId ? ` (${inline(f.toolRuleId)})` : '' })}`);
    out.push(`- ${t('report.model.issue.severity', { severity: t(`ui.severity.${f.severity}` as MessageKey), proof: t(`glossary.proof.${f.proof}` as MessageKey), blocking: f.blocking ? t('report.yes') : t('report.no'), origin: t(`ui.origin.${f.origin}` as MessageKey), status: t(`ui.crossRun.${f.crossRunStatus}` as MessageKey) })}`);
    out.push(`- ${t('report.label.where')}: ${this.where(f)}`);
    out.push(`- ${t('report.label.expected')}: ${f.expected ? inline(f.expected) : t('report.model.issue.expectedFromRule')}`);
    out.push(`- ${t('report.label.actual')}: ${inline(f.actual ?? f.message)}`);
    out.push(`- ${t('report.label.reproduce')}:`);
    f.reproduce.steps.forEach((s, i) => out.push(`  ${i + 1}. ${tryT(t, s, { component: f.component, path: f.location?.path ?? '', line: f.location?.line ?? '' }) ?? s}`));
    out.push(`  ${f.reproduce.steps.length + 1}. ${t('report.label.command')}: ${f.reproduce.command ? `\`${inline(f.reproduce.command)}\`` : t('report.model.issue.noCommand')}`);
    out.push(`- ${t('report.label.evidence')}:`);
    if (f.evidence) out.push(fenced(report.token, f.evidence.text, { source: f.evidence.source, range: `${f.evidence.range}${f.evidence.truncated ? ` · ${t('report.evidence.truncated')}` : ''}` }));
    else out.push(fenced(report.token, f.message, { source: t('report.evidence.message'), range: f.displayId }));
    if (f.reference) out.push(`- ${t('report.label.reference')}: ${f.reference.name} — ${f.reference.url}`);
    if (f.fix.kind === 'suggested') out.push(`- ${t('report.label.fix')}: ${tryT(t, f.fix.key, { path: f.location?.path ?? '', actual: f.actual ?? '', expected: f.expected ?? '' }) ?? t('report.model.issue.fixFromRule')} (${t('report.model.issue.fixEvidence', { evidence: inline(f.fix.evidence) })})`);
    else {
      out.push(`- ${t('report.label.fix')}: ${t('report.model.issue.diagnose')}`);
      f.fix.steps.forEach((s, i) => out.push(`  ${i + 1}. ${tryT(t, s, { check: f.checkId, path: f.location?.path ?? '' }) ?? s}`));
      out.push(`  ${t('report.model.issue.thenPropose')}`);
    }
    out.push(`- ${t('report.label.acceptance')}: ${t(f.acceptance.key as MessageKey, { check: f.acceptance.check, id: f.displayId })}`);
    return out;
  }

  #claimLine(c: ReportClaim): string {
    const { t } = this;
    const status = c.status === 'proven' ? t('report.claim.proven', { finding: c.provenFindingDisplayId ?? '—' }) : c.status === 'decided_card' ? t('report.claim.decidedCard') : c.status === 'decided_not_issue' ? t('report.claim.decidedNotIssue') : t('report.claim.open');
    return `- ${c.displayId} (${t('glossary.modelClaim')} · ${t(`report.claim.kind.${c.kind}` as MessageKey)}${c.location?.path ? ` · ${inline(c.location.path)}${c.location.line ? `:${c.location.line}` : ''}` : ''}): «${inline(c.summary.slice(0, 300))}» → ${status}`;
  }

  // ── «لك» (12.2) ──────────────────────────────────────────────────────────────────────────────────────────

  renderHuman(report: Report): Rendered {
    const { t } = this;
    this.#hinted = new Set();
    const sections: Record<string, number> = {};
    const out: string[] = [];
    const mark = (name: string) => (sections[name] = out.join('\n').length);
    const h = report.head;
    out.push(`# ${t('report.human.title', { id: report.displayId, project: inline(h.project.name) })}`);
    out.push('');
    mark('whatHappened');
    out.push(`## ${t('ui.report.whatHappened')}`);
    const total = Object.values(h.counts).reduce((a, b) => a + (b ?? 0), 0);
    const duration = h.run?.durationMs !== null && h.run?.durationMs !== undefined ? formatDuration(h.run.durationMs, this.lang) : null;
    out.push(t('report.human.happened', { count: total, duration: duration ?? t('report.unknown'), checkWord: this.term('check'), run: h.run?.displayId ?? report.displayId }));
    out.push(...this.countsBlock(report));
    if (h.counts.not_applicable) out.push(t('report.human.notApplicable', { count: h.counts.not_applicable }));
    out.push('');
    mark('whatItMeans');
    out.push(`## ${t('ui.report.whatItMeans')}`);
    out.push(this.verdictLine(report));
    out.push(this.scopeLine(report));
    out.push(this.#meaning(report));
    out.push('');
    mark('problems');
    const issues = report.findings.filter((f) => f.effect !== 'note' && f.effect !== 'excluded');
    out.push(`## ${t('report.human.problems.heading')}`);
    if (!issues.length) out.push(t('report.human.problems.none'));
    for (const f of issues) out.push(...this.#humanProblem(f));
    const notes = report.findings.filter((f) => f.effect === 'note');
    if (notes.length) {
      out.push('', `### ${t('report.human.notes.heading')}`);
      for (const f of notes) out.push(`- ${f.displayId} — ${inline(this.ruleTitle(f))} (${this.where(f)}): ${inline(f.message.slice(0, 200))}`);
    }
    const excluded = report.findings.filter((f) => f.effect === 'excluded');
    if (excluded.length) out.push('', t('report.human.excluded', { count: excluded.length, ids: excluded.map((f) => f.displayId).join(', ') }));
    out.push('');
    mark('whatToDo');
    out.push(`## ${t('ui.report.whatToDoNow')}`);
    out.push(...this.#whatToDo(report, issues));
    out.push('');
    mark('limits');
    out.push(`## ${t('ui.report.limits')}`);
    const ran = report.checks.filter((c) => c.outcome !== null && c.outcome !== 'not_applicable');
    if (!ran.length) out.push(t('report.human.limits.none'));
    for (const c of ran) out.push(this.limitsLine(c));
    out.push('');
    mark('passed');
    out.push(`## ${t('report.human.passed.heading')}`);
    const passed = report.checks.filter((c) => c.outcome === 'passed');
    if (!passed.length) out.push(t('report.human.passed.none'));
    for (const c of passed) {
      const proves = c.proves ? (tryT(t, c.proves.key, c.proves.params) ?? t('report.proves.generic', { files: c.proves.params.files ?? 0 })) : '';
      out.push(`- ${this.checkTitle(c.checkId)} (\`${c.checkId}\`${c.reviewed ? `، ${t('ui.marker.reviewed')}` : ''}): ${proves} — ${t('report.label.scopeOf')}: \`${inline(c.component)}\``);
    }
    out.push('');
    mark('integrity');
    out.push(`## ${this.term('integrity')}`);
    out.push(...this.#integrity(report));
    if (report.card) {
      out.push('', `## ${t('report.human.card.heading')}`);
      out.push(t('report.human.card.note', { id: report.target.kind === 'card' ? report.target.taskDisplayId : report.displayId }));
    }
    return { text: `${out.join('\n')}\n`, sections };
  }

  #meaning(report: Report): string {
    const { t } = this;
    const h = report.head;
    const blocking = report.checks.filter((c) => c.blocking && c.outcome === 'failed');
    const needsSetup = report.notRun.filter((n) => n.outcome === 'missing').length;
    if (h.run?.cancelled) return t('report.human.meaning.cancelled', { karatWord: this.term('karat') });
    if (h.verdict === 'blocked') return t('report.human.meaning.blocked', { checks: blocking.map((c) => `${this.checkTitle(c.checkId)} (\`${c.checkId}\`)`).join(t('report.human.and')) || '—', karat: h.karat ?? 0, blockingWord: this.term('blocking'), setup: needsSetup });
    if (h.verdict === 'pure') return t('report.human.meaning.pure', { karatWord: this.term('karat'), criteria: h.scope.criteria });
    if (h.verdict === 'incomplete') {
      const reasons = (report.purity?.incompleteReasons ?? []).map((r) => this.reason(r)).filter(Boolean).slice(0, 6);
      return t('report.human.meaning.incomplete', { karat: h.karat ?? 0, reasons: reasons.join('؛ ') || t('report.unknown'), setup: needsSetup });
    }
    return t('report.human.meaning.none', { kind: h.scope.kind });
  }

  #humanProblem(f: ReportFinding): string[] {
    const { t } = this;
    const out: string[] = [];
    out.push('', `### ${f.displayId} — ${inline(this.ruleTitle(f))}`);
    out.push(`- ${t('report.label.severity')}: ${t(`ui.severity.${f.severity}` as MessageKey)} · ${this.term(f.proof === 'proven' ? 'proof.proven' : f.proof === 'suspected' ? 'proof.suspected' : 'proof.suggestion')}${f.blocking ? ` · ${this.term('blocking')}` : ''} · ${t(`ui.crossRun.${f.crossRunStatus}` as MessageKey)}`);
    out.push(`- ${t('report.label.where')}: ${this.where(f)} — ${this.checkTitle(f.checkId)} (\`${f.checkId}\`)`);
    out.push(`- ${t('report.human.problem.whatHappened')}: ${inline(f.message.slice(0, 400) || this.ruleTitle(f))}`);
    const impact = (f.impactKey ? tryT(t, f.impactKey, { path: f.location?.path ?? '', actual: f.actual ?? '', expected: f.expected ?? '' }) : null) ?? tryT(t, `catalog.check.${f.checkId.replace('*', 'any')}.why`) ?? '';
    out.push(`- ${t('report.human.problem.impact')}: ${impact}`);
    if (f.fromClaim) out.push(`- ${t('report.human.problem.fromClaim', { claim: f.fromClaim })}`);
    out.push(`- ${this.term('nextStep')}: ${this.nextStep(f.nextStep)}`);
    return out;
  }

  #whatToDo(report: Report, issues: ReportFinding[]): string[] {
    const { t } = this;
    const out: string[] = [];
    const direct = [...report.checks.filter((c) => c.nextStep.kind === 'direct' && c.outcome !== null), ...report.notRun.filter((n) => n.nextStep.kind === 'direct' && !report.checks.some((c) => c.instance === n.instance))];
    const model = issues.filter((f) => f.nextStep.kind === 'model');
    const review = [...report.checks.filter((c) => c.nextStep.kind === 'review'), ...issues.filter((f) => f.nextStep.kind === 'review')];
    out.push(`### ${t('ui.nextStep.handleDirectly')}`);
    if (!direct.length && !issues.some((f) => f.nextStep.kind === 'direct') && !report.integrity.claims.some((c) => c.status === 'open' && c.nextStep.kind === 'direct')) out.push(t('report.human.todo.nothing'));
    for (const c of direct) out.push(`- «${t(`report.button.${c.nextStep.action ?? 'setup'}` as MessageKey)}» — ${this.checkTitle(c.checkId)} (\`${c.instance}\`): ${this.outcome(c.outcome)}، ${this.reason(c.reason)}`);
    for (const f of issues.filter((x) => x.nextStep.kind === 'direct')) out.push(`- «${t(`report.button.${f.nextStep.action ?? 'setup'}` as MessageKey)}» — ${f.displayId}: ${this.reason(f.nextStep.reason)}`);
    for (const c of report.integrity.claims.filter((x) => x.status === 'open' && x.nextStep.kind === 'direct')) out.push(`- «${t('ui.action.proveByRecheck')}» — ${c.displayId} (${this.term('modelClaim')}): ${this.reason(c.nextStep.reason)}`);
    out.push('', `### ${t('ui.nextStep.needsModel')}`);
    if (!model.length) out.push(t('report.human.todo.nothing'));
    for (const f of model) out.push(`- «${t('ui.action.selectForCopy')}» — ${f.displayId} (${inline(this.ruleTitle(f))}، ${this.where(f)})${f.nextStep.orByHand ? ` ${t('report.next.orByHand')}` : ''}`);
    if (model.length) out.push(t('report.human.todo.copyNote', { button: t('ui.action.copyForModel') }));
    out.push('', `### ${t('ui.nextStep.needsReview')}`);
    const openClaims = report.integrity.claims.filter((c) => c.status === 'open' && c.nextStep.kind === 'review');
    if (!review.length && !openClaims.length) out.push(t('report.human.todo.nothing'));
    for (const r of review) {
      if ('displayId' in r) out.push(`- «${t('ui.action.reviewAndDecide')}» — ${r.displayId}: ${this.reason(r.nextStep.reason)}`);
      else out.push(`- «${t('ui.action.reviewAndDecide')}» — ${this.checkTitle(r.checkId)} (\`${r.instance}\`): ${this.outcome(r.outcome)}، ${this.reason(r.reason)}`);
    }
    for (const c of openClaims) out.push(`- «${t('ui.action.reviewAndDecide')}» — ${c.displayId} (${this.term('modelClaim')}): ${this.reason(c.nextStep.reason)}`);
    out.push('', `### ${t('ui.nextStep.nothingRequired')}`);
    const none = [...report.checks.filter((c) => c.nextStep.kind === 'none' && c.outcome !== null)];
    if (!none.length) out.push(t('report.human.todo.nothing'));
    for (const c of none) out.push(`- ${this.checkTitle(c.checkId)} (\`${c.instance}\`): ${this.outcome(c.outcome, c.reviewed)} — ${this.reason(c.nextStep.reason)}`);
    return out;
  }

  #integrity(report: Report): string[] {
    const { t } = this;
    const out: string[] = [];
    const i = report.integrity;
    out.push(t('report.human.integrity.intro'));
    for (const c of i.checks) out.push(`- ${this.checkTitle(c.checkId)} (\`${c.checkId}\`): ${this.outcome(c.outcome)}${c.reason ? ` — ${this.reason(c.reason)}` : ''}${c.findingIds.length ? ` (${c.findingIds.join(', ')})` : ''}`);
    if (!i.checks.length) out.push(t('report.human.integrity.notEvaluated'));
    out.push(t('status.purity.integrityHold', { count: i.blocksPure }));
    if (i.stateChanged) out.push(`- ${t('report.human.integrity.stateChanged', { files: i.changedFiles.slice(0, 10).map((p) => `\`${inline(p)}\``).join(', ') || '—' })}`);
    if (i.reviews.length) out.push(`- ${t('report.human.integrity.reviews', { count: i.reviews.length, valid: i.reviews.filter((r) => r.valid).length, expired: i.reviews.filter((r) => !r.valid).length })}`);
    if (i.claims.length) {
      out.push(`- ${t('report.human.integrity.claims', { count: i.claims.length, open: i.claims.filter((c) => c.status === 'open').length, proven: i.claims.filter((c) => c.status === 'proven').length })}`);
      for (const c of i.claims) out.push(`  ${this.#claimLine(c)}`);
    }
    return out;
  }
}
