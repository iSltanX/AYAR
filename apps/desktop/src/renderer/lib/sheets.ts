// The data of the in-app sheets (C-19, Figma frame 114:8568; prompt §9.19; D-DES3-03, D-DES3-06, D-DES3-08).
// Sheets are presentational: the caller passes typed content and receives the user's choice through callbacks.
// Fixed strings live in the `sheets` i18n scope (and ui/status/common where the text already exists).
import type { MessageKey } from '@ayar/i18n';
import type { Result } from './status.ts';
import type { SetupState } from './tags.ts';

/** How a sheet is shown: as a window-modal <dialog> (`open`), or as a static box (`inline`, the gallery). */
export interface SheetMode {
  /** Shows the sheet as a modal attached to the window (native <dialog>, showModal()). */
  open?: boolean;
  /** Renders the same box in place, not modal (the gallery). */
  inline?: boolean;
  /** Escape, or the cancel/close button. The caller closes the sheet by setting `open` to false. */
  oncancel?: () => void;
}

/** Sheet widths from D-DES3-03: 560 by default, 720 for scoring details, 448 for the cancel confirmation. */
export const SHEET_WIDTHS = { default: 560, wide: 720, narrow: 448 } as const;
export type SheetWidth = keyof typeof SHEET_WIDTHS;

// 1 · Setup preview (114:8794)
export interface SetupPreviewData {
  /** The action's name, e.g. «تثبيت التبعيات» (from the engine's preview, already localised). */
  action: string;
  command: string;
  runsCode: boolean;
  /** Where it writes in the project (Path pill), or undefined when it writes nothing. */
  writePath?: string;
  /** The network destination (mono), or undefined when it needs no network. */
  networkDestination?: string;
  /** Approximate download/install size in MB. */
  sizeMb: number;
}

// 2 · Approval diff (114:8898). Lines are neutral: removed on bg/sunken with «−», added on border/subtle with «+».
export type DiffLineKind = 'context' | 'removed' | 'added';
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}
export interface CommandChange {
  /** The check id, e.g. beh.unit. */
  id: string;
  /** The check's name, e.g. «اختبارات الوحدة». */
  name: string;
  lines: readonly DiffLine[];
}
export const DIFF_SIGNS: Record<DiffLineKind, string> = { context: ' ', removed: '−', added: '+' };

// 3 · Export report (114:9070). Variant evidence-bundle = format 'evidence-bundle'.
export const EXPORT_FORMATS = {
  markdown: 'sheets.export.format.markdown',
  html: 'sheets.export.format.html',
  json: 'sheets.export.format.json',
  'evidence-bundle': 'sheets.export.format.evidenceBundle',
} as const satisfies Record<string, MessageKey>;
export type ExportFormat = keyof typeof EXPORT_FORMATS;
export const EXPORT_LANGUAGES = { ar: 'sheets.export.language.ar', en: 'sheets.export.language.en' } as const satisfies Record<string, MessageKey>;
export type ExportLanguage = keyof typeof EXPORT_LANGUAGES;
/** «لك» و«للنموذج» معًا by default, or one of them. */
export const EXPORT_CONTENTS = {
  both: 'sheets.export.content.both',
  you: 'ui.tab.forYou',
  model: 'ui.tab.forModel',
} as const satisfies Record<string, MessageKey>;
export type ExportContent = keyof typeof EXPORT_CONTENTS;
export interface ExportChoice {
  format: ExportFormat;
  language: ExportLanguage;
  content: ExportContent;
  /** Only meaningful for the evidence bundle. */
  includeScreenshots: boolean;
}

// 4 · Re-run (114:9290): the statuses each variant offers and which are checked by default (prompt §9.19).
export type RerunVariant = 'failed' | 'incomplete';
export const RERUN_PRESETS = {
  failed: [
    ['failed', true],
    ['flaky', false],
    ['unavailable', false],
    ['timed-out', false],
  ],
  incomplete: [
    ['missing', true],
    ['unavailable', true],
    ['timed-out', true],
    ['cancelled', true],
    ['interrupted', true],
    ['skipped', true],
  ],
} as const satisfies Record<RerunVariant, readonly (readonly [Result, boolean])[]>;
export type RerunStatus = (typeof RERUN_PRESETS)[RerunVariant][number][0];

/** The default selection of a variant: its preset, minus the statuses with no checks (those are disabled). */
export function rerunDefaults(variant: RerunVariant, counts: Partial<Record<RerunStatus, number>>): RerunStatus[] {
  return RERUN_PRESETS[variant].filter(([s, on]) => on && (counts[s] ?? 0) > 0).map(([s]) => s);
}

/** How many checks the re-run runs: the selected statuses' checks plus the checks it needs first. */
export function rerunTotal(selected: readonly RerunStatus[], counts: Partial<Record<RerunStatus, number>>, dependencies: number): number {
  return selected.reduce((n, s) => n + (counts[s] ?? 0), 0) + dependencies;
}

