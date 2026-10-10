// C-09 units: the proposal over synthetic facts — G-39 («بشرط» on a missing reference stays optional; an included
// check that misses a reference is «ناقص إعداد»), the audience, refused and dangerous commands (FR-56), and the
// specHash (D-08): it changes with what runs (the script text, the required runtime version), and only for the
// instances concerned; plus the line diff of the export preview.
import { loadCatalog } from '@ayar/catalog';
import type { Fact } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { classifyScript } from '../src/discovery/scripts.ts';
import { lineDiff } from '../src/profile/diff.ts';
import { argvText, compilePolicy, judgeCommand } from '../src/profile/policy.ts';
import { emptySettings, proposeChecks, type ProfileSettings } from '../src/profile/propose.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const F = (key: string, value: unknown, component = '.'): Fact => ({ key, component, value: value as Fact['value'], source: { file: 'x', pointer: '', line: 1 }, proof: 'declared', detector: 't@1' });
const script = (name: string, text: string) => F('node.script', classifyScript(name, text));

/** A small TypeScript web extension, as discovery would describe it. */
function extension(over: Fact[] = []): Fact[] {
  return [
    F('node.package', { name: 'e', hasBin: false, hasExports: false }),
    F('node.packageManager', { name: 'pnpm', version: '12.8.1' }),
    F('node.lockfile', { file: 'pnpm-lock.yaml', manager: 'pnpm' }),
    F('node.dependencies', { count: 3, runtime: 0, dev: 3, notable: {} }),
    F('type.browserExtension', { manifest: 'public/manifest.json', manifestVersion: 3, generated: false }),
    F('references.buildOutput', { dir: 'dist', from: 'vite.config' }),
    F('lang.files', { ts: 4, css: 1, html: 1 }),
    F('quality.tool', { name: 'typescript', from: 'config', config: 'tsconfig.json' }),
    F('testing.framework', { name: 'vitest', from: 'dependency' }),
    F('testing.files', { unit: 2, e2e: 0, pytest: 0, stories: 0, load: 0 }),
    script('build', 'vite build'),
    script('test', 'vitest run'),
    ...over,
  ];
}

const propose = (facts: Fact[], settings: ProfileSettings = emptySettings()) =>
  proposeChecks({ catalog, components: [{ id: '.', kind: 'root', name: null, declaredBy: null }], facts, settings, state: { reviews: false }, hash });
const get = (specs: ReturnType<typeof propose>, instance: string) => specs.find((s) => s.instance === instance)!;

