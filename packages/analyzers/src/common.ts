// What the analyzers of C-13 share: their input (the project's files as AYAR's inventory lists them, a bounded
// reader, the references of the profile, the discovery facts of the component), their result (a ParsedReport and the
// exit signal of 7.3, as an adapter's), and the small readers they need: the line of a text, the style blocks of an
// HTML or component file, the attributes of HTML tags. Pure functions: no process, no write; the engine runs them in
// a worker thread that can be stopped (C-13 «تعمل في خيوط عمل… وتقبل الإلغاء»).
import type { ExitSignal, Fact, JsonValue, ParsedReport } from '@ayar/protocol';
import { emptyReport, finding, pushFinding } from '@ayar/adapters';
import { posix } from 'node:path';

export interface AnalyzerInput {
  root: string;
  /** The component's folder, relative to the root ('.' for the project). */
  component: string;
  checkId: string;
  /** The inventory's files (relative to the root, .gitignore honoured), under the component. */
  files: readonly string[];
  /** A file's text (bounded); null when absent, a link, not a file, or too large. */
  read(rel: string): string | null;
  exists(rel: string): boolean;
  /** A file's size in bytes, or null. */
  size(rel: string): number | null;
  /** The files under a folder (relative to the root), outside the inventory too (a build output .gitignore hides). */
  listDir(rel: string): string[] | null;
  /** The compressed size of a file (gzip), for the size budgets. */
  gzipSize(rel: string): number | null;
  /** The references the spec uses: declared in the profile (`{ declared: … }`) or found by discovery (`{ discovered: … }`). */
  references: Record<string, JsonValue>;
  thresholds: Record<string, unknown> | null;
  /** The discovery facts of the component (and the project's). */
  facts: readonly Fact[];
  /** C-13 «وتقبل الإلغاء»: checked between files. */
  cancelled(): boolean;
}

export interface AnalyzerResult {
  report: ParsedReport;
  exit: ExitSignal;
}

export interface Analyzer {
  /** The catalog's runner id. */
  readonly id: string;
  readonly version: string;
  /** The key of its limits text. */
  readonly limitsKey: string;
  run(input: AnalyzerInput): AnalyzerResult;
}

export const report = (a: Pick<Analyzer, 'id' | 'version'>, formats: string[] = []): ParsedReport => emptyReport(a, formats);
export const OK: ExitSignal = { kind: 'ok' };

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

/**
 * A file the analysis should read: its text, or — when it cannot be read (over the reader's size, unreadable, a
 * link) — a finding that says so and a count, never a silent skip that would let the check pass over unread content.
 */
export function readOrSay(i: AnalyzerInput, r: ParsedReport, file: string): string | null {
  const text = i.read(file);
  if (text !== null) return text;
  r.info.unreadable = (typeof r.info.unreadable === 'number' ? r.info.unreadable : 0) + 1;
  pushFinding(r, finding({ rule: 'analysis.unparsable-file', origin: 'tool', message: `${file} could not be read (over the size AYAR reads, unreadable, or a link), so it was not analyzed`, location: { path: file }, anchor: { kind: 'text', value: `unreadable:${file}` } }));
  return null;
}

export function checkCancel(i: AnalyzerInput): void {
  if (i.cancelled()) throw new Cancelled();
}

export const ext = (f: string): string => {
  const b = posix.basename(f);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
};

/** The 1-based line of an offset in a text. */
export function lineAt(text: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** A fast line lookup for many offsets of one text (line starts, then a binary search). */
export function lineIndex(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** The 1-based line of the first occurrence of a needle, or null. */
export function lineOfText(text: string, needle: string): number | null {
  const at = text.indexOf(needle);
  return at < 0 ? null : lineAt(text, at);
}

/** A reference as the spec carries it: the declared value, else the discovered one, else null. */
export function refValue(i: AnalyzerInput, kind: string): JsonValue | null {
  const v = i.references[kind];
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, JsonValue>;
  return o.declared ?? o.discovered ?? null;
}

export function factValues(i: AnalyzerInput, key: string): Record<string, unknown>[] {
  return i.facts.filter((f) => f.key === key).map((f) => (f.value !== null && typeof f.value === 'object' && !Array.isArray(f.value) ? (f.value as Record<string, unknown>) : {}));
}

/** The CSS of a file, with the line where it starts: the whole file, or the `<style>` blocks of HTML and components. */
export function styleSources(rel: string, text: string): { css: string; line: number }[] {
  const e = ext(rel);
  if (e === 'css' || e === 'scss' || e === 'pcss' || e === 'postcss') return [{ css: text, line: 1 }];
  if (!['html', 'htm', 'svelte', 'vue', 'astro'].includes(e)) return [];
  const out: { css: string; line: number }[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ css: m[1]!, line: lineAt(text, start) });
  }
  return out;
}

export interface HtmlTag {
  name: string;
  attrs: Record<string, string>;
  line: number;
}

/** The start tags of an HTML text (outside comments, scripts and styles), with their attributes. */
export function htmlTags(text: string): HtmlTag[] {
  const out: HtmlTag[] = [];
  const clean = text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' ')).replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (whole, name: string, attrs: string, body: string) => `<${name}${attrs}>${body.replace(/[^\n]/g, ' ')}</${name}>`);
  const at = lineIndex(clean);
  const re = /<([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const attrs: Record<string, string> = {};
    const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (let a = ar.exec(m[2] ?? ''); a; a = ar.exec(m[2] ?? '')) attrs[a[1]!.toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    out.push({ name: m[1]!.toLowerCase(), attrs, line: at(m.index) });
  }
  return out;
}

/** A local reference: not a URL with a scheme, not protocol-relative, not data:, not a template expression. */
export function isLocalRef(ref: string): boolean {
  const r = ref.trim();
  if (!r || r.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(r)) return false;
  if (/[{}$]|<%|\{\{/.test(r)) return false;
  return true;
}

/** A reference without its query and fragment, and the fragment apart. */
export function splitRef(ref: string): { path: string; fragment: string | null } {
  const noQuery = ref.split('?')[0]!;
  const hash = noQuery.indexOf('#');
  return hash < 0 ? { path: decodeSafe(noQuery), fragment: null } : { path: decodeSafe(noQuery.slice(0, hash)), fragment: decodeSafe(noQuery.slice(hash + 1)) };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
