// C-15 «حماية القراءة»: the limits every report is read within, and what a report that breaks one becomes — a
// «تعذّر» with its own reason, never a guess. G-DEV1-05: 50 MiB per report (the plan's default), and 64 levels for
// JSON and XML (the reference checker's value; FX-REPORTS' report 5,000 levels deep is refused by any reasonable
// limit). JSON is checked for depth before it is parsed, so a hostile nesting never reaches the parser's stack;
// XML has no DTD and no entity beyond the five predefined ones and character references.
import type { ReportProblem } from '@ayar/protocol';

export const REPORT_LIMITS = {
  /** 10.3: 50 MB by default; a larger report is «تعذّر: تقرير أكبر من الحد». */
  maxBytes: 50 * 1024 * 1024,
  /** G-DEV1-05. */
  maxJsonDepth: 64,
  maxXmlDepth: 64,
  /** Findings kept one by one per report; the rest are counted (findingsDropped). */
  maxFindings: 20_000,
  /** The longest message kept per finding. */
  maxMessage: 4000,
} as const;

export type Read<T> = { ok: true; value: T } | { ok: false; problem: ReportProblem };

/**
 * The redaction (C-18, D-46) stores every report with its lines bounded: a line longer than 64 Ki characters is cut
 * with this marker and a newline, never through a match. A report is read from that stored copy, so the cut is
 * undone before parsing — a single-line JSON report of a real project (ESLint on a repository, Vitest's run of a
 * thousand tests) is longer than that, and read as cut it is «malformed» at character 65,537 (found by AYAR on its
 * own repository, DEV-13).
 */
export const LINE_SPLIT_MARKER = '⟦split⟧';
export const unsplit = (text: string): string => (text.includes(LINE_SPLIT_MARKER) ? text.split(`${LINE_SPLIT_MARKER}\n`).join('') : text);

export const problem = (code: ReportProblem['code'], file: string, detail: string): { ok: false; problem: ReportProblem } => ({ ok: false, problem: { code, file, detail: detail.slice(0, 1000) } });

/** The deepest nesting of a JSON text, scanned without parsing (strings and escapes skipped); stops past `limit`. */
export function jsonDepth(text: string, limit: number): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++; // backslash: skip the escaped character
      else if (c === 0x22) inString = false;
      continue;
    }
    if (c === 0x22) inString = true;
    else if (c === 0x7b || c === 0x5b) {
      depth++;
      if (depth > max) {
        max = depth;
        if (max > limit) return max;
      }
    } else if (c === 0x7d || c === 0x5d) depth--;
  }
  return max;
}

/** A JSON report, within the limits: empty, too deep or malformed is a problem of its own. */
export function readJson(raw: string, file: string, o: { maxDepth?: number } = {}): Read<unknown> {
  const text = unsplit(raw);
  const limit = o.maxDepth ?? REPORT_LIMITS.maxJsonDepth;
  if (!text.trim()) return problem('empty', file, 'empty report');
  const depth = jsonDepth(text, limit);
  if (depth > limit) return problem('too_deep', file, `nesting deeper than ${limit} levels`);
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return problem('malformed', file, e instanceof Error ? e.message : String(e));
  }
}

/** JSON written to a tool's output among other lines (`$ pyright --outputjson` from the package manager, a banner). */
export function readJsonInText(raw: string, file: string, o: { maxDepth?: number; open?: '{' | '[' } = {}): Read<unknown> {
  const text = unsplit(raw);
  const direct = text.trim();
  if (!direct) return problem('empty', file, 'no output');
  if (direct.startsWith('{') || direct.startsWith('[')) {
    const r = readJson(direct, file, o);
    if (r.ok || r.problem.code !== 'malformed') return r;
  }
  // The first line that opens the expected value, to the last line that closes it.
  const lines = text.split('\n');
  const open = o.open ?? '{';
  const close = open === '{' ? '}' : ']';
  const start = lines.findIndex((l) => l.trimStart().startsWith(open));
  let end = -1;
  for (let i = lines.length - 1; i > start; i--) if (lines[i]!.trimEnd().endsWith(close)) {
    end = i;
    break;
  }
  if (start < 0 || (end < 0 && !lines[start]!.trimEnd().endsWith(close))) return problem('malformed', file, 'no JSON value in the output');
  return readJson(lines.slice(start, end < 0 ? start + 1 : end + 1).join('\n'), file, o);
}

/** JSON lines (mypy `-O json`): one object per line; a line that is not JSON is skipped and counted. */
export function readJsonLines(raw: string, file: string): Read<{ values: unknown[]; skipped: number }> {
  const values: unknown[] = [];
  let skipped = 0;
  for (const line of unsplit(raw).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) {
      if (t) skipped++;
      continue;
    }
    const r = readJson(t, file);
    if (r.ok) values.push(r.value);
    else if (r.problem.code === 'too_deep') return r;
    else skipped++;
  }
  return { ok: true, value: { values, skipped } };
}

export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const rec = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
export const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);
