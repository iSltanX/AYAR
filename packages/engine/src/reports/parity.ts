// 12.1 and FR-63 (AT-43): the two formats are read back and compared with each other and with the object they came
// from — the set of finding identifiers, the counts by outcome, the scope (criteria and checks), the verdict word,
// and the limits named — so neither format says what the other denies. A mismatch is an internal error that keeps
// the report from being shown (12.6). The comparison is textual on purpose: it reads what a reader would read.
import { createTranslator, type MessageKey } from '@ayar/i18n';
import type { CheckOutcome, Lang, ParityResult, Report } from '@ayar/protocol';
import { hasForgedBoundary } from './boundaries.ts';
import { tryT } from './render.ts';

const ID = /\bAYR-[A-Z]{3}-[A-Z0-9]{2,8}-\d{4,}\b/g;
const OUTCOMES: readonly CheckOutcome[] = ['passed', 'failed', 'warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped', 'not_applicable'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ParityFacts {
  ids: string[];
  counts: Record<string, number>;
  verdict: string | null;
  scope: string | null;
  limits: string[];
}

/** What a text claims, read back from it. */
export function factsOf(text: string, lang: Lang, report: Report): ParityFacts {
  const t = createTranslator(lang);
  const ids = [...new Set([...text.matchAll(ID)].map((m) => m[0]))].sort();
  const counts: Record<string, number> = {};
  for (const o of OUTCOMES) {
    const label = t(`status.result.${o.replace(/_/g, '-')}` as MessageKey);
    const re = new RegExp(`^- ${escapeRe(label)}: (\\d+)$`, 'm');
    const m = re.exec(text);
    if (m) counts[o] = Number(m[1]);
  }
  const verdictLabel = t('report.label.verdict');
  const vm = new RegExp(`${escapeRe(verdictLabel)}: ([^·\\n]+)`).exec(text);
  const verdict = vm ? vm[1]!.trim() : null;
  const scopeLabel = t('report.label.scope');
  const sm = new RegExp(`${escapeRe(scopeLabel)}: ([^\\n]+?)(?: · |$)`, 'm').exec(text);
  const scope = sm ? sm[1]!.replace(/\s+/g, ' ').trim() : null;
  const limits = report.checks.filter((c) => c.outcome !== null && c.outcome !== 'not_applicable').map((c) => c.checkId).filter((id) => {
    const l = tryT(t, `catalog.check.${id.replace('*', 'any')}.limits`);
    return l ? text.includes(l) : false;
  });
  return { ids, counts, verdict, scope, limits: [...new Set(limits)].sort() };
}

export function checkParity(report: Report, human: string, model: string, lang: Lang): ParityResult {
  const t = createTranslator(lang);
  const h = factsOf(human, lang, report);
  const m = factsOf(model, lang, report);
  const mismatches: ParityResult['mismatches'] = [];
  const wantIds = [...new Set(report.findings.filter((f) => f.effect !== 'excluded').map((f) => f.displayId))].sort();
  // The human text may also name an excluded finding («المستبعد بمراجعة»): both must name every live one.
  const liveH = h.ids.filter((id) => wantIds.includes(id));
  const liveM = m.ids.filter((id) => wantIds.includes(id));
  if (liveH.join(',') !== wantIds.join(',')) mismatches.push({ field: 'ids', human: liveH.join(','), model: wantIds.join(',') });
  if (liveM.join(',') !== wantIds.join(',')) mismatches.push({ field: 'ids', human: wantIds.join(','), model: liveM.join(',') });
  const extraH = h.ids.filter((id) => !report.findings.some((f) => f.displayId === id) && !report.integrity.checks.some((c) => c.findingIds.includes(id)) && !report.checks.some((c) => c.findingIds.includes(id)));
  const extraM = m.ids.filter((id) => !report.findings.some((f) => f.displayId === id) && !report.integrity.checks.some((c) => c.findingIds.includes(id)) && !report.checks.some((c) => c.findingIds.includes(id)));
  if (extraH.length || extraM.length) mismatches.push({ field: 'ids.unknown', human: extraH.join(','), model: extraM.join(',') });
  const wantCounts: Record<string, number> = {};
  for (const o of OUTCOMES) if (report.head.counts[o]) wantCounts[o] = report.head.counts[o]!;
  if (JSON.stringify(h.counts) !== JSON.stringify(wantCounts)) mismatches.push({ field: 'counts', human: JSON.stringify(h.counts), model: JSON.stringify(wantCounts) });
  if (JSON.stringify(m.counts) !== JSON.stringify(wantCounts)) mismatches.push({ field: 'counts', human: JSON.stringify(wantCounts), model: JSON.stringify(m.counts) });
  const wantVerdict = report.head.verdict ? t(`status.verdict.${report.head.verdict}` as MessageKey) : t('report.verdict.none');
  if (h.verdict !== wantVerdict || m.verdict !== wantVerdict) mismatches.push({ field: 'verdict', human: h.verdict ?? '', model: m.verdict ?? '' });
  if (h.scope === null || m.scope === null || h.scope !== m.scope) mismatches.push({ field: 'scope', human: h.scope ?? '', model: m.scope ?? '' });
  const wantLimits = [...new Set(report.checks.filter((c) => c.outcome !== null && c.outcome !== 'not_applicable').map((c) => c.checkId))].sort();
  if (h.limits.join(',') !== wantLimits.join(',')) mismatches.push({ field: 'limits', human: h.limits.join(','), model: wantLimits.join(',') });
  if (m.limits.join(',') !== wantLimits.join(',')) mismatches.push({ field: 'limits', human: wantLimits.join(','), model: m.limits.join(',') });
  if (hasForgedBoundary(human, report.token) || hasForgedBoundary(model, report.token)) mismatches.push({ field: 'boundaries', human: String(hasForgedBoundary(human, report.token)), model: String(hasForgedBoundary(model, report.token)) });
  return { ok: mismatches.length === 0, mismatches, checked: { findingIds: wantIds.length, checks: report.checks.length, limits: wantLimits.length } };
}
