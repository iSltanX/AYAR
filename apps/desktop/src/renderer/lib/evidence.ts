// Types and pure helpers of the isolation and evidence components (C-11 to C-15, C-24, C-25 of the Figma
// Components page; plan C-24: direction isolation, D-DES3-04). Nothing here touches the DOM.
import { revealBidiControls } from '@ayar/i18n';

const STRONG_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** True when the text has a right-to-left letter (Arabic, Hebrew…). */
export function hasRtl(text: string): boolean {
  return STRONG_RTL.test(text);
}

/** One piece of a path: a segment between slashes, or a slash. */
export interface PathPiece {
  readonly text: string;
  /** A segment with a right-to-left letter: rendered in its own <bdi> (D-DES3-04). */
  readonly rtl: boolean;
}

/**
 * Splits a path for display: `head` is everything before the last segment (it gives way first, so the path is
 * truncated in the middle) and `tail` is the last slash, the file name and its line number, which always stay
 * visible.
 */
export function splitPath(path: string, line?: number): { head: PathPiece[]; tail: PathPiece[] } {
  const cut = Math.max(path.lastIndexOf('/'), 0); // the tail keeps its slash: "…/normalize.py:42"
  const name = path.slice(cut) + (line === undefined ? '' : `:${line}`);
  const pieces = (s: string): PathPiece[] =>
    s
      .split(/(\/)/)
      .filter((p) => p !== '')
      .map((p) => ({ text: p, rtl: hasRtl(p) }));
  return { head: pieces(path.slice(0, cut)), tail: pieces(name) };
}

/** A part of a log line: text (bidi controls are revealed when drawn) or a redacted secret. */
export type LogSegment =
  | { readonly kind: 'text'; readonly text: string }
  /** `what` is the kind of secret in the UI language, e.g. "GitHub token"; the value itself never reaches the UI. */
  | { readonly kind: 'redacted'; readonly what: string };

export interface LogLine {
  /** The line number in the original log (also the key of the line). */
  readonly number: number;
  readonly segments: readonly LogSegment[];
  /** Secondary text: commands and runner chatter, as opposed to results. */
  readonly muted?: boolean;
}

/** A drawn piece of a log segment: text (split around search matches) or a visible bidi control mark. */
export type LogPiece =
  | { readonly kind: 'text'; readonly parts: readonly { readonly text: string; readonly match: boolean }[] }
  | { readonly kind: 'control'; readonly codePoint: number; readonly name: string }
  | { readonly kind: 'redacted'; readonly what: string };

/** "U+202E" for a code point. */
export function codePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Splits text around the (case-insensitive) occurrences of a query. */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const out: { text: string; match: boolean }[] = [];
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  let at = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    if (i > at) out.push({ text: text.slice(at, i), match: false });
    out.push({ text: text.slice(i, i + needle.length), match: true });
    at = i + needle.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}

/** The pieces a log line is drawn with: bidi controls become visible marks (C-24), never obeyed. */
export function logPieces(segments: readonly LogSegment[], query: string): LogPiece[] {
  const out: LogPiece[] = [];
  for (const segment of segments) {
    if (segment.kind === 'redacted') {
      out.push(segment);
      continue;
    }
    for (const piece of revealBidiControls(segment.text)) {
      if (piece.kind === 'control') out.push(piece);
      else out.push({ kind: 'text', parts: splitMatches(piece.text, query) });
    }
  }
  return out;
}

/** The capture key of a screenshot (plan 9.14): every value as shown, in the UI language. */
export interface CaptureKey {
  readonly state: string;
  readonly size: string;
  readonly theme: string;
  readonly language: string;
  readonly platform: string;
  readonly browser: string;
  readonly pixelDensity: string;
}
export const CAPTURE_KEY_FIELDS = ['state', 'size', 'theme', 'language', 'platform', 'browser', 'pixelDensity'] as const;

/** An image of the evidence store (app-local URL), with its natural size in pixels. */
export interface EvidenceImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/** A changed region, in the pixels of the current image. */
export interface ChangedRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const DIFF_MODES = ['side-by-side', 'overlay', 'slider'] as const;
export type DiffMode = (typeof DIFF_MODES)[number];

/** The kinds of the next-step card (plan 9.25); "needs-model-inspector" is a needs-model finding in the inspector. */
export const NEXT_STEP_KINDS = ['handle-directly', 'needs-model', 'needs-model-inspector', 'needs-review', 'nothing-required'] as const;
export type NextStepKind = (typeof NEXT_STEP_KINDS)[number];

/** The one action of a finding the user handles directly. */
export const DIRECT_ACTIONS = ['setUp', 'approve', 'define', 'proveByRecheck'] as const;
export type DirectAction = (typeof DIRECT_ACTIONS)[number];
