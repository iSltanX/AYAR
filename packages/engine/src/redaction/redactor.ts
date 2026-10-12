// C-18: secret redaction at reception (D-21, FR-57). Four layers:
//   1. known values: the values of sensitive environment variables (names.ts), 8 characters or more, wherever
//      they appear, also JSON-escaped and URL-encoded, and a value of several lines with either line ending;
//   2. high-confidence patterns (catalog data, G-32), including private-key blocks across lines;
//   3. the tool's own redaction (a flag the adapter passes, e.g. `--redact=100`, listed in the catalog);
//   4. the user's patterns (settings).
// A redacted span becomes ⟦redacted:<rule>⟧, and the count per rule is kept for the evidence metadata. A marker is
// text like any other (a tool may print one), so it shields nothing but a rule's name (AUD-01, Redactor.markers).
// Streams are redacted line by line with a carry buffer, so a secret split between two chunks is still caught; a
// known value of several lines is matched in the stream before it is cut into lines (AUD-02). A line longer than
// 64 Ki characters is cut with ⟦split⟧, never through a match. A line that cannot be
// scanned is not written: ⟦redacted:unscannable⟧ stands in for it. The second pass (secondPass) re-scans text
// on its way out (fix prompt, export) and refuses it if a high-confidence pattern is still there.
import { LINE_SPLIT_MARKER } from '@ayar/adapters';
import type { RedactionData } from '@ayar/catalog';

export const REDACTED = (rule: string): string => `⟦redacted:${rule}⟧`;
// The marker the readers undo before parsing a stored report (packages/adapters, read/guards.ts): one source for both.
export { LINE_SPLIT_MARKER };
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

/**
 * A value as it may appear in output: itself, JSON-escaped, URL-encoded, and a value of several lines with LF or CRLF
 * line endings (AUD-02). Longest first, so a longer value wins.
 */
