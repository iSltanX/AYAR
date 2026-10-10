// C-18: secret redaction at reception (D-21, FR-57). Four layers:
//   1. known values: the values of sensitive environment variables (names.ts), 8 characters or more, wherever
//      they appear, also JSON-escaped and URL-encoded;
//   2. high-confidence patterns (catalog data, G-32), including private-key blocks across lines;
//   3. the tool's own redaction (a flag the adapter passes, e.g. `--redact=100`, listed in the catalog);
//   4. the user's patterns (settings).
// A redacted span becomes ⟦redacted:<rule>⟧, and the count per rule is kept for the evidence metadata.
// Streams are redacted line by line with a carry buffer, so a secret split between two chunks is still caught;
// a line longer than 64 Ki characters is cut with ⟦split⟧, never through a match. A line that cannot be
// scanned is not written: ⟦redacted:unscannable⟧ stands in for it. The second pass (secondPass) re-scans text
// on its way out (fix prompt, export) and refuses it if a high-confidence pattern is still there.
import type { RedactionData } from '@ayar/catalog';

export const REDACTED = (rule: string): string => `⟦redacted:${rule}⟧`;
export const LINE_SPLIT_MARKER = '⟦split⟧';
export const MAX_LINE_CHARS = 64 * 1024;
/** How far past a cut point a line must be known before it is cut, so no secret is cut in two. */
export const SPLIT_LOOKAHEAD_CHARS = 16 * 1024;
const MARKER_START = '⟦redacted:';

export interface CompiledPattern {
  rule: string;
  regex: RegExp;
  group?: number;
  minEntropy?: number;
}

export interface CompiledBlock {
  rule: string;
  begin: RegExp;
  end: RegExp;
}

export interface KnownValue {
  /** The rule name in the marker: `env:<NAME>`. The value itself is never logged. */
  rule: string;
  value: string;
}

export interface UserPattern {
  id: string;
  pattern: string;
  flags?: string;
}

export interface RedactionRules {
  highConfidence: readonly CompiledPattern[];
  blocks: readonly CompiledBlock[];
  user: readonly CompiledPattern[];
  known: readonly KnownValue[];
  minValueLength: number;
}

export type RedactionCounts = Record<string, number>;

function flagsWith(flags: string, extra: string): string {
  return [...new Set((flags + extra).split(''))].join('');
}

export function compileRules(data: RedactionData, o: { user?: readonly UserPattern[]; known?: readonly KnownValue[] } = {}): RedactionRules {
  const highConfidence = data.highConfidence.map((p) => ({
    rule: p.id,
    regex: new RegExp(p.regex.pattern, flagsWith(p.regex.flags, 'g')),
    ...(p.group !== undefined ? { group: p.group } : {}),
    ...(p.minEntropy !== undefined ? { minEntropy: p.minEntropy } : {}),
  }));
  const blocks = data.multiline.map((m) => ({ rule: m.id, begin: new RegExp(m.begin.pattern, m.begin.flags), end: new RegExp(m.end.pattern, m.end.flags) }));
  // A user pattern that does not compile is left out, never a reason to stop redacting (review M6).
  const user = (o.user ?? []).flatMap((u) => {
    try {
      return [{ rule: `user:${u.id}`, regex: new RegExp(u.pattern, flagsWith(u.flags ?? '', 'g')) }];
    } catch {
      return [];
    }
  });
  return { highConfidence, blocks, user, known: expandKnown(o.known ?? [], data.minValueLength), minValueLength: data.minValueLength };
}

/** A value as it may appear in output: itself, JSON-escaped, URL-encoded. Longest first, so a longer value wins. */
function expandKnown(known: readonly KnownValue[], minLength: number): KnownValue[] {
  const out = new Map<string, KnownValue>();
  for (const k of known) {
    if (k.value.length < minLength) continue;
    for (const form of [k.value, JSON.stringify(k.value).slice(1, -1), encodeURIComponent(k.value)]) {
      if (form.length >= minLength && !out.has(form)) out.set(form, { rule: k.rule, value: form });
    }
  }
  return [...out.values()].sort((a, b) => b.value.length - a.value.length);
}

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  if (!s.length) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  const n = [...s].length;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

