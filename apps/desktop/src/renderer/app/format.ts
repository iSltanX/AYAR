// From the protocol's data to what the components draw (C-24): outcome and readiness ids, check and section
// names, reasons as sentences, dates and durations. Pure functions; no markup, no engine call.
import { formatDate, LOCALES, MESSAGES, type Lang, type MessageKey, type Translate } from '@ayar/i18n';
import type { CheckOutcome, PurityVerdict, Readiness as WireReadiness, Reason, RunPlan, RunView } from '@ayar/protocol';
import type { BadgeResult, Readiness, Result, Verdict } from '../lib/status.ts';
import type { Cost } from '../lib/tags.ts';
import { NAV_SECTIONS } from '../lib/shell.ts';

/** True when the message exists in the table (catalog texts are not complete for every check, e.g. custom ones). */
export function hasMessage(lang: Lang, key: string): key is MessageKey {
  return Object.hasOwn(MESSAGES[lang], key);
}

/** The message of a key built from data (a catalog text), or the fallback when the table has none. */
export function textOr(t: Translate, lang: Lang, key: string, fallback = '', values?: Record<string, string | number>): string {
  return hasMessage(lang, key) ? t(key, values) : fallback;
}

/** 7.2-ج: the protocol's snake_case outcome as the UI's status id. */
export function resultOf(outcome: CheckOutcome): Result {
  return outcome.replaceAll('_', '-') as Result;
}

/** A result badge: a reviewed pass or fail carries «بمراجعة» (G-17); a missing configuration has its own words. */
export function badgeOf(outcome: CheckOutcome, o: { reviewed?: boolean; reason?: Reason | null } = {}): BadgeResult {
  if (o.reviewed && outcome === 'passed') return 'passed-reviewed';
  if (o.reviewed && outcome === 'failed') return 'failed-reviewed';
  if (outcome === 'missing' && o.reason && /missingConfiguration|referenceMissing|configurationMissing/i.test(o.reason.key)) return 'missing-configuration';
  return resultOf(outcome);
}

/** 7.2-أ: readiness as the badge shows it. «غير موثوق» (FR-55) is not ready: it needs the trust changed. */
export function readinessOf(r: WireReadiness): Readiness {
  if (r === 'untrusted') return 'needs-approval';
  return r.replaceAll('_', '-') as Readiness;
}

export function verdictOf(v: PurityVerdict): Verdict {
  return v;
}

/**
 * The names users gave their custom checks (screen 9.2 «الاسم», protocol 1.7), from the profile of the project shown:
 * every page that reads the profile hands them over, and the next project's replace them.
 */
const customTitles = new Map<string, string>();
export function rememberCustomTitles(custom: Readonly<Record<string, { title?: string | undefined }>>): void {
  customTitles.clear();
  for (const [name, c] of Object.entries(custom)) if (c.title) customTitles.set(`custom.${name}`, c.title);
}

/** The check's title in the UI language (catalog), its custom name, or its id. */
export function checkTitle(t: Translate, lang: Lang, checkId: string): string {
  const key = `catalog.check.${checkId}.title`;
  if (hasMessage(lang, key)) return t(key);
  if (checkId.startsWith('custom.')) return customTitles.get(checkId) ?? checkId.slice('custom.'.length);
  return checkId;
}

/** «9 أكتوبر»: the day and the month (C-24). */
export function dayMonth(iso: string | Date, lang: Lang): string {
  return formatDate(new Date(iso), lang, { day: 'numeric', month: 'long' });
}

/** What the inspector says a check measures and cannot prove: the catalog's texts, or a custom check's general ones. */
export function checkTexts(t: Translate, lang: Lang, checkId: string): { definition: string; limits: string } {
  const key = (k: string) => `catalog.check.${checkId}.${k}`;
  if (checkId.startsWith('custom.') && !hasMessage(lang, key('why'))) return { definition: t('app.customCheck.definition'), limits: t('app.customCheck.limits') };
  return { definition: textOr(t, lang, key('why')), limits: textOr(t, lang, key('limits')) };
}

/** The section of a check id (`sec.deps` → security), by the catalog's prefixes (10.3). */
export function sectionOfCheck(checkId: string): (typeof NAV_SECTIONS)[number] | 'model' {
  const prefix = checkId.split('.')[0];
  switch (prefix) {
    case 'design':
      return 'design';
    case 'sec':
      return 'security';
    case 'code':
      return 'code';
    case 'beh':
      return 'behavior';
    case 'perf':
      return 'performance';
    case 'custom':
      return 'custom';
    case 'integ':
      return 'integrity';
    case 'ai':
      return 'model';
    default:
      return 'custom';
  }
}