function expandKnown(known: readonly KnownValue[], minLength: number): KnownValue[] {
  const out = new Map<string, KnownValue>();
  for (const k of known) {
    if (k.value.length < minLength) continue;
    const lines = /\r?\n/.test(k.value) ? [k.value.replace(/\r?\n/g, '\n'), k.value.replace(/\r?\n/g, '\r\n')] : [];
    for (const form of [k.value, ...lines, JSON.stringify(k.value).slice(1, -1), encodeURIComponent(k.value)]) {
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

const MARKER_RE = /⟦redacted:([^⟦⟧\n]*)⟧/g;
/**
 * What a marker may name (AUD-01): a catalog id (and `unscannable`), `user:<id>` as the settings allow it, or
 * `env:<NAME>`. Other text between the brackets is not a marker.
 */
export const MARKER_RULE = /^(?:[a-z][a-z0-9-]{0,63}|user:[a-z][a-z0-9-]{0,39}|env:[A-Za-z0-9_.-]{1,256})$/;
/** LINE_SPLIT_MARKER with a word joiner inside: what a literal marker in a tool's output is stored as. */
export const DEFUSED_SPLIT_MARKER = '⟦split\u2060⟧';

/** The markers that shield their place in a text, and the spans that redact a would-be marker (Redactor.markers). */
export interface MarkerScan {
  markers: [number, number][];
  forced: Span[];
}
const NO_MARKERS: MarkerScan = { markers: [], forced: [] };

/**
 * The spans of a pattern: the secret itself (its group, when the pattern has one), or with `whole` the entire match,
 * keyword included, which is what a line cut must keep in one piece (DEV-13 review R3-05: a cut between `api_key =`
 * and its value left the value matched by nothing, and stored). A span made only of markers is left alone (redacting
 * twice changes nothing); a span that touches a marker takes the whole marker, and anything else in it is still
 * redacted (review m3: `password=<secret>⟧` is not a marker, and is redacted).
 */
function patternSpans(text: string, p: CompiledPattern, markers: readonly [number, number][], whole = false): Span[] {
  const spans: Span[] = [];
  p.regex.lastIndex = 0;
  for (const m of text.matchAll(p.regex)) {
    let start = m.index;
    let end = start + m[0].length;
    if (p.group !== undefined) {
      const g = m[p.group];
      if (g === undefined) continue;
      const offset = m[0].lastIndexOf(g);
      start = m.index + offset;
      end = start + g.length;
      if (p.minEntropy !== undefined && entropy(g) < p.minEntropy) continue;
      if (whole) {
        start = m.index;
        end = m.index + m[0].length;
      }
    }
    if (end <= start) continue;
    [start, end] = withMarkers(start, end, markers);
    if (onlyMarkers(start, end, markers)) continue;
    spans.push({ start, end, rule: p.rule });
  }
  return spans;
}

/** A span widened to every marker it touches, whole. */
function withMarkers(start: number, end: number, markers: readonly [number, number][]): [number, number] {
  for (const [a, b] of markers) {
    if (a < end && b > start) {
      start = Math.min(start, a);
      end = Math.max(end, b);
    }
  }
  return [start, end];
}

/** True when a span (widened by withMarkers) is made of markers alone: markers never overlap one another. */
function onlyMarkers(start: number, end: number, markers: readonly [number, number][]): boolean {
  let covered = 0;
  for (const [a, b] of markers) if (a >= start && b <= end) covered += b - a;
  return markers.length > 0 && covered === end - start;
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
  /** The rules this redactor writes markers for: those markers shield their place (AUD-01). */
  readonly #names: ReadonlySet<string>;
  /** The known values of several lines: a stream matches them before it cuts lines (AUD-02). */
  readonly multilineKnown: readonly KnownValue[];

  constructor(rules: RedactionRules) {
    this.rules = rules;
    this.#names = new Set(['unscannable', ...[...rules.highConfidence, ...rules.blocks, ...rules.user, ...rules.known].map((r) => r.rule)]);
    this.multilineKnown = rules.known.filter((k) => k.value.includes('\n'));
  }

  /** The spans of layers 1, 2 and 4 in `text`, with the given markers shielding their place. */
  #layerSpans(text: string, markers: readonly [number, number][], whole = false): Span[] {
    const spans = knownSpans(text, this.rules.known);
    for (const p of this.rules.highConfidence) spans.push(...patternSpans(text, p, markers, whole));
    for (const p of this.rules.user) spans.push(...patternSpans(text, p, markers, whole));
    return spans;
  }

  /**
   * AUD-01: the markers of an earlier redaction in `text`. A tool can print a marker as well, so a marker shields its
   * place only when it names a rule: one this redactor writes, or a well-formed name of an earlier one (a variable no
   * longer set) that no layer would redact were it printed bare in the marker's place. Any other would-be marker is
   * text like the rest; where its bare name would be redacted, the whole of it is (`forced`), so the brackets around
   * a secret change nothing. `whole` is patternSpans', for a line cut.
   */
  markers(text: string, whole = false): MarkerScan {
    if (!text.includes(MARKER_START)) return NO_MARKERS;
    const found = [...text.matchAll(MARKER_RE)].filter((m) => MARKER_RULE.test(m[1]!));
    const range = (m: RegExpExecArray): [number, number] => [m.index, m.index + m[0].length];
    const stale = found.filter((m) => !this.#names.has(m[1]!));
    if (!stale.length) return { markers: found.map(range), forced: [] };
    // The probe: the text with each such marker replaced by its bare name, scanned by every layer.
    const regions: { probe: [number, number]; text: [number, number] }[] = [];
    let probe = '';
    let pos = 0;
    for (const m of stale) {
      probe += text.slice(pos, m.index);
      const bare = m[1]!.replace(/^(?:env|user):/, '');
      regions.push({ probe: [probe.length, probe.length + bare.length], text: range(m) });
      probe += bare;
      pos = m.index + m[0].length;
    }
    probe += text.slice(pos);
    // A place in the probe as a place in `text`: inside a bare name, its marker's start (edge 0) or end (edge 1).
    const toText = (p: number, edge: 0 | 1): number => {
      let shift = 0;
      for (const r of regions) {
        if (p <= r.probe[0]) break;
        if (p < r.probe[1]) return r.text[edge];
        shift = r.text[1] - r.probe[1];
      }
      return p + shift;
    };
    const distrusted = new Set<number>();
    const forced: Span[] = [];
    for (const h of this.#layerSpans(probe, [], whole)) {
      const touched = regions.filter((r) => h.start < r.probe[1] && h.end > r.probe[0]);
      if (!touched.length) continue;
      for (const r of touched) distrusted.add(r.text[0]);
      forced.push({ start: toText(h.start, 0), end: toText(h.end, 1), rule: h.rule });
    }
    const markers = found.filter((m) => !distrusted.has(m.index)).map(range);
    for (const f of forced) [f.start, f.end] = withMarkers(f.start, f.end, markers);
    return { markers, forced };
  }

  /** All spans of layers 1, 2 and 4 in a piece of text (one line, or a whole document). */
  #spans(text: string): Span[] {
    const scan = this.markers(text);
    return [...this.#layerSpans(text, scan.markers), ...scan.forced];
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

  /**
   * Redacts every string inside a JSON value (discovery facts, profile content): the values and the object keys
   * (review m4: extensions, group and variable names are keys). Two keys redacted alike stay apart (`#2`).
   */
  redactJson<T>(value: T, counts: RedactionCounts = {}): T {
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') return this.#count(this.redactText(v), counts);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const used = new Set<string>();
        const entries = Object.entries(v as Record<string, unknown>).map(([k, x]): [string, unknown] => {
          const base = this.#count(this.redactText(k), counts);
          let key = base;
          for (let i = 2; used.has(key); i++) key = `${base}#${i}`;
          used.add(key);
          return [key, walk(x)];
        });
        return Object.fromEntries(entries);
      }
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
    const scan = this.markers(text);
    for (const p of this.rules.highConfidence) for (const s of patternSpans(text, p, scan.markers)) rules.add(s.rule);
    // A would-be marker around what a known value or a high-confidence pattern matches (AUD-01).
    for (const s of scan.forced) if (!s.rule.startsWith('user:')) rules.add(s.rule);
    for (const b of this.rules.blocks) if (b.begin.test(text)) rules.add(b.rule);
    return rules.size ? { ok: false, rules: [...rules].sort() } : { ok: true };
  }
}

export class LineRedactor {
  readonly #r: Redactor;
  #buffer = '';
  #inBlock: CompiledBlock | null = null;
  readonly counts: RedactionCounts = {};
  /** The longest known value of several lines: what the stream may hold back for one (AUD-02). */
  readonly #multilineMax: number;

  constructor(r: Redactor) {
    this.#r = r;
    this.#multilineMax = Math.max(0, ...r.multilineKnown.map((k) => k.value.length));
  }

  /** Feeds a chunk; returns the complete, redacted lines (each with its `\n`), and long-line segments. */
  push(chunk: string): string[] {
    // Only where the chunk can complete a known value of several lines is searched again.
    const from = Math.max(0, this.#buffer.length - this.#multilineMax + 1);
    this.#buffer += chunk;
    this.#joinKnown(from);
    return this.#drain(false);
  }

  /**
   * AUD-02: a known value of several lines is replaced in the stream itself, before the stream is cut into lines
   * (each of its lines alone matches nothing, and was stored). Its marker takes the place of all its lines.
   */
  #joinKnown(from: number): void {
    if (!this.#multilineMax) return;
    const tail = this.#buffer.slice(from);
    const spans = knownSpans(tail, this.#r.multilineKnown);
    if (spans.length) this.#buffer = this.#buffer.slice(0, from) + applySpans(tail, spans, this.counts);
  }

  /**
   * AUD-02: how much of the buffer's end must wait for the next chunk — the longest end that begins a known value of
   * several lines — so no line leaves with part of one. Never more than the longest such value.
   */
  #held(): number {
    const b = this.#buffer;
    let held = 0;
    for (const { value } of this.#r.multilineKnown) {
      for (let p = b.indexOf(value[0]!, Math.max(0, b.length - value.length + 1)); p >= 0 && b.length - p > held; p = b.indexOf(value[0]!, p + 1)) {
        if (value.startsWith(b.slice(p))) {
          held = b.length - p;
          break;
        }
      }
    }
    return held;
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
   * (a newline, or the end of the stream), or SPLIT_LOOKAHEAD_CHARS past the cut point. Nothing of what may still
   * become a known value of several lines leaves before the stream says (AUD-02); the end lets everything out.
   */
  #drain(final: boolean): string[] {
    const out: string[] = [];
    const held = final ? 0 : this.#held();
    for (;;) {
      const limit = this.#buffer.length - held;
      const nl = this.#buffer.indexOf('\n');
      const lineLength = nl >= 0 ? nl : this.#buffer.length;
      const known = nl >= 0 || final || this.#buffer.length > MAX_LINE_CHARS + SPLIT_LOOKAHEAD_CHARS;
      if (lineLength > MAX_LINE_CHARS && known) {
        const cut = Math.min(this.#safeCut(this.#buffer.slice(0, lineLength)), limit);
        if (cut <= 0) return out;
        const segment = this.#buffer.slice(0, cut);
        this.#buffer = this.#buffer.slice(cut);
        // A segment dropped inside a private-key block leaves nothing, not even the split marker (review m3).
        out.push(...this.#line(segment).filter((x) => x !== '').map((x) => x + LINE_SPLIT_MARKER + '\n'));
        continue;
      }
      if (nl >= 0 && nl < limit) {
        const line = this.#buffer.slice(0, nl + 1);
        this.#buffer = this.#buffer.slice(nl + 1);
        out.push(...this.#line(line));
        continue;
      }
      return out;
    }
  }

  /**
   * The cut point for an over-long line: at MAX_LINE_CHARS, moved so that no match is cut in two. Overlapping
   * matches are merged first, so moving the cut out of one never lands it inside another (review m3).
   */
  #safeCut(text: string): number {
    const window = text.slice(0, MAX_LINE_CHARS + SPLIT_LOOKAHEAD_CHARS);
    const scan = this.#r.markers(window, true);
    const spans: Span[] = [...knownSpans(window, this.#r.rules.known), ...scan.forced];
    for (const p of [...this.#r.rules.highConfidence, ...this.#r.rules.user]) spans.push(...patternSpans(window, p, scan.markers, true));
    spans.sort((a, b) => a.start - b.start);
    const cut = MAX_LINE_CHARS;
    let start = -1;
    let end = -1;
    for (const s of spans) {
      if (s.start < end) end = Math.max(end, s.end);
      else {
        if (start < cut && end > cut) break;
        start = s.start;
        end = s.end;
      }
    }
    if (start < cut && end > cut) return start > 0 ? start : end;
    return cut;
  }

  #line(raw: string): string[] {
    // The split marker as a tool may print it itself is defused, so that reading undoes the redactor's own cuts alone
    // and never joins two lines of the output, or two halves of a secret, that were apart (DEV-13 review R3-10).
    const line = raw.includes(LINE_SPLIT_MARKER) ? raw.split(LINE_SPLIT_MARKER).join(DEFUSED_SPLIT_MARKER) : raw;
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