function bump(counts: RedactionCounts, rule: string, n = 1): void {
  counts[rule] = (counts[rule] ?? 0) + n;
}

interface Span {
  start: number;
  end: number;
  rule: string;
}

/** The spans one pattern would redact in `text` (never inside an existing marker). */
function patternSpans(text: string, p: CompiledPattern): Span[] {
  const spans: Span[] = [];
  p.regex.lastIndex = 0;
  for (const m of text.matchAll(p.regex)) {
    if (m.index === undefined) continue;
    let start = m.index;
    let end = start + m[0].length;
    if (p.group !== undefined) {
      const g = m[p.group];
      if (g === undefined) continue;
      const offset = m[0].lastIndexOf(g);
      start = m.index + offset;
      end = start + g.length;
      if (p.minEntropy !== undefined && entropy(g) < p.minEntropy) continue;
    }
    if (end <= start) continue;
    const slice = text.slice(start, end);
    if (slice.includes(MARKER_START) || slice.includes('⟧')) continue;
    spans.push({ start, end, rule: p.rule });
  }
  return spans;
}

function knownSpans(text: string, known: readonly KnownValue[]): Span[] {
  const spans: Span[] = [];
  for (const k of known) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(k.value, from);
      if (i < 0) break;
      spans.push({ start: i, end: i + k.value.length, rule: k.rule });
      from = i + k.value.length;
    }
  }
  return spans;
}

/** Applies spans, merging overlaps (the earliest-starting, longest span names the merged marker). */
function applySpans(text: string, spans: Span[], counts: RedactionCounts): string {
  if (!spans.length) return text;
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = '';
  let pos = 0;
  let current: Span | null = null;
  const flush = () => {
    if (!current) return;
    out += text.slice(pos, current.start) + REDACTED(current.rule);
    bump(counts, current.rule);
    pos = current.end;
    current = null;
  };
  for (const s of spans) {
    if (current && s.start < current.end) {
      current.end = Math.max(current.end, s.end);
      continue;
    }
    flush();
    current = { ...s };
  }
  flush();
  return out + text.slice(pos);
}

export class Redactor {
  readonly rules: RedactionRules;

  constructor(rules: RedactionRules) {
    this.rules = rules;
  }

  /** All spans of layers 1, 2 and 4 in a piece of text (one line, or a whole document). */
  #spans(text: string): Span[] {
    const spans = knownSpans(text, this.rules.known);
    for (const p of this.rules.highConfidence) spans.push(...patternSpans(text, p));
    for (const p of this.rules.user) spans.push(...patternSpans(text, p));
    return spans;
  }

  /** Redacts single-line patterns and known values in `text`, recording counts. */
  redactSpans(text: string, counts: RedactionCounts): string {
    return applySpans(text, this.#spans(text), counts);
  }

  /** Redacts a whole text (reports, facts, exports): multi-line blocks first, then line patterns. */
  redactText(text: string): { text: string; counts: RedactionCounts } {
    const stream = this.lineStream();
    const lines = [...stream.push(text), ...stream.end()];
    return { text: lines.join(''), counts: stream.counts };
  }

  /** Redacts every string inside a JSON value (discovery facts, profile content). */
  redactJson<T>(value: T, counts: RedactionCounts = {}): T {
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') return this.#count(this.redactText(v), counts);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    return walk(value) as T;
  }

  #count(r: { text: string; counts: RedactionCounts }, counts: RedactionCounts): string {
    for (const [rule, n] of Object.entries(r.counts)) bump(counts, rule, n);
    return r.text;
  }

  /** A line-by-line stream with a carry buffer (C-18 «التدفق»). Output keeps the line endings. */
  lineStream(): LineRedactor {
    return new LineRedactor(this);
  }

  /**
   * The second pass at output (C-18): re-scan the whole text. Anything a high-confidence pattern, a block or a
   * known value still matches means a secret survived redaction: the output must be stopped.
   */
  secondPass(text: string): { ok: true } | { ok: false; rules: string[] } {
    const rules = new Set<string>();
    for (const s of knownSpans(text, this.rules.known)) rules.add(s.rule);
    for (const p of this.rules.highConfidence) for (const s of patternSpans(text, p)) rules.add(s.rule);
    for (const b of this.rules.blocks) if (b.begin.test(text)) rules.add(b.rule);
    return rules.size ? { ok: false, rules: [...rules].sort() } : { ok: true };
  }
}

