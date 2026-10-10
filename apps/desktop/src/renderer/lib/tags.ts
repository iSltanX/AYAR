// The tag vocabularies of DES-2 (S-04 77:1541, S-05 77:2266, plan 6.4, 6.6, 6.7) and the severity and cost
// scales. Each tag is its i18n key, its Figma kind and its 12 px icon (D-DES2-04). Directional icons follow the
// language (D-DES2-02): an arrow or a redo/undo is chosen per direction, never mirrored.
import type { MessageKey } from '@ayar/i18n';
import type { LucideName } from '../design/icons.generated.ts';
import type { Cycle } from './status.ts';

/** The four kinds of the Figma Tag set (71:194). "neutral-icon" is a neutral tag that carries an icon. */
export const TAG_KINDS = ['neutral', 'neutral-icon', 'model-claim', 'provisional'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** An icon that depends on the reading direction: the Arabic (rtl) and the English (ltr) form. */
export interface DirectionalIcon {
  readonly rtl: LucideName;
  readonly ltr: LucideName;
}

export interface TagSpec {
  readonly key: MessageKey;
  readonly kind: TagKind;
  readonly icon?: LucideName | DirectionalIcon;
  /** A run-cycle symbol in place of the icon ("running" in a setup action, D-DES2-04). */
  readonly symbol?: Cycle;
}

/** The icon of a tag for a reading direction. */
export function tagIcon(spec: Pick<TagSpec, 'icon'>, dir: 'rtl' | 'ltr'): LucideName | undefined {
  const icon = spec.icon;
  if (icon === undefined || typeof icon === 'string') return icon;
  return icon[dir];
}

export const PROOF_TAGS = {
  proven: { key: 'glossary.proof.proven', kind: 'neutral' },
  suspected: { key: 'glossary.proof.suspected', kind: 'neutral' },
  suggestion: { key: 'glossary.proof.suggestion', kind: 'neutral' },
  'model-claim': { key: 'glossary.modelClaim', kind: 'model-claim', icon: 'message-square' },
} as const satisfies Record<string, TagSpec>;
export type Proof = keyof typeof PROOF_TAGS;

export const MARKER_TAGS = {
  provisional: { key: 'ui.marker.provisional', kind: 'provisional' },
  stale: { key: 'ui.marker.stale', kind: 'neutral' },
  partial: { key: 'ui.marker.partial', kind: 'neutral' },
} as const satisfies Record<string, TagSpec>;
export type Marker = keyof typeof MARKER_TAGS;

/** Origin tags are text only, "Origin: …" (D-DES2-04); the value is one of these keys inside status.tag.origin. */
export const ORIGINS = {
  project: 'ui.origin.project',
  tool: 'ui.origin.tool',
  environment: 'ui.origin.environment',
  model: 'ui.origin.model',
} as const satisfies Record<string, MessageKey>;
export type Origin = keyof typeof ORIGINS;

export const CROSS_RUN_TAGS = {
  new: { key: 'ui.crossRun.new', kind: 'neutral-icon', icon: 'arrow-up' },
  persisting: { key: 'ui.crossRun.persisting', kind: 'neutral-icon', icon: { rtl: 'arrow-left', ltr: 'arrow-right' } },
  resolved: { key: 'ui.crossRun.resolved', kind: 'neutral-icon', icon: 'arrow-down' },
  reappeared: { key: 'ui.crossRun.reappeared', kind: 'neutral-icon', icon: { rtl: 'redo-2', ltr: 'undo-2' } },
} as const satisfies Record<string, TagSpec>;
export type CrossRun = keyof typeof CROSS_RUN_TAGS;

/** The cost of a check (C-26, 103:2611): local is a laptop (D-DES3-11), network a globe, model sparkles. */
export const COST_TAGS = {
  local: { key: 'ui.cost.local', kind: 'neutral-icon', icon: 'laptop' },
  network: { key: 'ui.cost.needsNetwork', kind: 'neutral-icon', icon: 'globe' },
  model: { key: 'ui.cost.withYourModel', kind: 'neutral-icon', icon: 'sparkles' },
} as const satisfies Record<string, TagSpec>;
export type Cost = keyof typeof COST_TAGS;

/** Model-check states (6.6). Only "report received" is a model claim (purple). */
export const MODEL_CHECK_TAGS = {
  generated: { key: 'ui.aiCheck.generated', kind: 'neutral-icon', icon: 'file-text' },
  'awaiting-report': { key: 'ui.aiCheck.awaitingReport', kind: 'neutral-icon', icon: 'clock' },
  'report-received': { key: 'ui.aiCheck.reportReceived', kind: 'model-claim', icon: 'message-square' },
  rejected: { key: 'ui.aiCheck.rejected', kind: 'neutral-icon', icon: 'ban' },
} as const satisfies Record<string, TagSpec>;
export type ModelCheckState = keyof typeof MODEL_CHECK_TAGS;

/** Task-card cycle (6.7). "Verified" is not a pass. */
export const CARD_TAGS = {
  open: { key: 'status.card.open', kind: 'neutral-icon', icon: 'clipboard-list' },
  copied: { key: 'status.card.copied', kind: 'neutral-icon', icon: 'clipboard-copy' },
  'awaiting-verification': { key: 'status.card.awaitingVerification', kind: 'neutral-icon', icon: 'clock' },
  verified: { key: 'status.card.verified', kind: 'neutral-icon', icon: 'check-check' },
  'closed-by-decision': { key: 'status.card.closedByDecision', kind: 'neutral-icon', icon: 'archive' },
} as const satisfies Record<string, TagSpec>;
export type CardState = keyof typeof CARD_TAGS;

export const TEST_STRENGTH_TAGS = {
  unverified: { key: 'ui.testStrength.unverified', kind: 'neutral-icon', icon: 'shield-question' },
  verified: { key: 'ui.testStrength.verified', kind: 'neutral-icon', icon: 'shield-check' },
} as const satisfies Record<string, TagSpec>;
export type TestStrength = keyof typeof TEST_STRENGTH_TAGS;

/** A human review item and its validity (6.7). */
export const REVIEW_TAGS = {
  'not-reviewed': { key: 'status.review.notReviewed', kind: 'neutral-icon', icon: 'user-search' },
  accepted: { key: 'status.review.accepted', kind: 'neutral-icon', icon: 'user-check' },
  rejected: { key: 'ui.aiCheck.rejected', kind: 'neutral-icon', icon: 'user-x' },
  valid: { key: 'status.review.valid', kind: 'neutral-icon', icon: 'file-check' },
  expired: { key: 'status.review.expired', kind: 'neutral-icon', icon: 'file-diff' },
} as const satisfies Record<string, TagSpec>;
export type ReviewState = keyof typeof REVIEW_TAGS;

export const TOOL_TAGS = {
  installed: { key: 'status.tool.installed', kind: 'neutral-icon', icon: 'package-check' },
  'not-installed': { key: 'status.tool.notInstalled', kind: 'neutral-icon', icon: 'package-x' },
  'older-than-supported': { key: 'status.tool.olderThanSupported', kind: 'neutral-icon', icon: 'history' },
  'outside-tested-range': { key: 'status.tool.outsideTestedRange', kind: 'neutral-icon', icon: 'flask-conical-off' },
} as const satisfies Record<string, TagSpec>;
export type ToolState = keyof typeof TOOL_TAGS;

/** A setup action: "running" carries the blue cycle symbol inside the neutral tag (D-DES2-04). */
export const SETUP_TAGS = {
  queued: { key: 'status.cycle.queued', kind: 'neutral-icon', icon: 'clock' },
  running: { key: 'status.cycle.running', kind: 'neutral-icon', symbol: 'running' },
  completed: { key: 'status.setup.completed', kind: 'neutral-icon', icon: 'list-checks' },
  'stopped-with-error': { key: 'status.setup.stoppedWithError', kind: 'neutral-icon', icon: 'circle-alert' },
} as const satisfies Record<string, TagSpec>;
export type SetupState = keyof typeof SETUP_TAGS;

/** Severity (71:275): five ink bars filled from the inline start by level. Not a status (D-DES2-06). */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LEVEL: Record<Severity, 1 | 2 | 3 | 4 | 5> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
