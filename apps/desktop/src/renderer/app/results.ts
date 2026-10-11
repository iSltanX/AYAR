// The run results as the components draw them (13.3 «نتائج التشغيل», 12.2, 12.7): findings as table rows, the
// next steps of `report/1` grouped as «ماذا أفعل الآن» says them, the evidence and the side effects of the
// executions as table rows, and the counts the re-run sheet offers. Everything comes from the engine's objects
// (run.get, results.query, report.build) and reads the same message keys as the report's «لك» text, so the page
// never says what the report denies (12.1). Pure functions; no markup, no engine call.
import type { Lang, Translate } from '@ayar/i18n';
import type { CheckOutcome, CheckRunDetail, Finding as WireFinding, NextStepInfo, Report, ReportCheck, ReportFinding } from '@ayar/protocol';
import type { DirectAction } from '../lib/evidence.ts';
import type { Finding, FindingGroup } from '../lib/results.ts';
import type { RerunStatus } from '../lib/sheets.ts';
import { checkTitle, hasMessage, reasonText, sectionOfCheck, sectionRank, sectionTitle, textOr } from './format.ts';

/** A finding's title: its rule's catalog title, or the tool's message. */
export function findingTitle(t: Translate, lang: Lang, f: Pick<WireFinding, 'titleKey' | 'message' | 'ruleId'>): string {
  return textOr(t, lang, f.titleKey, f.message || f.ruleId);
}

/** A protocol finding as a table row (C-07). */
export function findingRow(t: Translate, lang: Lang, f: WireFinding): Finding {
  return {
    id: f.id,
    severity: f.severity,
    proof: f.proof,
    title: findingTitle(t, lang, f),
    location: { path: f.location?.path ?? f.location?.key ?? f.location?.page ?? '', ...(f.location?.line ? { line: f.location.line } : {}) },
    check: f.checkId,
    crossRun: f.crossRunStatus,
  };
}

export type FindingGrouping = 'check' | 'section' | 'severity' | 'none';
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

/** The table's groups: by section (the sidebar's order), by check, by severity, or one group. */
export function findingGroups(t: Translate, lang: Lang, findings: readonly WireFinding[], grouping: FindingGrouping): FindingGroup[] {
  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.displayId.localeCompare(b.displayId));
  const by = new Map<string, { title: string; rank: number; items: WireFinding[] }>();
  for (const f of sorted) {
    const section = sectionOfCheck(f.checkId);
    const [id, title, rank] =
      grouping === 'check'
        ? [f.checkId, checkTitle(t, lang, f.checkId), sectionRank(section) * 1000]
        : grouping === 'section'
          ? [section, sectionTitle(t, section), sectionRank(section)]
          : grouping === 'severity'
            ? [f.severity, t(`ui.severity.${f.severity}`), SEVERITY_RANK[f.severity]]
            : ['all', t('ui.tab.findings'), 0];
    const g = by.get(id) ?? { title, rank, items: [] };
    g.items.push(f);
    by.set(id, g);
  }
  return [...by.entries()].sort((a, b) => a[1].rank - b[1].rank).map(([id, g]) => ({ id, title: g.title, findings: g.items.map((f) => findingRow(t, lang, f)) }));
}

// ── «ماذا أفعل الآن» (12.7): the four next steps, with the one button each ─────────────────────────────────────

export interface NextItem {
  /** A row key. */
  key: string;
  /** The sentence (body): what it is and why. */
  text: string;
  /** The id under it (mono): a check instance or a finding's display id. */
  ref: string;
  /** For a direct step, the action («rerun»: the checks a cancel or a stop left, re-run as one, S7-10). */
  action?: NonNullable<NextStepInfo['action']> | 'rerun';
  findingId?: string;
  checkRunId?: string;
  instance?: string;
}

export interface NextSteps {
  direct: NextItem[];
  model: NextItem[];
  review: NextItem[];
  /** «لا شيء مطلوب»: one summary line. */
  none: string | null;
}

const issueOf = (f: ReportFinding) => f.effect !== 'note' && f.effect !== 'excluded';