export class LineRedactor {
  readonly #r: Redactor;
  #buffer = '';
  #inBlock: CompiledBlock | null = null;
  readonly counts: RedactionCounts = {};

  constructor(r: Redactor) {
    this.#r = r;
  }

  /** Feeds a chunk; returns the complete, redacted lines (each with its `\n`), and long-line segments. */
  push(chunk: string): string[] {
    this.#buffer += chunk;
    return this.#drain(false);
  }

  /** Flushes the last line (no trailing newline). A block still open at the end stays dropped, and is counted. */
  end(): string[] {
    const out = this.#drain(true);
    const rest = this.#buffer;
    this.#buffer = '';
    if (rest.length) out.push(...this.#line(rest));
    if (this.#inBlock) bump(this.counts, `${this.#inBlock.rule}:unterminated`);
    return out;
  }

  /**
   * Emits every complete line, and cuts a line longer than MAX_LINE_CHARS once enough of it is known: its end
   * (a newline, or the end of the stream), or SPLIT_LOOKAHEAD_CHARS past the cut point.
   */
  #drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const nl = this.#buffer.indexOf('\n');
      const lineLength = nl >= 0 ? nl : this.#buffer.length;
      const known = nl >= 0 || final || this.#buffer.length > MAX_LINE_CHARS + SPLIT_LOOKAHEAD_CHARS;
      if (lineLength > MAX_LINE_CHARS && known) {
        const cut = this.#safeCut(this.#buffer.slice(0, lineLength));
        const segment = this.#buffer.slice(0, cut);
        this.#buffer = this.#buffer.slice(cut);
        out.push(...this.#line(segment).map((x) => x + LINE_SPLIT_MARKER + '\n'));
        continue;
      }
      if (nl >= 0) {
        const line = this.#buffer.slice(0, nl + 1);
        this.#buffer = this.#buffer.slice(nl + 1);
        out.push(...this.#line(line));
        continue;
      }
      return out;
    }
  }

  /** The cut point for an over-long line: at MAX_LINE_CHARS, moved so that no match is cut in two. */
  #safeCut(text: string): number {
    let cut = MAX_LINE_CHARS;
    const window = text.slice(0, MAX_LINE_CHARS + SPLIT_LOOKAHEAD_CHARS);
    const spans: Span[] = knownSpans(window, this.#r.rules.known);
    for (const p of [...this.#r.rules.highConfidence, ...this.#r.rules.user]) spans.push(...patternSpans(window, p));
    for (const s of spans) if (s.start < cut && s.end > cut) cut = s.start > 0 ? s.start : s.end;
    return Math.max(1, cut);
  }

  #line(line: string): string[] {
    try {
      return [this.#redactLine(line)];
    } catch {
      bump(this.counts, 'unscannable');
      return [REDACTED('unscannable') + (line.endsWith('\n') ? '\n' : '')];
    }
  }

  /** One line through the block state machine (private keys across lines), then the line patterns. */
  #redactLine(line: string): string {
    const eol = line.endsWith('\n') ? '\n' : '';
    let body = eol ? line.slice(0, -1) : line;
    let prefix = '';
    if (this.#inBlock) {
      const m = this.#inBlock.end.exec(body);
      if (!m) return ''; // still inside the block: the line is dropped (its marker was written at BEGIN)
      body = body.slice(m.index + m[0].length);
      this.#inBlock = null;
      if (!body.trim()) return '';
    } else {
      for (const b of this.#r.rules.blocks) {
        const begin = b.begin.exec(body);
        if (!begin) continue;
        const after = body.slice(begin.index + begin[0].length);
        const end = b.end.exec(after);
        bump(this.counts, b.rule);
        if (end) {
          body = body.slice(0, begin.index) + REDACTED(b.rule) + after.slice(end.index + end[0].length);
          break;
        }
        this.#inBlock = b;
        prefix = this.#r.redactSpans(body.slice(0, begin.index), this.counts) + REDACTED(b.rule);
        return prefix + eol;
      }
    }
    return this.#r.redactSpans(body, this.counts) + eol;
  }
}
