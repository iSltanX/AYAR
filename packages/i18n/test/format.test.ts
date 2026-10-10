// AT-28 (part), C-24: plural forms for 0, 1, 2, 3, 11 and 100 in both languages, Latin digits, Gregorian dates,
// ISO 8601 in evidence, and visible bidi controls.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  direction,
  formatDate,
  formatDuration,
  formatNumber,
  isoTimestamp,
  MissingMessageError,
  resolveLanguage,
  revealBidiControls,
  type MessageKey,
} from '../src/index.ts';

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const ar = createTranslator('ar');
const en = createTranslator('en');

describe('plurals (C-24: the six Arabic forms)', () => {
  it.each([
    [0, 'لا فحوص', '0 checks'],
    [1, 'فحص واحد', '1 check'],
    [2, 'فحصان', '2 checks'],
    [3, '3 فحوص', '3 checks'],
    [11, '11 فحصًا', '11 checks'],
    [100, '100 فحص', '100 checks'],
  ])('%i → %s / %s', (count, arabic, english) => {
    expect(ar('common.count.checks', { count })).toBe(arabic);
    expect(en('common.count.checks', { count })).toBe(english);
  });

  it.each([
    [0, 'لا اكتشافات'],
    [1, 'اكتشاف واحد'],
    [2, 'اكتشافان'],
    [3, '3 اكتشافات'],
    [11, '11 اكتشافًا'],
    [100, '100 اكتشاف'],
  ])('findings %i → %s', (count, arabic) => {
    expect(ar('common.count.findings', { count })).toBe(arabic);
  });

  it('never prints Arabic-Indic digits, for any count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (count) => {
        const keys: MessageKey[] = ['common.count.checks', 'common.count.findings', 'common.count.runs'];
        return keys.every((k) => !ARABIC_INDIC_DIGITS.test(ar(k, { count })));
      }),
    );
  });
});

describe('numbers and dates', () => {
  it('formats numbers with Latin digits in Arabic', () => {
    expect(formatNumber(1234567.5, 'ar')).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(formatNumber(1234567.5, 'ar')).toMatch(/1.234.567.5/);
    expect(formatNumber(24, 'en')).toBe('24');
  });

  it('formats dates in the Gregorian calendar with Latin digits', () => {
    const d = new Date('2026-10-10T08:05:00Z');
    const arabic = formatDate(d, 'ar', { dateStyle: 'long', timeZone: 'UTC' });
    expect(arabic).toContain('2026');
    expect(arabic).toContain('10');
    expect(arabic).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(formatDate(d, 'en', { dateStyle: 'long', timeZone: 'UTC' })).toBe('October 10, 2026');
  });

  it('formats durations in both languages', () => {
    expect(formatDuration(125_000, 'en')).toBe('2 min, 5 sec');
    expect(formatDuration(3_725_000, 'ar')).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(formatDuration(450, 'en')).toBe('450 ms');
  });

  it('writes ISO 8601 UTC in evidence', () => {
    expect(isoTimestamp(new Date(Date.UTC(2026, 9, 10, 8, 5, 0)))).toBe('2026-10-10T08:05:00.000Z');
  });
});

describe('language and direction', () => {
  it('an explicit setting wins; otherwise the first preferred language we have', () => {
    expect(resolveLanguage('en', ['ar-SA'])).toBe('en');
    expect(resolveLanguage('system', ['fr-FR', 'ar-SA', 'en-US'])).toBe('ar');
    expect(resolveLanguage('system', ['en_GB'])).toBe('en');
    expect(resolveLanguage('system', ['fr'])).toBe('en');
    expect(direction('ar')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
  });

  it('throws on a key that is not in the tables', () => {
    expect(() => ar('common.nope' as MessageKey)).toThrow(MissingMessageError);
  });
});

describe('bidi controls (C-24, T3)', () => {
  it('turns each control into a visible segment', () => {
    expect(revealBidiControls('a‮b⁦c')).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'control', codePoint: 0x202e, name: 'RLO' },
      { kind: 'text', text: 'b' },
      { kind: 'control', codePoint: 0x2066, name: 'LRI' },
      { kind: 'text', text: 'c' },
    ]);
  });

  it('loses nothing: the segments rebuild the original text', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.string(), fc.constantFrom('‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩'))), (parts) => {
        const text = parts.join('');
        const rebuilt = revealBidiControls(text)
          .map((s) => (s.kind === 'text' ? s.text : String.fromCodePoint(s.codePoint)))
          .join('');
        const noControlInText = revealBidiControls(text).every((s) => s.kind === 'control' || !/[‪-‮⁦-⁩]/.test(s.text));
        return rebuilt === text && noControlInText;
      }),
    );
  });
});