/** The next steps of the report, grouped as its «لك» text groups them (render.ts #whatToDo). */
export function nextSteps(t: Translate, lang: Lang, report: Report): NextSteps {
  const issues = report.findings.filter(issueOf);
  const checkLine = (checkId: string, reason: string) => t('resultsui.next.check', { check: checkTitle(t, lang, checkId), reason });
  // A cancel or a stop left checks without a result: one step re-runs them all (DES-4 7.10 «أعد غير المكتمل»).
  const stopped = report.checks.filter((c) => c.outcome === 'cancelled' || c.outcome === 'interrupted');
  const direct: NextItem[] = [
    ...(stopped.length ? [{ key: 'stopped', text: t('resultsui.next.stopped', { count: stopped.length }), ref: '', action: 'rerun' as const }] : []),
    ...report.checks
      .filter((c) => c.nextStep.kind === 'direct' && c.outcome !== null && c.outcome !== 'cancelled' && c.outcome !== 'interrupted')
      .map((c) => ({ key: c.instance, text: checkLine(c.checkId, reasonText(t, lang, c.reason) || reasonText(t, lang, c.nextStep.reason)), ref: c.checkId, action: c.nextStep.action ?? 'setup', ...(c.checkRunId ? { checkRunId: c.checkRunId } : {}), instance: c.instance })),
    ...report.notRun
      .filter((n) => n.nextStep.kind === 'direct' && !report.checks.some((c) => c.instance === n.instance))
      .map((n) => ({ key: n.instance, text: checkLine(n.checkId, reasonText(t, lang, n.reason) || reasonText(t, lang, n.nextStep.reason)), ref: n.checkId, action: n.nextStep.action ?? 'setup', instance: n.instance })),
    ...issues.filter((f) => f.nextStep.kind === 'direct').map((f) => ({ key: f.id, text: t('resultsui.next.finding', { title: textOr(t, lang, f.titleKey, f.message), reason: reasonText(t, lang, f.nextStep.reason) }), ref: f.displayId, action: f.nextStep.action ?? 'setup', findingId: f.id })),
  ];
  const model = issues.filter((f) => f.nextStep.kind === 'model').map((f) => ({ key: f.id, text: t('resultsui.next.finding', { title: checkTitle(t, lang, f.checkId), reason: textOr(t, lang, f.titleKey, f.message) }), ref: f.displayId, findingId: f.id }));
  const review: NextItem[] = [
    ...issues.filter((f) => f.nextStep.kind === 'review').map((f) => ({ key: f.id, text: t('resultsui.next.finding', { title: checkTitle(t, lang, f.checkId), reason: textOr(t, lang, f.titleKey, f.message) }), ref: f.displayId, findingId: f.id })),
    ...report.checks
      .filter((c) => c.nextStep.kind === 'review' && !issues.some((f) => f.checkRunId === c.checkRunId && f.nextStep.kind === 'review'))
      .map((c) => ({ key: c.instance, text: checkLine(c.checkId, reasonText(t, lang, c.nextStep.reason)), ref: c.checkId, ...(c.checkRunId ? { checkRunId: c.checkRunId } : {}), instance: c.instance })),
  ];
  const passed = report.checks.filter((c) => c.nextStep.kind === 'none' && c.outcome === 'passed').length;
  const none = passed ? t('resultsui.next.none', { count: passed, reason: t('report.next.passed') }) : null;
  return { direct, model, review, none };
}

/** 12.7's direct actions as the inspector's next-step card names them (C-25). */
export function directAction(action: NextStepInfo['action']): DirectAction {
  switch (action) {
    case 'approve':
      return 'approve';
    case 'define':
      return 'define';
    case 'recheck':
      return 'proveByRecheck';
    default:
      // setup and install: the setup panel prepares both (DES-3 has no separate «ثبّت التبعيات» card action).
      return 'setUp';
  }
}

/** «ما اجتاز»: what each passed check proved, in its scope. */
export function passedLines(t: Translate, lang: Lang, report: Report): string[] {
  return report.checks
    .filter((c) => c.outcome === 'passed')
    .map((c) => {
      const proves = c.proves ? (hasMessage(lang, c.proves.key) ? t(c.proves.key, c.proves.params) : t('report.proves.generic', { files: c.proves.params.files ?? 0 })) : '';
      return proves ? t('resultsui.passed.line', { check: checkTitle(t, lang, c.checkId), proves }) : checkTitle(t, lang, c.checkId);
    });
}

/** «حدود هذه النتيجة»: each check that ran, with its catalog limits. */
export function limitLines(t: Translate, lang: Lang, report: Report): string[] {
  return report.checks
    .filter((c): c is ReportCheck & { outcome: CheckOutcome } => c.outcome !== null && c.outcome !== 'not_applicable')
    .map((c) => textOr(t, lang, c.limitsKey))
    .filter((x, i, all) => x && all.indexOf(x) === i);
}

