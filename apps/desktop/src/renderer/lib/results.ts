// Types and pure helpers of the results components (C-06, C-07, C-09, C-17, C-24 bar, C-27, C-28, C-29 of the
// Figma Components page). Nothing here touches the engine; the components stay presentational.
import type { MessageKey } from '@ayar/i18n';
import { hasRtl } from './evidence.ts';
import type { BadgeResult, Cycle, Result } from './status.ts';
import { CYCLES } from './status.ts';
import type { CrossRun, Proof, Severity } from './tags.ts';

/* ---------------------------------------------------------------- C-06 Check row (104:4196) */

/** What a check row shows as its status: a run-cycle state or a final result (any badge result). */
export type CheckRowStatus = Cycle | BadgeResult;

export function isCycle(status: CheckRowStatus): status is Cycle {
  return (CYCLES as readonly string[]).includes(status);
}

/** Final results that mean the check never ran its command: no duration and no log («السجل») on the row. */
export const NOT_RUN_RESULTS = ['skipped', 'not-applicable', 'missing', 'missing-configuration', 'unavailable'] as const satisfies readonly BadgeResult[];

/**
 * Whether a check row's check ran (and so has a duration and a log): running or cancelling, or a final result
 * other than the not-run ones. A check cancelled before it started passes `ran: false` to the row explicitly.
 */
export function checkRan(status: CheckRowStatus): boolean {
  if (isCycle(status)) return status !== 'queued';
  return !(NOT_RUN_RESULTS as readonly string[]).includes(status);
}

/* ---------------------------------------------------------------- C-07 Finding row, C-17 Table */

/** A location in the project: a path and an optional line. */
export interface Location {
  readonly path: string;
  readonly line?: number;
}

export interface Finding {
  /** A stable id, the key of the row. */
  readonly id: string;
  readonly severity: Severity;
  readonly proof: Proof;
  readonly title: string;
  readonly location: Location;
  /** The id of the check the finding came from. */
  readonly check: string;
  readonly crossRun: CrossRun;
  /** Found while the check is still running: «مبدئي». */
  readonly provisional?: boolean;
}

/**
 * The columns of Table Kind=findings (112:8213), from the start side after the select column. Their widths
 * (28 · 64 · 112 · title · 196 · 84 · 100; 76 last in Arabic) are ONE CSS definition, --finding-columns on .findings-grid in
 * FindingRow.svelte, shared by the header row and every finding row.
 */
export const FINDING_COLUMNS = [
  { id: 'severity', key: 'glossary.severity' },
  { id: 'proof', key: 'results.table.column.proof' },
  { id: 'title', key: 'results.table.column.title' },
  { id: 'location', key: 'results.table.column.location' },
  { id: 'check', key: 'results.table.column.check' },
  { id: 'crossRun', key: 'results.table.column.crossRun' },
] as const satisfies readonly { id: string; key: MessageKey }[];
export type FindingColumn = (typeof FINDING_COLUMNS)[number]['id'];

/** A run of a title: `ltr` runs are Latin words inside a right-to-left title. */
export interface TextRun {
  readonly text: string;
  readonly ltr: boolean;
}

/**
 * Splits a right-to-left title around its Latin runs ("GitHub", "vitest run"), so each run can be drawn as one
 * isolated unit: an end-truncated line then hides a run whole instead of cutting its first letters off (in an
 * Arabic line the visual end of a Latin run is its start). A title with no right-to-left letter is one run.
 */
export function textRuns(text: string): TextRun[] {
  if (!hasRtl(text)) return [{ text, ltr: false }];
  const out: TextRun[] = [];
  const latin = /[A-Za-z][\w.\-/:()]*(?:\s+[A-Za-z][\w.\-/:()]*)*/g;
  let at = 0;
  for (const m of text.matchAll(latin)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), ltr: false });
    out.push({ text: m[0], ltr: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), ltr: false });
  return out;
}

export type SortDirection = 'asc' | 'desc';
export interface TableSort<C extends string = string> {
  readonly column: C;
  readonly direction: SortDirection;
}

/** A collapsible group of findings (Table group row 112:7977). */
export interface FindingGroup {
  readonly id: string;
  readonly title: string;
  readonly findings: readonly Finding[];
  /** The count shown beside the title; defaults to the findings passed. */
  readonly count?: number;
}

/* ---------------------------------------------------------------- C-09 Section card (106:3951) */

export const SECTION_CARD_VARIANTS = ['default', 'integrity', 'model-checks'] as const;
export type SectionCardVariant = (typeof SECTION_CARD_VARIANTS)[number];

/** The result counts a section card shows, in Figma's order; zero counts are left out. */
export const SECTION_COUNT_ORDER = ['passed', 'failed', 'warning', 'needs-review', 'missing', 'flaky', 'unavailable', 'timed-out', 'cancelled', 'interrupted', 'skipped', 'not-applicable'] as const satisfies readonly Result[];
export type SectionCounts = Partial<Record<Result, number>>;

export interface ReadinessGaps {
  readonly setup: number;
  readonly approval: number;
}

export interface ModelCheckMetrics {
  readonly needs: number;
  readonly generated: number;
  readonly reports: number;
  readonly unresolved: number;
}

/* ---------------------------------------------------------------- C-24 Copy for model bar (110:6710) */

export const COPY_CONTEXTS = ['results', 'inspector', 'card-preview', 'instructions-preview'] as const;
export type CopyContext = (typeof COPY_CONTEXTS)[number];

/** The copy scope in the results (plan 9.24): the selection, all findings, or the whole run. */
export const COPY_SCOPES = ['selected', 'all-findings', 'whole-run'] as const;
export type CopyScope = (typeof COPY_SCOPES)[number];

/** «لك | للنموذج»: what the content shows. «لك» is the default; the copy is always the model format. */
export type ReportView = 'for-you' | 'for-model';

/* ---------------------------------------------------------------- C-29 Model claim row (117:10396) */

/** A decision recorded on a model claim (the review sheet's two outcomes). */
export type ClaimDecision = { readonly kind: 'card'; readonly card: string } | { readonly kind: 'not-issue'; readonly date: string };

export const CLAIM_VARIANTS = ['with-local-check', 'no-local-check', 'decided-card', 'decided-not-issue'] as const;
export type ClaimVariant = (typeof CLAIM_VARIANTS)[number];

export function claimVariant(localCheck: string | undefined, decision: ClaimDecision | undefined): ClaimVariant {
  if (decision) return decision.kind === 'card' ? 'decided-card' : 'decided-not-issue';
  return localCheck ? 'with-local-check' : 'no-local-check';
}
