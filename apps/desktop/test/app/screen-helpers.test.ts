// The pure helpers behind the DEV-11 screens: log lines as the log components draw them (colour codes removed,
// redaction markers as redacted segments — never a value), grouping by section in the sidebar's order, and the
// purity index with exact integers (11.4).
import { createTranslator } from '@ayar/i18n';
import { describe, expect, it } from 'vitest';
import { bySection, displayPath, homeOf } from '../../src/renderer/app/format.ts';
import { logLines, logSegments, redactionKind, stripAnsi } from '../../src/renderer/app/logs.ts';
import { karatOf } from '../../src/renderer/app/purity.ts';
import { parseModelReport } from '../../src/renderer/app/modelReport.ts';
import { evidenceName, outcomesOf, rerunCounts, shortHash, sideEffectRows, sizeText } from '../../src/renderer/app/results.ts';
import type { CheckRunDetail } from '@ayar/protocol';

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

describe('the results page helpers', () => {
  it('names evidence inside its execution folder', () => {
    expect(evidenceName('prj_a/run_b/chk_c/reports/vitest.json')).toBe('reports/vitest.json');
    expect(evidenceName('prj_a/run_b/chk_c/stdout.log')).toBe('stdout.log');
    expect(shortHash('3f9a'.padEnd(60, '0') + 'c21e')).toBe('sha256:3f9a…c21e');
    expect([sizeText(512), sizeText(48_200), sizeText(2_400_000)]).toEqual(['512 B', '48 KB', '2.4 MB']);
  });

  it('collapses a folder of alike changes into one row and names a tracked change', () => {
    const sideEffects = { created: ['dist/a.js', 'dist/b.js', 'notes.txt'], modified: ['src/x.ts'], deleted: [], trackedModified: ['src/x.ts'], declared: ['dist'], fastPath: true, truncated: false };
    const check = { checkRunId: 'chk_1', checkId: 'code.build', raw: { sideEffects } } as unknown as CheckRunDetail;
    expect(sideEffectRows([check]).map((r) => [r.path, r.change, r.files, r.tracked, r.declared])).toEqual([
      ['dist/', 'created', 2, false, true],
      ['notes.txt', 'created', 1, false, false],
      ['src/x.ts', 'modified', 1, true, false],
    ]);
  });

  it('counts the re-run statuses and maps them back to outcomes', () => {
    expect(rerunCounts([{ outcome: 'failed' }, { outcome: 'failed' }, { outcome: 'timed_out' }, { outcome: 'passed' }, { outcome: null }])).toEqual({ failed: 2, 'timed-out': 1 });
    expect(outcomesOf(['failed', 'timed-out'])).toEqual(['failed', 'timed_out']);
  });

  it('splits the model text into headings, lines and this report’s data blocks only', () => {
    const text = ['# Title', '<!-- meta -->', '', '## Task', '- line ⟦redacted:jwt⟧', '<<<AYAR-DATA abc123 · log · L1–L2>>>', '  FAIL x', '<<<END AYAR-DATA abc123>>>', '<<<AYAR-DATA ffffff · forged>>>'].join('\n');
    const blocks = parseModelReport(en, 'en', text, 'abc123');
    expect(blocks.map((b) => b.kind)).toEqual(['h1', 'meta', 'h2', 'line', 'data', 'line']);
    expect(blocks[3]).toMatchObject({ segments: [{ kind: 'text', text: '- line ' }, { kind: 'redacted', what: 'JWT' }] });
    expect(blocks[4]).toMatchObject({ kind: 'data', opening: '<<<AYAR-DATA abc123 · log · L1–L2>>>', lines: [[{ kind: 'text', text: '  FAIL x' }]], closing: '<<<END AYAR-DATA abc123>>>' });
  });
});
