// 12.5 rules 2 and 3 (T4, AT-23): what protects a report that quotes the project. Every quoted block sits between
// `<<<AYAR-DATA {token} …>>>` and `<<<END AYAR-DATA {token}>>>`, with a random six-digit hexadecimal token made for
// this report alone and written into mandatory rule 7, so the model knows which boundaries are AYAR's: a boundary
// with any other token is data. Content that imitates a boundary cannot close one early: every `<<<` that begins a
// marker-like sequence inside quoted text gets a word joiner (U+2060) after it, invisible and enough to break the
// marker. Bidi controls (U+202A–U+202E, U+2066–U+2069) are shown as `⟦U+202E⟧`, never obeyed (C-24, T3). Excerpts
// are cut at 40 lines or 4000 characters around the place that matters; the whole text at its limit, with the split
// suggested (by sections, then by findings).

import type { Random } from '../ports/index.ts';

export const BOUNDARY_OPEN = '<<<AYAR-DATA';
export const BOUNDARY_CLOSE = '<<<END AYAR-DATA';
const WORD_JOINER = '\u2060';
const MARKER_LIKE = /<<<(?=\s*(?:AYAR-DATA|END\s+AYAR-DATA)\b)/gi;
const BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
/** Other invisible format characters that could hide text from a reader: shown too. */
const INVISIBLE = /[\u200b\u200c\u200d\u200e\u200f\u2028\u2029\ufeff]/g;

export const EXCERPT_LINES = 40;
export const EXCERPT_CHARS = 4000;
export const PROMPT_CHARS = 24_000;
export const RUN_CHARS = 60_000;

/** The report's token: six hexadecimal digits from the engine's randomness (12.5 rule 3). */
export function newToken(random: Random): string {
  return Buffer.from(random.bytes(3)).toString('hex');
}

/** Bidi and other invisible format characters as visible marks (C-24: «⟦U+202E⟧»). */
export function revealControls(text: string): string {
  return text.replace(BIDI, (ch) => `⟦U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟧`).replace(INVISIBLE, (ch) => (ch === WORD_JOINER ? ch : `⟦U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟧`));
}

/** Project content as it may appear inline (a title, a path, a message): no boundary can be forged, no control hidden. */
export function inline(text: string): string {
  return revealControls(text.replace(MARKER_LIKE, `<<<${WORD_JOINER}`)).replace(/\r?\n/g, ' ⏎ ');
}

/** A quoted block: its text made safe, between the boundaries of this report (12.5 rule 3). */
export function fenced(token: string, text: string, o: { source: string; range: string }): string {
  const safe = revealControls(text.replace(MARKER_LIKE, `<<<${WORD_JOINER}`));
  return `${BOUNDARY_OPEN} ${token} · ${inline(o.source)} · ${inline(o.range)}>>>\n${safe}\n${BOUNDARY_CLOSE} ${token}>>>`;
}

/** How many AYAR boundaries (with this token) a text holds, open and close: a well-formed report has as many of each. */
export function countBoundaries(text: string, token: string): { open: number; close: number } {
  const open = text.split(`${BOUNDARY_OPEN} ${token}`).length - 1;
  const close = text.split(`${BOUNDARY_CLOSE} ${token}>>>`).length - 1;
  return { open, close };
}

/** Is a marker-like sequence left unbroken outside AYAR's own boundaries? (The parity and the tests ask.) */
export function hasForgedBoundary(text: string, token: string): boolean {
  const stripped = text.replaceAll(`${BOUNDARY_OPEN} ${token}`, '').replaceAll(`${BOUNDARY_CLOSE} ${token}>>>`, '');
  return /<<<\s*(?:AYAR-DATA|END\s+AYAR-DATA)\b/i.test(stripped);
}

export interface Excerpt {
  text: string;
  truncated: boolean;
  /** `L12–L51` for the lines kept. */
  range: string;
}

/**
 * 12.5 rule 2: an excerpt of at most `lines` lines and `chars` characters, chosen around `aroundLine` (1-based) when
 * given — the place of the problem — else from the start; a log is cut to the lines that hold an error and what is
 * around them when `errorLines` says which.
 */
export function excerpt(text: string, o: { lines?: number; chars?: number; aroundLine?: number | null; errorLines?: number[] } = {}): Excerpt {
  const maxLines = o.lines ?? EXCERPT_LINES;
  const maxChars = o.chars ?? EXCERPT_CHARS;
  const all = text.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  if (o.aroundLine && o.aroundLine > 0) start = Math.max(0, Math.min(all.length - maxLines, o.aroundLine - 1 - Math.floor(maxLines / 2)));
  else if (o.errorLines?.length) start = Math.max(0, Math.min(all.length - maxLines, Math.min(...o.errorLines) - 1 - Math.floor(maxLines / 4)));
  const lines = all.slice(start, start + maxLines);
  let truncated = lines.length < all.length;
  let out = lines.join('\n');
  if (out.length > maxChars) {
    // Keep the lines around the place that matters: cut from both ends when centred, else from the end.
    if (o.aroundLine && o.aroundLine > 0) {
      const centre = Math.min(out.length - 1, Math.max(0, lines.slice(0, Math.max(0, o.aroundLine - 1 - start)).join('\n').length));
      const half = Math.floor(maxChars / 2);
      const from = Math.max(0, Math.min(centre - half, out.length - maxChars));
      out = out.slice(from, from + maxChars);
    } else out = out.slice(0, maxChars);
    truncated = true;
  }
  return { text: out, truncated, range: `L${start + 1}–L${start + lines.length}` };
}

/** 12.5 rule 2: the lines of a log that look like errors (for the excerpt's centre). */
export function errorLines(text: string): number[] {
  const out: number[] = [];
  text.split('\n').forEach((l, i) => {
    if (/\b(error|fail(ed|ure)?|exception|traceback|assert|✗|×|FAIL)\b|خطأ|فشل|أخفق/i.test(l)) out.push(i + 1);
  });
  return out;
}

/** The whole text at its limit (12.5 rule 2), with what was cut said in a trailing line. */
export function capText(text: string, maxChars: number, tail: string): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const keep = Math.max(0, maxChars - tail.length - 2);
  const cut = text.slice(0, keep);
  const atLine = cut.lastIndexOf('\n');
  return { text: `${atLine > keep * 0.8 ? cut.slice(0, atLine) : cut}\n\n${tail}`, truncated: true };
}