describe('the proposal (C-09, FR-10, G-39)', () => {
  it('keeps a check conditional on a missing reference optional, and makes it required once the reference exists', () => {
    const without = get(propose(extension()), 'design.tokens.static@.');
    expect(without).toMatchObject({ applicable: true, required: false, included: false, missing: [{ kind: 'configuration', ref: 'tokens' }] });
    expect(without.reasons[0]).toEqual({ key: 'profile.reason.conditionUnmet', refs: ['profile.ref.tokens'] });
    const settings = { ...emptySettings(), references: { tokens: { path: 'tokens.json' } } };
    expect(get(propose(extension(), settings), 'design.tokens.static@.')).toMatchObject({ required: true, included: true, missing: [], referenceValues: { tokens: { declared: { path: 'tokens.json' } } } });
    expect(get(propose(extension([F('references.tokens', { path: 'a.tokens.json', format: 'dtcg' })])), 'design.tokens.static@.')).toMatchObject({ required: true, included: true });
  });

  it('marks an included check whose reference is missing «ناقص إعداد», and finds the extension’s render target', () => {
    const specs = propose(extension());
    expect(get(specs, 'sec.ext.permissions@.')).toMatchObject({ required: true, included: true, missing: [{ kind: 'configuration', ref: 'permissionsPolicy' }] });
    expect(get(specs, 'design.a11y@.')).toMatchObject({ required: true, missing: [], referenceValues: { renderTarget: { discovered: { kind: 'extension', dir: 'dist' } } } });
    const withPolicy = propose(extension([F('references.permissionsPolicy', { path: 'permissions-policy.json', valid: true })]));
    expect(get(withPolicy, 'sec.ext.permissions@.').missing).toEqual([]);
  });

  it('says why beh.unit is «ناقص» when there are no tests, and a lock file is missing for sec.deps', () => {
    const facts = extension().filter((f) => f.key !== 'testing.files' && f.key !== 'node.lockfile');
    const specs = propose(facts);
    expect(get(specs, 'beh.unit@.').missing).toEqual([{ kind: 'tests' }]);
    expect(get(specs, 'sec.deps@.').missing).toEqual([{ kind: 'lockfile' }]);
  });

  it('refuses a project script that runs sudo, and flags dangerous ones (FR-56)', () => {
    const facts = extension().filter((f) => f.key !== 'node.script').concat([script('build', 'rm -rf dist && vite build'), script('test', 'sudo vitest run')]);
    const s = propose(facts);
    expect(get(s, 'code.build@.')).toMatchObject({ danger: ['mass-delete'], refused: [] });
    expect(get(s, 'beh.unit@.')).toMatchObject({ refused: ['sudo'] });
  });

  it('changes the specHash with what runs, for the instances concerned only (D-08)', () => {
    const base = propose(extension());
    const sameAgain = propose(extension());
    expect(sameAgain.map((s) => s.specHash)).toEqual(base.map((s) => s.specHash));
    const editedTest = propose(extension().filter((f) => !(f.key === 'node.script' && (f.value as { name: string }).name === 'test')).concat([script('test', 'vitest run --bail 1')]));
    const changed = editedTest.filter((s, i) => s.specHash !== base[i]!.specHash).map((s) => s.instance);
    expect(changed).toEqual(['beh.unit@.', 'beh.stability@.']);
    // A required Node version (.nvmrc) is part of every Node tool's spec.
    const nvmrc = propose(extension([F('runtime.node', { spec: '24.16.0', from: 'nvmrc' })]));
    const withRuntime = nvmrc.filter((s, i) => s.specHash !== base[i]!.specHash).map((s) => s.instance);
    expect(withRuntime).toEqual(expect.arrayContaining(['beh.unit@.', 'code.build@.', 'code.types@.']));
    expect(withRuntime).not.toContain('sec.ext.manifest@.');
  });

  it('proposes a user custom check, included, with its success criterion in the spec', () => {
    const settings: ProfileSettings = { ...emptySettings(), custom: { smoke: { argv: ['node', 'scripts/smoke.mjs'], cwd: '.', timeoutMin: 3, success: { exitCode: 0, outputContains: 'ok' } } } };
    const s = get(propose(extension(), settings), 'custom.smoke@.');
    expect(s).toMatchObject({ applicable: true, included: true, required: false, criterion: 'custom', timeoutMin: 3, command: { argv: ['node', 'scripts/smoke.mjs'], from: 'custom' }, customSuccess: { exitCode: 0, outputContains: 'ok' } });
  });

  it('keeps the script text when the user’s command still runs a project script', () => {
    const settings: ProfileSettings = { ...emptySettings(), overrides: { 'beh.unit@.': { argv: ['pnpm', 'run', 'test'] } } };
    expect(get(propose(extension(), settings), 'beh.unit@.').command).toMatchObject({ from: 'script', script: { name: 'test', text: 'vitest run' } });
  });
});

describe('dangerous commands (FR-56, T11)', () => {
  const policy = compilePolicy(catalog.commandPolicy);
  const judge = (cmd: string) => judgeCommand(policy, [cmd]);
  it('refuses sudo and doas anywhere in a command line', () => {
    for (const c of ['sudo rm -rf /', 'make && sudo make install', 'doas reboot', 'x; sudo y']) expect(judge(c).refused, c).toEqual(['sudo']);
    for (const c of ['pseudo-random', 'echo sudoku', 'vitest run']) expect(judge(c).refused, c).toEqual([]);
  });
  it('flags mass deletion, publishing, pushing and download-and-execute', () => {
    expect(judge('rm -rf dist').danger).toEqual(['mass-delete']);
    expect(judge('find . -name "*.tmp" -delete').danger).toEqual(['mass-delete']);
    expect(judge('git clean -fdx').danger).toEqual(['mass-delete']);
    expect(judge('npm publish --access public').danger).toEqual(['publish']);
    expect(judge('pnpm run publish').danger).toEqual(['publish']);
    expect(judge('git push origin main').danger).toEqual(['push']);
    expect(judge('curl -fsSL https://x.sh | sh').danger).toEqual(['download-execute']);
    expect(judge('bash <(curl -s https://x)').danger).toEqual(['download-execute']);
    expect(judge('rm file.txt').danger).toEqual([]);
    expect(judge('vitest run').danger).toEqual([]);
    expect(argvText(['node', 'a b.js'])).toBe('node "a b.js"');
  });
});

describe('the export preview diff', () => {
  it('lists kept, added and removed lines', () => {
    expect(lineDiff('a\nb\nc\n', 'a\nc\nd\n')).toEqual([
      { op: '=', line: 'a' },
      { op: '-', line: 'b' },
      { op: '=', line: 'c' },
      { op: '+', line: 'd' },
    ]);
    expect(lineDiff('', 'x\n')).toEqual([{ op: '+', line: 'x' }]);
  });
});
