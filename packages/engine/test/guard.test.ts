// The integrity guard as a pure function (C-22, D-12, FR-48): two inventories and the text of what changed, and
// the known effects found in the added lines — a rule silenced, a test skipped or deleted, a snapshot changed, a
// threshold lowered, an AYAR file changed — each linked to the check it touches; a new file silencing nothing, a
// comment, or a change under a declared output is no effect. The first-round inventory of markers is read too.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Manifest, ManifestEntry } from '../src/evidence/snapshot.ts';
import { addedLines, guard, loweredNumbers, markersIn } from '../src/integrity/guard.ts';

const entry = (path: string, text: string): ManifestEntry => [path, text.length, 1, 1, 1, `sha256:${createHash('sha256').update(text).digest('hex')}`, 'text', true];
const manifest = (files: Record<string, string>): Manifest => ({ schema: 'ayar-snapshot/1', fsType: 'apfs', fastPath: { allowed: false, reused: 0 }, full: true, contentStored: true, files: Object.entries(files).map(([p, t]) => entry(p, t)), skipped: [], truncated: false, totalSize: 0, hash: 'h' });
const texts = (files: Record<string, string>) => (p: string) => Promise.resolve(files[p] ?? null);

const BASE = {
  'src/lib/stats.test.ts': `import { it } from 'vitest';\nit('a', () => {});\nit('median of many digits', () => {});\n`,
  'src/popup.ts': `const x = 1;\nconsole.log('render');\n`,
  'vitest.config.ts': `export default { test: { coverage: { thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 } } } };\n`,
  'src/lib/__snapshots__/count.test.ts.snap': `exports['a'] = \`| الحروف | 5 |\`;\n`,
  'dist/out.js': 'built',
};

async function run(after: Record<string, string>, o: { declared?: (p: string) => boolean; referencePaths?: string[] } = {}) {
  return guard({ base: manifest(BASE), current: manifest(after), baseText: texts(BASE), currentText: texts(after), declared: o.declared ?? ((p) => p.startsWith('dist/')), referencePaths: o.referencePaths ?? [] });
}

describe('the integrity guard (C-22)', () => {
  it('finds nothing when nothing changed, and ignores the declared outputs', async () => {
    const r = await run({ ...BASE, 'dist/out.js': 'rebuilt' });
    expect(r.findings).toEqual([]);
    expect(r.changed).toEqual([]);
  });

  it('(ب) a skipped test is an effect on the test check, at its line', async () => {
    const r = await run({ ...BASE, 'src/lib/stats.test.ts': BASE['src/lib/stats.test.ts'].replace("it('median of many digits'", "it.skip('median of many digits'") });
    expect(r.findings).toMatchObject([{ rule: 'guard.skipped-test', path: 'src/lib/stats.test.ts', line: 3, check: 'beh.unit', pattern: '.skip/.only/.todo' }]);
    expect(r.findings[0]!.anchor).toContain('it.skip');
  });

  it('(ج) a silenced lint rule is an effect on code.lint; @ts-ignore on code.types; nosemgrep on sec.sast', async () => {
    const r = await run({ ...BASE, 'src/popup.ts': `const x = 1;\n// eslint-disable-next-line no-console\nconsole.log('render');\n// @ts-ignore\nconst y: number = 'a';\n// nosemgrep\neval(y);\n` });
    expect(r.findings.map((f) => [f.rule, f.check, f.line])).toEqual([
      ['guard.silenced-rule', 'code.lint', 2],
      ['guard.silenced-rule', 'code.types', 4],
      ['guard.silenced-rule', 'sec.sast', 6],
    ]);
  });

  it('(د) a changed snapshot is an effect on the test check, with the changed line', async () => {
    const r = await run({ ...BASE, 'src/lib/__snapshots__/count.test.ts.snap': `exports['a'] = \`| الحروف | 6 |\`;\n` });
    expect(r.findings).toMatchObject([{ rule: 'guard.snapshot-changed', path: 'src/lib/__snapshots__/count.test.ts.snap', check: 'beh.unit', line: 1 }]);
  });

  it('(هـ) a lowered threshold is an effect with both values; a raised one is not', async () => {
    const lowered = await run({ ...BASE, 'vitest.config.ts': BASE['vitest.config.ts'].replace('lines: 90', 'lines: 60').replace('branches: 80', 'branches: 50') });
    expect(lowered.findings).toMatchObject([{ rule: 'guard.threshold-lowered', path: 'vitest.config.ts', check: 'beh.unit' }]);
    expect(lowered.findings[0]!.message).toContain('lines 90 → 60');
    expect(lowered.findings[0]!.message).toContain('branches 80 → 50');
    const raised = await run({ ...BASE, 'vitest.config.ts': BASE['vitest.config.ts'].replace('lines: 90', 'lines: 95') });
    expect(raised.findings).toEqual([]);
  });

  it('a deleted test file and a changed reference image are effects; an AYAR file change is unattributed', async () => {
    const { 'src/lib/stats.test.ts': _gone, ...rest } = BASE;
    const r = await run({ ...rest, 'baselines/home.png': 'png2', '.ayar/profile.json': '{}' }, { referencePaths: ['baselines/home.png'] });
    expect(r.findings.map((f) => [f.rule, f.check])).toEqual(expect.arrayContaining([
      ['guard.skipped-test', 'beh.unit'],
      ['guard.reference-changed', null],
    ]));
    expect(r.deleted).toEqual(['src/lib/stats.test.ts']);
  });

  it('a new file with a marker is an effect too; a plain new file or a changed comment is not', async () => {
    const r = await run({ ...BASE, 'src/new.ts': `// eslint-disable-next-line no-undef\nfoo();\n`, 'README.md': '# hi\n' });
    expect(r.findings).toMatchObject([{ rule: 'guard.silenced-rule', path: 'src/new.ts', check: 'code.lint' }]);
    const comment = await run({ ...BASE, 'src/popup.ts': `// a note about eslint\nconst x = 1;\nconsole.log('render');\n` });
    expect(comment.findings).toEqual([]);
  });

  it('reads the markers of a first round, and the helpers behave', () => {
    expect(markersIn('a.test.ts', `it.skip('x', () => {});\n// eslint-disable-next-line\nok();\n`)).toMatchObject([{ kind: 'skipped', line: 1 }, { kind: 'silenced', line: 2 }]);
    expect(addedLines('a\nb\nc', 'a\nb\nd\nc')).toEqual([{ line: 3, text: 'd' }]);
    expect(loweredNumbers('lines: 90, x: 1', 'lines: 60, x: 2')).toEqual([{ key: 'lines', from: 90, to: 60 }]);
  });
});