// 5 · Save group (115:8941) and the checks it lists.
export interface CheckRef {
  id: string;
  name: string;
}

// 6 · Permission explanation (115:8989): the protected location that triggers the macOS (TCC) prompt.
export const PROTECTED_LOCATIONS = {
  documents: 'sheets.permission.location.documents',
  desktop: 'sheets.permission.location.desktop',
  downloads: 'sheets.permission.location.downloads',
  // DEV-11: every location the engine names (E-05: a USB volume asks too).
  icloud: 'sheets.permission.location.icloud',
  removable: 'sheets.permission.location.removable',
  network: 'sheets.permission.location.network',
} as const satisfies Record<string, MessageKey>;
export type ProtectedLocation = keyof typeof PROTECTED_LOCATIONS;

// 7 · Setup panel (115:9207)
export interface SetupAction {
  id: string;
  /** The action's title, e.g. «ثبّت التبعيات». */
  title: string;
  /** What is missing, e.g. node_modules. */
  missing: string;
  /** How many checks wait on it. */
  waiting: number;
  state: SetupState;
  /** Shows the «يكتب في المشروع» flag. */
  writesToProject: boolean;
  /** Shows «نفّذ…» (not for a completed action). */
  canApply: boolean;
}

// 8 · Scoring details (115:9403)
export interface ScoredCheck {
  id: string;
  result: Result;
}
export interface ScoredCriterion {
  name: string;
  checks: readonly ScoredCheck[];
  /** Checks that count as passed, out of `total`, and their ratio. */
  passed: number;
  total: number;
}
export interface ScoringSummary {
  criteria: number;
  requiredChecks: number;
  average: number;
  karatRaw: number;
  karat: number;
  blockingFailures: number;
  pendingReviews: number;
  excludedByReview: number;
  openIntegrityItems: number;
  notApplicable: number;
  appVersion: string;
  catalogVersion: string;
}

// 9 · Baseline approval (116:9091): the full capture key, values already localised by the caller.
export interface CaptureKey {
  state: string;
  size: string;
  theme: string;
  language: string;
  platform: string;
  browser: string;
  pixelDensity: string;
}
/** The two lines of the capture key, in reading order (Figma: state, size, theme, language | platform, browser, density). */
export const CAPTURE_KEY_ROWS = [
  [
    ['state', 'results.captureKey.state'],
    ['size', 'results.captureKey.size'],
    ['theme', 'results.captureKey.theme'],
    ['language', 'results.captureKey.language'],
  ],
  [
    ['platform', 'results.captureKey.platform'],
    ['browser', 'results.captureKey.browser'],
    ['pixelDensity', 'results.captureKey.pixelDensity'],
  ],
] as const satisfies readonly (readonly (readonly [keyof CaptureKey, MessageKey])[])[];

// 10 · Human review (116:9241, D-DES3-08): the decisions of each variant.
export type ReviewVariant = 'check' | 'model-claim';
export const REVIEW_DECISIONS = {
  check: [
    ['accept', 'sheets.review.accept'],
    ['reject', 'sheets.review.reject'],
    ['false-alarm', 'sheets.review.falseAlarm'],
  ],
  'model-claim': [
    ['convert-to-card', 'ui.action.convertToCard'],
    ['not-an-issue', 'ui.action.notAnIssue'],
  ],
} as const satisfies Record<ReviewVariant, readonly (readonly [string, MessageKey])[]>;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[ReviewVariant][number][0];
export interface ModelClaim {
  id: string;
  text: string;
}
export interface ReviewRecord {
  decision: ReviewDecision;
  note: string;
}

// Resetting a sheet's working state (Sheet.svelte contract): each time `open` goes from false to true (including
// mounting open), and whenever the data the state was derived from changes while mounted. Plain functions, so the
// sheets call them from a $effect.pre.

/** A stable key for the data a sheet's state is derived from. */
export function sheetResetKey(...parts: unknown[]): string {
  return JSON.stringify(parts);
}

/** Returns a decider: true when the sheet should reset now (it is opening, or its data key changed). */
export function sheetResetter(): (open: boolean | undefined, key: string) => boolean {
  let wasOpen = false;
  let lastKey: string | undefined;
  return (open, key) => {
    const opening = open === true && !wasOpen;
    const changed = lastKey !== undefined && key !== lastKey;
    wasOpen = open === true;
    lastKey = key;
    return opening || changed;
  };
}

/** A decision that is valid for the variant: the given one, or the variant's first. */
export function validDecision(variant: ReviewVariant, decision: ReviewDecision | undefined): ReviewDecision {
  const options: readonly (readonly [ReviewDecision, MessageKey])[] = REVIEW_DECISIONS[variant];
  return options.find(([d]) => d === decision)?.[0] ?? options[0]![0];
}
