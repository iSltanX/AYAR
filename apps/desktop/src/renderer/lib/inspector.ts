// Types of the inspector (C-16, Figma 111:7922; plan 9.16) and the window frame (C-01, Figma 102:2570). The
// inspector shows what is selected in the content: a check (Details | Log), a finding, or a log line. Content is
// a discriminated union on `kind`; nothing here touches the engine.
import type { DirectAction, LogLine, LogSegment } from './evidence.ts';
import type { Location } from './results.ts';
import type { BadgeResult, Readiness } from './status.ts';
import type { Origin, Proof, Severity } from './tags.ts';

/** The window of log lines a log viewer shows (C-13). */
export interface InspectorLogLines {
  readonly lines: readonly LogLine[];
  /** Lines in the whole log (defaults to the lines passed). */
  readonly totalLines?: number;
  /** The log was cut at this size, in megabytes. */
  readonly truncatedAtMb?: number;
}

/** The two outcomes of a human review (the review sheet): accept → passed (reviewed), reject → failed (reviewed). */
export type ReviewDecision = 'accept' | 'reject';

/** A human review that decided the last result of a check («بمراجعة», plan 6.1). */
export interface InspectorReview {
  readonly decision: ReviewDecision;
  /** The scope the review covers, a path or glob (shown left to right, mono). */
  readonly scope: string;
  /** The review date, ISO (2026-10-09). */
  readonly date: string;
  /** The automatic result before the review. */
  readonly original: BadgeResult;
}

/** The command a check runs and what running it does (Command block C-12 flags). */
export interface InspectorCommand {
  readonly command: string;
  readonly runsCode?: boolean;
  readonly writes?: boolean;
  readonly writesPath?: string;
  readonly network?: boolean;
}

/** Content=check (and check-reviewed when `review` is set). */
export interface InspectorCheck {
  readonly kind: 'check';
  /** The check's name in the UI language. */
  readonly name: string;
  /** The check id (beh.unit). */
  readonly id: string;
  /** The last result (the header badge and «آخر نتيجة»). */
  readonly result: BadgeResult;
  /** The run of the last result (RUN-20261009-003). */
  readonly runId: string;
  readonly definition: string;
  readonly why: string;
  readonly limits: string;
  readonly command: InspectorCommand;
  readonly readiness: Readiness;
  readonly review?: InspectorReview;
  /** The Log tab's content. */
  readonly log?: InspectorLogLines;
}

/** The next step of a finding (Next step card C-25). In the inspector a needs-model step shows the copy hint. */
export interface InspectorNextStep {
  readonly kind: 'handle-directly' | 'needs-model' | 'needs-review' | 'nothing-required';
  readonly impact: string;
  readonly action?: DirectAction;
  readonly reason?: string;
}

/** What the «Copy for model» bar reports about the copy (counters). */
export interface InspectorCopy {
  readonly characters: number;
  readonly redactions: number;
  /** The kinds of the redacted values in the UI language («رمز GitHub»). */
  readonly redactedKinds?: string;
}

/** Content=finding and finding-needs-model (by `nextStep.kind`). */
export interface InspectorFinding {
  readonly kind: 'finding';
  readonly title: string;
  /** The finding id (AYR-SEC-SECRET-0003). */
  readonly id: string;
  readonly severity: Severity;
  readonly proof: Proof;
  readonly origin: Origin;
  readonly nextStep: InspectorNextStep;
  readonly copy: InspectorCopy;
  readonly location: Location;
  readonly expected: string;
  readonly actual: string;
  /** The evidence excerpt, left to right; a secret appears only as a redacted segment. */
  readonly excerpt?: readonly LogSegment[];
  /** The command that reproduces the finding. */
  readonly reproduce?: InspectorCommand;
  /** The rule and its source (gitleaks 8.28 · github-pat). */
  readonly rule: string;
  readonly limits: string;
  /** The run the finding was first seen in. */
  readonly firstSeen: string;
}

/** Content=log: a log or evidence line opened in the inspector. */
export interface InspectorLog extends InspectorLogLines {
  readonly kind: 'log';
  /** The selected line number. */
  readonly line: number;
  /** The check the log belongs to, in the UI language. */
  readonly check: string;
}

export type InspectorContent = InspectorCheck | InspectorFinding | InspectorLog;

/** The two tabs of a check (Tabs Kind=inspector). */
export type InspectorTab = 'details' | 'log';

