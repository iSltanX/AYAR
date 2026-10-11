// The pure helpers behind the DEV-11 screens: log lines as the log components draw them (colour codes removed,
// redaction markers as redacted segments — never a value), grouping by section in the sidebar's order, and the
// purity index with exact integers (11.4).
import { createTranslator } from '@ayar/i18n';
import { describe, expect, it } from 'vitest';
import { bySection, displayPath, homeOf } from '../../src/renderer/app/format.ts';
import { logLines, logSegments, redactionKind, stripAnsi } from '../../src/renderer/app/logs.ts';
import { karatOf } from '../../src/renderer/app/purity.ts';

const ar = createTranslator('ar');
const en = createTranslator('en');

describe('log lines (C-13, C-24)', () => {
  it('removes terminal colour and cursor codes, and keeps the text', () => {
    expect(stripAnsi('\u001b[32m✓\u001b[39m session \u001b[2m(3 ms)\u001b[22m')).toBe('✓ session (3 ms)');
    expect(stripAnsi('\u001b]0;title\u0007done\u001b[2K')).toBe('done');
  });

  it('turns a redaction marker into a redacted segment named in the UI language', () => {
    expect(logSegments(en, 'en', 'GITHUB_TOKEN=⟦redacted:github-token⟧ ok')).toEqual([
      { kind: 'text', text: 'GITHUB_TOKEN=' },
      { kind: 'redacted', what: 'GitHub token' },
      { kind: 'text', text: ' ok' },
    ]);
    expect(logSegments(ar, 'ar', '⟦redacted:env:API_KEY⟧')).toEqual([{ kind: 'redacted', what: 'قيمة المتغير API_KEY' }]);
    expect(redactionKind(en, 'en', 'user:corp')).toBe('user redaction pattern');
    expect(redactionKind(en, 'en', 'some-new-rule')).toBe('some-new-rule');
    expect(logSegments(en, 'en', '')).toEqual([{ kind: 'text', text: '' }]);
  });

  it('numbers the tail from the end of the whole log, and mutes command lines', () => {
    const lines = logLines(en, 'en', ['$ npm test', 'ok 1'], 40);
    expect(lines.map((l) => l.number)).toEqual([39, 40]);
    expect(lines.map((l) => !!l.muted)).toEqual([true, false]);
  });
});

describe('grouping and paths', () => {
  it('groups by section in the sidebar order, unknown sections last, keeping each group’s order', () => {
    const items = [
      { id: 'a', s: 'custom' },
      { id: 'b', s: 'security' },
      { id: 'c', s: 'zzz' },
      { id: 'd', s: 'design' },
      { id: 'e', s: 'security' },
    ];
    expect(bySection(items, (i) => i.s).map(([s, list]) => [s, list.map((i) => i.id)])).toEqual([
      ['design', ['d']],
      ['security', ['b', 'e']],
      ['custom', ['a']],
      ['zzz', ['c']],
    ]);
  });

  it('writes the home folder as ~ only for a path under it', () => {
    expect(homeOf('/Users/me/projects/rasd')).toBe('/Users/me');
    expect(displayPath('/Users/me/projects/rasd', '/Users/me')).toBe('~/projects/rasd');
    expect(displayPath('/Users/meow/x', '/Users/me')).toBe('/Users/meow/x');
    expect(homeOf('/Volumes/disk/x')).toBeNull();
  });
});

describe('karat (11.4): floor(24·P) with exact integers', () => {
  it('never rounds a float up across a karat boundary', () => {
    // P = (2/3 + 1/3 + 1)/3 = 2/3 exactly → 16, where a float sum can land on 15.999…
    expect(karatOf([{ n: 3, passed: 2 }, { n: 3, passed: 1 }, { n: 1, passed: 1 }])).toBe(16);
    expect(karatOf([{ n: 7, passed: 7 }])).toBe(24);
    expect(karatOf([{ n: 10, passed: 9 }, { n: 10, passed: 10 }])).toBe(22);
    expect(karatOf([])).toBeNull();
  });
});