/** A section id as the protocol writes it (`security`, `behavior`…), in the sidebar's order (D-DES4-15). */
export const SECTION_ORDER = NAV_SECTIONS;

export function sectionTitle(t: Translate, section: string): string {
  const key = `ui.section.${section}` as MessageKey;
  return (SECTION_ORDER as readonly string[]).includes(section) ? t(key) : section;
}

/** Items grouped by section, the sections in the sidebar's order (each group keeps the items' order). */
export function bySection<T>(items: readonly T[], sectionOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const s = sectionOf(item);
    groups.set(s, [...(groups.get(s) ?? []), item]);
  }
  return [...groups.entries()].sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]));
}

/** An ISO time from epoch milliseconds. */
export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/** Sorts by the sidebar's section order; unknown sections last. */
export function sectionRank(section: string): number {
  const i = (SECTION_ORDER as readonly string[]).indexOf(section);
  return i < 0 ? SECTION_ORDER.length : i;
}

/** A reason (message key and parameters) as a sentence; a parameter that is itself a key is translated first. */
export function reasonText(t: Translate, lang: Lang, reason: Reason | null | undefined): string {
  if (!reason) return '';
  if (!hasMessage(lang, reason.key)) return reason.key;
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(reason.params ?? {})) values[k] = typeof v === 'string' && hasMessage(lang, v) ? t(v) : v;
  try {
    return t(reason.key, values);
  } catch {
    return reason.key;
  }
}

/** «9 أكتوبر 2026»: Gregorian, Latin digits (C-24, D-15). */
export function day(iso: string | Date, lang: Lang): string {
  return formatDate(new Date(iso), lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «9 أكتوبر · 14:32». */
export function dayTime(iso: string | Date, lang: Lang): string {
  const d = new Date(iso);
  return `${formatDate(d, lang, { day: 'numeric', month: 'long' })} · ${formatDate(d, lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
}

/** «14:32». */
export function time(iso: string | Date, lang: Lang): string {
  return formatDate(new Date(iso), lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** «قبل 4 دقائق» / "4 minutes ago" (Latin digits, C-24). */
export function ago(iso: string, lang: Lang, now = Date.now()): string {
  const s = Math.round((Date.parse(iso) - now) / 1000);
  const f = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return f.format(Math.round(s), 'second');
  if (a < 3600) return f.format(Math.round(s / 60), 'minute');
  if (a < 86400) return f.format(Math.round(s / 3600), 'hour');
  return f.format(Math.round(s / 86400), 'day');
}

/** m:ss (or h:mm:ss) from milliseconds; never negative. */
export function clockMs(ms: number | null | undefined): string {
  const s = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Seconds since an ISO time, at `now`. */
export function secondsSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
}

/** 12.10: the cost tag of a check from its network need. */
export function costOf(network: 'none' | 'optional' | 'required' | undefined, cost?: 'local' | 'network' | 'model'): Cost {
  if (cost) return cost;
  return network === 'required' ? 'network' : 'local';
}

/** The order in which a summary lists outcomes (the status system's order, DES-2 S-01). */
export const OUTCOME_ORDER: readonly CheckOutcome[] = ['passed', 'failed', 'warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped', 'not_applicable'];

/** Non-zero outcome counts in display order. */
export function countsInOrder(byOutcome: Partial<Record<CheckOutcome, number>>): { result: Result; count: number }[] {
  return OUTCOME_ORDER.filter((o) => (byOutcome[o] ?? 0) > 0).map((o) => ({ result: resultOf(o), count: byOutcome[o]! }));
}

/** A path for display: the home folder written as «~» (the designs show ~/projects/rasd). */
export function displayPath(path: string, home: string | null): string {
  if (home && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`;
  return path;
}

/** The user's home from a project path under /Users/<name> (the renderer has no other way to know it). */
export function homeOf(path: string): string | null {
  const m = /^\/Users\/[^/]+/.exec(path);
  return m ? m[0] : null;
}

/** The run's kind as the run bar and the monitor name it («فحص كامل»، «قسم الأمن والصلاحيات»). */
export function runKind(t: Translate, run: RunView, plan: RunPlan | null | undefined): string {
  switch (run.kind) {
    case 'full':
      return t('app.runKind.full');
    case 'section': {
      const section = plan?.selection.kind === 'section' ? plan.selection.section : '';
      return t('app.runKind.section', { section: sectionTitle(t, section) });
    }
    case 'check':
      return t('app.runKind.check');
    case 'group':
      return t('app.runKind.group');
    case 'rerun_failed':
      return t('app.runKind.rerunFailed');
    case 'rerun_incomplete':
      return t('app.runKind.rerunIncomplete');
    case 'advisor':
      return t('app.runKind.advisor');
    case 'continue_round':
      return t('app.runKind.continueRound');
  }
}