/** «المشكلات وأثرها»: each open issue with its impact sentence. */
export function problemLines(t: Translate, lang: Lang, report: Report): { id: string; severity: ReportFinding['severity']; text: string }[] {
  return report.findings.filter(issueOf).map((f) => {
    const params = { path: f.location?.path ?? '', actual: f.actual ?? '', expected: f.expected ?? '' };
    const impact = (f.impactKey && hasMessage(lang, f.impactKey) ? t(f.impactKey, params) : '') || textOr(t, lang, `catalog.check.${f.checkId}.why`);
    return { id: f.id, severity: f.severity, text: t('resultsui.problem.line', { title: textOr(t, lang, f.titleKey, f.message), impact }) };
  });
}

// ── the evidence and side-effects tabs ────────────────────────────────────────────────────────────────────

export interface EvidenceRow {
  id: string;
  path: string;
  checkId: string;
  size: number;
  sha256: string;
  redacted: boolean;
}

/** Every piece of evidence the executions kept: logs, then reports, in the run's order. */
export function evidenceRows(checks: readonly CheckRunDetail[]): EvidenceRow[] {
  const seen = new Set<string>();
  const rows: EvidenceRow[] = [];
  for (const c of checks)
    for (const e of [...(c.raw ? [c.raw.logs.stdout, c.raw.logs.stderr, ...c.raw.reports] : []), ...c.evidence]) {
      if (!e || seen.has(e.id)) continue;
      seen.add(e.id);
      rows.push({ id: e.id, path: evidenceName(e.relPath), checkId: c.checkId, size: e.size, sha256: e.sha256, redacted: e.redacted });
    }
  return rows;
}

/** An evidence file's name inside its execution's folder (the store's project, run and execution folders dropped). */
export function evidenceName(relPath: string): string {
  return relPath
    .split('/')
    .filter((p) => !/^(prj|run|chk)_/.test(p))
    .join('/');
}

/** «sha256:3f9a…c21e». */
export function shortHash(sha: string): string {
  return `sha256:${sha.slice(0, 4)}…${sha.slice(-4)}`;
}

/** «48 KB» (decimal units, Latin digits). */
export function sizeText(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export interface SideEffectRow {
  key: string;
  /** A file, or a folder with a trailing slash when several files under it changed alike. */
  path: string;
  change: 'created' | 'modified' | 'deleted';
  /** Files under a folder row. */
  files: number;
  checkId: string;
  /** A tracked source file changed outside the declared outputs (AT-34): highlighted. */
  tracked: boolean;
  /** Under a declared output (an ignored folder, an output reference). */
  declared: boolean;
}

/** The side effects of each execution, a folder collapsed into one row when more than one file under it changed. */
export function sideEffectRows(checks: readonly CheckRunDetail[]): SideEffectRow[] {
  const rows: SideEffectRow[] = [];
  for (const c of checks) {
    const s = c.raw?.sideEffects;
    if (!s) continue;
    const tracked = new Set(s.trackedModified);
    const declared = s.declared;
    const isDeclared = (p: string) => declared.some((d) => p === d || p.startsWith(d.endsWith('/') ? d : `${d}/`));
    for (const change of ['created', 'modified', 'deleted'] as const) {
      const by = new Map<string, string[]>();
      for (const p of s[change]) {
        const top = p.includes('/') ? `${p.split('/')[0]}/` : p;
        by.set(top, [...(by.get(top) ?? []), p]);
      }
      for (const [top, paths] of by) {
        const one = paths.length === 1;
        const path = one ? paths[0]! : top;
        rows.push({ key: `${c.checkRunId}:${change}:${path}`, path, change, files: paths.length, checkId: c.checkId, tracked: paths.some((p) => tracked.has(p)), declared: paths.every(isDeclared) });
      }
    }
  }
  return rows;
}

// ── the re-run sheet ──────────────────────────────────────────────────────────────────────────────────────

const RERUN_OF: Partial<Record<CheckOutcome, RerunStatus>> = {
  failed: 'failed',
  flaky: 'flaky',
  unavailable: 'unavailable',
  timed_out: 'timed-out',
  missing: 'missing',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
  skipped: 'skipped',
};

/** Checks per re-run status in the run (the sheet's counts). */
export function rerunCounts(checks: readonly { outcome: CheckOutcome | null }[]): Partial<Record<RerunStatus, number>> {
  const out: Partial<Record<RerunStatus, number>> = {};
  for (const c of checks) {
    const s = c.outcome ? RERUN_OF[c.outcome] : undefined;
    if (s) out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** The sheet's statuses as the protocol's outcomes. */
export function outcomesOf(statuses: readonly RerunStatus[]): CheckOutcome[] {
  return statuses.map((s) => s.replaceAll('-', '_') as CheckOutcome);
}
