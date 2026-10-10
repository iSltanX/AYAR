// @ayar/i18n (C-24): ICU messages through intl-messageformat with the six Arabic plural forms, Latin digits in
// both languages, the Gregorian calendar, and ISO 8601 in evidence (D-15). Node-free: the renderer uses it.
// The visual isolation components (dir, unicode-bidi) are built in DEV-10; this package holds the functions.
import { IntlMessageFormat, type PrimitiveType } from 'intl-messageformat';
import { MESSAGES } from '../messages/index.ts';

export { MESSAGE_FILES, MESSAGES } from '../messages/index.ts';
export type { Scope } from '../messages/index.ts';

export const LANGS = ['ar', 'en'] as const;
export type Lang = (typeof LANGS)[number];
/** Keys of the Arabic table; the coverage test guarantees the English table has the same keys. */
export type MessageKey = keyof typeof MESSAGES.ar;
export type MessageValues = Record<string, PrimitiveType>;

/** Latin digits and the Gregorian calendar in both languages (C-24, D-15). */
export const LOCALES: Record<Lang, string> = {
  ar: 'ar-u-ca-gregory-nu-latn',
  en: 'en-u-ca-gregory-nu-latn',
};

export function direction(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export class MissingMessageError extends Error {
  readonly key: string;
  constructor(key: string, lang: Lang) {
    super(`missing message ${key} (${lang})`);
    this.name = 'MissingMessageError';
    this.key = key;
  }
}

export type Translate = (key: MessageKey, values?: MessageValues) => string;

/** A translator for one language. Formats are compiled once per key. */
export function createTranslator(lang: Lang): Translate {
  const table: Record<string, string> = MESSAGES[lang];
  const compiled = new Map<string, IntlMessageFormat>();
  return (key, values) => {
    let format = compiled.get(key);
    if (!format) {
      const source = table[key];
      if (source === undefined) throw new MissingMessageError(key, lang);
      format = new IntlMessageFormat(source, LOCALES[lang]);
      compiled.set(key, format);
    }
    const out = format.format(values);
    return typeof out === 'string' ? out : String(out);
  };
}

export function formatNumber(value: number, lang: Lang, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALES[lang], options).format(value);
}

/** A date for display: Gregorian, Latin digits, in the given time zone (the device's by default). */
export function formatDate(date: Date, lang: Lang, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(LOCALES[lang], options).format(date);
}

/** A duration for display, from milliseconds (hours, minutes, seconds; under a second as milliseconds). */
export function formatDuration(ms: number, lang: Lang): string {
  const total = Math.max(0, Math.round(ms));
  if (total < 1000) return new Intl.DurationFormat(LOCALES[lang], { style: 'short' }).format({ milliseconds: total });
  const s = Math.round(total / 1000);
  const parts = { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
  return new Intl.DurationFormat(LOCALES[lang], { style: 'short' }).format(parts);
}

/** ISO 8601 in UTC, for evidence, exports and the database (14.1, D-15). */
export function isoTimestamp(date: Date): string {
  return date.toISOString();
}

/** The UI language: an explicit setting wins; otherwise the first preferred system language that we have. */
export function resolveLanguage(setting: 'system' | Lang, preferred: readonly string[]): Lang {
  if (setting !== 'system') return setting;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base === 'ar' || base === 'en') return base;
  }
  return 'en';
}

/** Bidirectional control characters that must be shown, not obeyed, in logs and code (C-24, T3). */
export const BIDI_CONTROLS: Readonly<Record<number, string>> = {
  0x202a: 'LRE',
  0x202b: 'RLE',
  0x202c: 'PDF',
  0x202d: 'LRO',
  0x202e: 'RLO',
  0x2066: 'LRI',
  0x2067: 'RLI',
  0x2068: 'FSI',
  0x2069: 'PDI',
};

export type BidiSegment = { kind: 'text'; text: string } | { kind: 'control'; codePoint: number; name: string };

/** Splits text so that each bidi control becomes its own segment; the UI renders those as visible marks. */
export function revealBidiControls(text: string): BidiSegment[] {
  const out: BidiSegment[] = [];
  let buffer = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const name = BIDI_CONTROLS[cp];
    if (name) {
      if (buffer) out.push({ kind: 'text', text: buffer });
      buffer = '';
      out.push({ kind: 'control', codePoint: cp, name });
    } else {
      buffer += ch;
    }
  }
  if (buffer) out.push({ kind: 'text', text: buffer });
  return out;
}

export interface ScopeCoverage {
  scope: string;
  keys: number;
  missingAr: string[];
  missingEn: string[];
  percent: number;
}

/** Key coverage of both languages per scope (NFR-05: 100% is required, and tested). */
export function coverageReport(files: Record<string, { ar: Record<string, string>; en: Record<string, string> }>): ScopeCoverage[] {
  return Object.entries(files).map(([scope, { ar, en }]) => {
    const all = new Set([...Object.keys(ar), ...Object.keys(en)]);
    const missingAr = [...all].filter((k) => !(k in ar) || ar[k] === '');
    const missingEn = [...all].filter((k) => !(k in en) || en[k] === '');
    const covered = [...all].filter((k) => !missingAr.includes(k) && !missingEn.includes(k)).length;
    return { scope, keys: all.size, missingAr, missingEn, percent: all.size ? (covered / all.size) * 100 : 100 };
  });
}
