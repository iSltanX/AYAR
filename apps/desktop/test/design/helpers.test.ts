// The pure helpers behind the components (DEV-10): search highlighting without index drift, path splitting for
// middle truncation and bidi isolation (D-DES3-04), valid progress numbers, which checks ran, Latin runs inside
// Arabic titles, and the sheet reset contract (Sheet.svelte).
import { describe, expect, it } from 'vitest';
import { splitMatches, splitPath } from '../../src/renderer/lib/evidence.ts';
import { checkRan, textRuns } from '../../src/renderer/lib/results.ts';
import { sheetResetKey, sheetResetter, validDecision } from '../../src/renderer/lib/sheets.ts';
import { clampFraction, countProgress, pathSegments } from '../../src/renderer/lib/shell.ts';

const joined = (parts: { text: string; match: boolean }[]) => parts.map((p) => (p.match ? `[${p.text}]` : p.text)).join('');

describe('splitMatches', () => {
  it('finds case-insensitive matches on the original text, without index drift', () => {
    expect(joined(splitMatches('İstanbul error', 'error'))).toBe('İstanbul [error]');
    expect(joined(splitMatches('ERROR: Error error', 'error'))).toBe('[ERROR]: [Error] [error]');
  });

  it('treats the query literally (regular-expression characters, slashes, dashes)', () => {
    expect(joined(splitMatches('a.b a+b (x)', 'a+b'))).toBe('a.b [a+b] (x)');
    expect(joined(splitMatches('x[1] path\\to', '[1]'))).toBe('x[[1]] path\\to');
    expect(joined(splitMatches('path\\to', '\\'))).toBe('path[\\]to');
    expect(joined(splitMatches('run --reporter=json', '--reporter'))).toBe('run [--reporter]=json');
    expect(joined(splitMatches('a/b/c', 'b/'))).toBe('a/[b/]c');
    expect(() => splitMatches('x', '(')).not.toThrow();
  });

  it('returns the text whole for an empty query or no match', () => {
    expect(splitMatches('abc', '')).toEqual([{ text: 'abc', match: false }]);
    expect(splitMatches('abc', 'z')).toEqual([{ text: 'abc', match: false }]);
  });
});

describe('paths (D-DES3-04)', () => {
  it('keeps the last slash, the file name and the line in the tail, and marks Arabic segments', () => {
    const { head, tail } = splitPath('~/مشاريع تجريبية/مكتبة «النصوص»/src/normalize.py', 42);
    expect(tail.map((p) => p.text).join('')).toBe('/normalize.py:42');
    expect(head.filter((p) => p.rtl).map((p) => p.text)).toEqual(['مشاريع تجريبية', 'مكتبة «النصوص»']);
    expect(head.map((p) => p.text).join('')).toBe('~/مشاريع تجريبية/مكتبة «النصوص»/src');
  });

  it('collapses the middle of a long project path and keeps its first and last segments', () => {
    expect(pathSegments('/Users/me/proj/app')).toEqual({
      absolute: true,
      segments: [
        { text: 'Users', rtl: false },
        { text: '…', rtl: false },
        { text: 'proj', rtl: false },
        { text: 'app', rtl: false },
      ],
    });
    expect(pathSegments('~/a/b').segments.map((s) => s.text)).toEqual(['~', 'a', 'b']);
  });
});

describe('progress numbers', () => {
  it('clamps counts and never yields NaN', () => {
    expect(countProgress(25, 18)).toEqual({ done: 18, total: 18, fraction: 1 });
    expect(countProgress(-2, 10)).toEqual({ done: 0, total: 10, fraction: 0 });
    expect(countProgress(3, 0)).toEqual({ done: 0, total: 0, fraction: 0 });
    expect(countProgress(Number.NaN, Number.NaN)).toEqual({ done: 0, total: 0, fraction: 0 });
    expect(countProgress(7.9, 18.2)).toEqual({ done: 7, total: 18, fraction: 7 / 18 });
  });

  it('clamps fractions to [0, 1]', () => {
    expect([clampFraction(-1), clampFraction(0.4), clampFraction(3), clampFraction(Number.NaN), clampFraction(Infinity)]).toEqual([0, 0.4, 1, 0, 0]);
  });
});

describe('which checks ran (no log or duration for one that never started)', () => {
  it('is false for queued and for results that mean the check did not run', () => {
    for (const s of ['queued', 'skipped', 'not-applicable', 'missing', 'missing-configuration', 'unavailable'] as const) expect(checkRan(s), s).toBe(false);
    for (const s of ['running', 'cancelling', 'passed', 'failed', 'warning', 'timed-out', 'cancelled', 'interrupted', 'passed-reviewed'] as const) expect(checkRan(s), s).toBe(true);
  });
});

describe('Latin runs in Arabic titles', () => {
  it('isolates Latin runs inside a right-to-left title, and keeps an English title whole', () => {
    expect(textRuns('رمز GitHub مكشوف في الإعدادات')).toEqual([
      { text: 'رمز ', ltr: false },
      { text: 'GitHub', ltr: true },
      { text: ' مكشوف في الإعدادات', ltr: false },
    ]);
    expect(textRuns('GitHub token exposed')).toEqual([{ text: 'GitHub token exposed', ltr: false }]);
  });
});

describe('sheet reset contract', () => {
  it('resets when the sheet opens and when its data changes, not while it stays open with the same data', () => {
    const reset = sheetResetter();
    const k1 = sheetResetKey('check', 'sec.secrets');
    expect(reset(false, k1)).toBe(false); // mounted closed
    expect(reset(true, k1)).toBe(true); // opens
    expect(reset(true, k1)).toBe(false); // stays open
    expect(reset(false, k1)).toBe(false); // closes
    expect(reset(true, k1)).toBe(true); // reopens
    expect(reset(true, sheetResetKey('check', 'beh.unit'))).toBe(true); // new data while open
  });

  it('keeps only a decision the variant offers', () => {
    expect(validDecision('check', 'reject')).toBe('reject');
    expect(validDecision('model-claim', 'reject')).toBe('convert-to-card');
    expect(validDecision('check', undefined)).toBe('accept');
  });
});
