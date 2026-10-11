// A log's raw lines as the log components draw them (C-13, C-24): terminal colour codes removed, and the engine's
// redaction markers (⟦redacted:<rule>⟧, written before anything reaches the page) turned into redacted segments,
// so a secret's place shows its kind and never a value. Bidi controls stay in the text: LogLineText reveals them.
import { LOCALES, type Lang, type Translate } from '@ayar/i18n';
import type { LogLine, LogSegment } from '../lib/evidence.ts';
import { textOr } from './format.ts';

// CSI sequences (colours, cursor moves) and OSC sequences (titles, links), and a lone ESC.
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
const MARKER = /⟦redacted:([^⟧\n]*)⟧/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** The kind of a redacted value in the UI language: a catalog rule, an environment variable's value, a user pattern. */
export function redactionKind(t: Translate, lang: Lang, rule: string): string {
  if (rule.startsWith('env:')) return t('results.redaction.env', { name: rule.slice(4) });
  if (rule.startsWith('user:')) return t('results.redaction.user');
  return textOr(t, lang, `results.redaction.rule.${rule}`, rule);
}

/** The kinds of a report's redactions as one list in the UI language («رمز GitHub وقيمة سرية»), or undefined. */
export function redactionKinds(t: Translate, lang: Lang, byRule: Readonly<Record<string, number>>): string | undefined {
  const kinds = [...new Set(Object.keys(byRule).map((r) => redactionKind(t, lang, r)))];
  return kinds.length ? new Intl.ListFormat(LOCALES[lang], { type: 'conjunction' }).format(kinds) : undefined;
}

/** One raw line as segments: text, and a redacted segment for each marker (its kind in the UI language). */
export function logSegments(t: Translate, lang: Lang, raw: string): LogSegment[] {
  const text = stripAnsi(raw).replace(/\r$/, '');
  const out: LogSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(MARKER)) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) });
    out.push({ kind: 'redacted', what: redactionKind(t, lang, m[1] ?? '') });
    at = m.index + m[0].length;
  }
  if (at < text.length || !out.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}

/** The last lines of a log, numbered from the end of the whole log (`totalLines`). */
export function logLines(t: Translate, lang: Lang, lines: readonly string[], totalLines: number): LogLine[] {
  const first = totalLines - lines.length + 1;
  return lines.map((raw, i) => ({ number: first + i, segments: logSegments(t, lang, raw), muted: /^\s*[$>]\s/.test(stripAnsi(raw)) }));
}
