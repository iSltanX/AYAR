// Types and pure helpers of the results components (C-06, C-07, C-09, C-17, C-24 bar, C-27, C-28, C-29 of the
// Figma Components page). Nothing here touches the engine; the components stay presentational.
import type { MessageKey } from '@ayar/i18n';
import type { Attachment } from 'svelte/attachments';
import type { BadgeResult, Cycle, Result } from './status.ts';
import { CYCLES } from './status.ts';
import type { CrossRun, Proof, Severity } from './tags.ts';

/** Left-to-Right Isolate … Pop Directional Isolate: keeps an id or a date in its own order inside a sentence. */
const LRI = '⁦';
const PDI = '⁩';

/** Wraps a left-to-right value (an id, a date, a version) for an ICU placeholder inside a translated sentence. */
export function isolate(value: string): string {
  return `${LRI}${value}${PDI}`;
}

/* ---------------------------------------------------------------- C-06 Check row (104:4196) */

/** What a check row shows as its status: a run-cycle state or a final result (any badge result). */
export type CheckRowStatus = Cycle | BadgeResult;

export function isCycle(status: CheckRowStatus): status is Cycle {
  return (CYCLES as readonly string[]).includes(status);
}

/** A line of the log tail in an expanded running row. `muted` lines are text/secondary (runner chatter). */
export interface LogTailLine {
  readonly text: string;
  readonly muted?: boolean;
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

/** The columns of Table Kind=findings (112:8213), from the start side after the select column. */
export const FINDING_COLUMNS = [
  { id: 'severity', key: 'glossary.severity', width: 64 },
  { id: 'proof', key: 'results.table.column.proof', width: 112 },
  { id: 'title', key: 'results.table.column.title', width: 'grow' },
  { id: 'location', key: 'results.table.column.location', width: 196 },
  { id: 'check', key: 'results.table.column.check', width: 80 },
  { id: 'crossRun', key: 'results.table.column.crossRun', width: 64 },
] as const satisfies readonly { id: string; key: MessageKey; width: number | 'grow' }[];
export type FindingColumn = (typeof FINDING_COLUMNS)[number]['id'];

/** The grid columns shared by the header row and every finding row: the select column (28), then the above. */
export const FINDING_GRID = ['28px', ...FINDING_COLUMNS.map((c) => (c.width === 'grow' ? 'minmax(0, 1fr)' : `${c.width}px`))].join(' ');

/** Sets --finding-columns from script (no inline style, CSP 15.2), so the header and the rows share one grid. */
export const findingGrid: Attachment<HTMLElement> = (el) => {
  el.style.setProperty('--finding-columns', FINDING_GRID);
};

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
