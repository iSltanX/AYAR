// C-06 (D-05, FR-04 to FR-09): discovery reads files only, within its limits, never follows a folder link,
// records .env* by name without opening it, never reads a huge file, respects nested .gitignore files, finds
// components, reads Git from files, and can be cancelled. A spy file system records every file opened.
import { closeSync, mkdirSync, openSync, symlinkSync, writeFileSync, ftruncateSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discover, DiscoveryCancelled, type DiscoveryResult } from '../src/discovery/discover.ts';
import { remoteHost } from '../src/discovery/git.ts';
import { lineOfJsonPath, lineOfToml, parseConfig, stripJsonComments } from '../src/discovery/parse.ts';
import { classifyScript, pickScript } from '../src/discovery/scripts.ts';
import type { DiscoveryFs } from '../src/discovery/walker.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { tempRoot } from './support/tmp.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempRoot('ayar-DEV-4-discovery-')));
afterEach(() => cleanup());

function write(rel: string, content: string | Buffer): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/** The real file system, recording every read (path relative to the root, bytes asked) and refusing nothing. */
function spyFs(): DiscoveryFs & { reads: { path: string; maxBytes: number }[] } {
  const reads: { path: string; maxBytes: number }[] = [];
  return {
    reads,
    readdirEntries: (p) => nodeFileSystem.readdirEntries(p),
    lstat: (p) => nodeFileSystem.lstat(p),
    stat: (p) => nodeFileSystem.stat(p),
    realpath: (p) => nodeFileSystem.realpath(p),
    readFilePrefix: (p, max) => {
      reads.push({ path: p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p, maxBytes: max });
      return nodeFileSystem.readFilePrefix(p, max);
    },
  };
}

const LIMITS = { maxDepth: 12, maxEntries: 100_000, maxConfigBytes: 2 * 1024 * 1024 };
const run = (fs: DiscoveryFs = nodeFileSystem, o: { limits?: typeof LIMITS; signal?: AbortSignal; at?: string } = {}) =>
  discover({ root: o.at ?? root, fs, limits: o.limits ?? LIMITS, signal: o.signal ?? new AbortController().signal, fingerprint: () => 'f' });
const fact = (r: DiscoveryResult, key: string, component = '.') => r.facts.filter((f) => f.key === key && f.component === component);

describe('read-only discovery (D-05, FR-04, FR-08)', () => {
  it('never opens .env*, keys or credential files, and records them by name only', async () => {
    const secret = ['ayr', '_env_', 'q'.repeat(24)].join('');
    write('package.json', '{"name":"p","scripts":{"test":"vitest run"}}');
    write('.env', `TOKEN=${secret}\n`);
    write('.env.local', `X=${secret}\n`);
    write('config/id_rsa', secret);
    write('.npmrc', `//registry/:_authToken=${secret}\n`);
    const fs = spyFs();
    const r = await run(fs);
    for (const name of ['.env', '.env.local', 'config/id_rsa', '.npmrc']) expect(fs.reads.map((x) => x.path)).not.toContain(name);
    expect(r.inventory.sensitiveFiles).toEqual([
      { path: '.env', kind: 'env', ignored: false },
      { path: '.env.local', kind: 'env', ignored: false },
      { path: '.npmrc', kind: 'credentials', ignored: false },
      { path: 'config/id_rsa', kind: 'key', ignored: false },
    ]);
    expect(fact(r, 'sensitive.files')[0]?.value).toEqual({ files: r.inventory.sensitiveFiles.map(({ path, kind }) => ({ path, kind })) });
    expect(JSON.stringify(r)).not.toContain(secret);
  });

  it('never reads a huge file, and reads a configuration file over the limit not at all', async () => {
    write('package.json', '{"name":"p"}');
    const fd = openSync(join(root, 'huge.bin'), 'w');
    ftruncateSync(fd, 300 * 1024 * 1024);
    closeSync(fd);
    write('tsconfig.json', `{"compilerOptions":{}, "x": "${'a'.repeat(3 * 1024 * 1024)}"}`);
    const fs = spyFs();
    const r = await run(fs);
    expect(fs.reads.find((x) => x.path === 'huge.bin')).toBeUndefined();
    expect(fs.reads.find((x) => x.path === 'tsconfig.json')).toBeUndefined();
    expect(r.inventory.files).toBeGreaterThanOrEqual(3);
    expect(fact(r, 'config.invalid')).toMatchObject([{ value: { file: 'tsconfig.json', error: 'too_large' } }]);
    expect(r.warnings).toContainEqual({ code: 'configTooLarge', path: 'tsconfig.json' });
    // Every read stays within the configuration limit.
    for (const x of fs.reads) expect(x.maxBytes).toBeLessThanOrEqual(LIMITS.maxConfigBytes);
  });

  it('does not follow folder links, and reads a file link only when its target is inside the root', async () => {
    const outside = tempRoot('ayar-DEV-4-outside-');
    try {
      writeFileSync(join(outside.dir, 'secret.txt'), 'outside');
      writeFileSync(join(outside.dir, 'package.json'), '{"name":"outside"}');
      write('real/package.json', '{"name":"inside"}');
      symlinkSync(outside.dir, join(root, 'external'));
      symlinkSync(join(root, 'real'), join(root, 'loop'));
      symlinkSync(join(outside.dir, 'package.json'), join(root, 'package.json'));
      symlinkSync(join(root, 'real', 'package.json'), join(root, 'inner.json'));
      symlinkSync(join(root, 'nowhere'), join(root, 'broken'));
      const fs = spyFs();
      const r = await run(fs);
      expect(r.inventory.symlinks).toEqual([
        { path: 'broken', kind: 'broken', inside: false },
        { path: 'external', kind: 'directory', inside: false },
        { path: 'inner.json', kind: 'file', inside: true },
        { path: 'loop', kind: 'directory', inside: true },
        { path: 'package.json', kind: 'file', inside: false },
      ]);
      expect(r.warnings).toEqual(expect.arrayContaining([{ code: 'symlinkOutside', path: 'external' }, { code: 'symlinkDirNotFollowed', path: 'loop' }, { code: 'symlinkOutside', path: 'package.json' }]));
      // Nothing outside the root was opened: the outside package.json is not the project's.
      expect(fs.reads.every((x) => !x.path.startsWith('/'))).toBe(true);
      expect(fact(r, 'node.package')).toEqual([]);
      expect(r.inventory.files).toBe(2); // real/package.json and inner.json
    } finally {
      outside.cleanup();
    }
  });

  it('respects nested .gitignore files, skips default folders, and sizes output folders', async () => {
    write('.gitignore', '*.log\nignored-dir/\n.ayar/ai-results/\n');
    write('app.log', 'x');
    write('ignored-dir/a.ts', 'x');
    write('sub/.gitignore', 'gen/\n');
    write('sub/gen/b.ts', 'x');
    write('sub/keep.ts', 'x');
    write('node_modules/x/index.js', 'x');
    write('dist/bundle.js', 'x'.repeat(1000));
    write('.ayar/ai-results/logic.json', '{"schema":"ai-result/1"}');
    const r = await run();
    expect(r.inventory.skipped).toEqual(
      expect.arrayContaining([
        { path: 'ignored-dir', reason: 'gitignore' },
        { path: 'node_modules', reason: 'default' },
        { path: 'sub/gen', reason: 'gitignore' },
      ]),
    );
    expect(r.inventory.outputDirs).toEqual([{ path: 'dist', sizeBytes: 1000, entries: 1, approximate: false }]);
    expect(r.inventory.byExtension.log).toBeUndefined();
    // AYAR's own folder is read even when Git ignores its results (C-06 point 9, Q-02).
    expect(fact(r, 'ayar.aiResults')[0]?.value).toEqual({ files: [{ path: '.ayar/ai-results/logic.json', size: 24, fingerprint: 'f' }] });
  });

  it('stops at the depth and entry limits and says the scan is partial', async () => {
    write('a/b/c/d/e.txt', 'x');
    const deep = await run(nodeFileSystem, { limits: { ...LIMITS, maxDepth: 2 } });
    expect(deep).toMatchObject({ partial: true, partialReasons: ['depth'] });
    expect(deep.warnings).toContainEqual({ code: 'partialScan', values: { reasons: 'depth', entries: expect.any(Number) as number } });
    for (let i = 0; i < 30; i++) write(`many/f${i}.txt`, 'x');
    const wide = await run(nodeFileSystem, { limits: { ...LIMITS, maxEntries: 10 } });
    expect(wide.partial).toBe(true);
    expect(wide.partialReasons).toContain('entries');
    expect(wide.inventory.entries).toBe(10);
  });

  it('is cancelled by its signal, before or during the walk', async () => {
    for (let i = 0; i < 40; i++) write(`d${i}/f.txt`, 'x');
    const before = new AbortController();
    before.abort();
    await expect(run(nodeFileSystem, { signal: before.signal })).rejects.toBeInstanceOf(DiscoveryCancelled);
    const during = new AbortController();
    const fs = spyFs();
    const slow: DiscoveryFs = { ...fs, readdirEntries: async (p) => (p.endsWith('/d3') && during.abort(), fs.readdirEntries(p)) };
    await expect(run(slow, { signal: during.signal })).rejects.toBeInstanceOf(DiscoveryCancelled);
  });

  it('reports a permission error on the root to the caller (C-05 turns it into guidance)', async () => {
    const denied: DiscoveryFs = { ...nodeFileSystem, readdirEntries: () => Promise.reject(Object.assign(new Error('EPERM'), { code: 'EPERM' })) };
    await expect(run(denied)).rejects.toMatchObject({ code: 'EPERM' });
  });
});

describe('facts with their sources (FR-05 to FR-07)', () => {
  it('finds workspace components and gives each its own facts (C-06 point 10)', async () => {
    write('package.json', JSON.stringify({ name: 'mono', private: true, workspaces: ['packages/*'], devDependencies: { vitest: '5.0.3' } }, null, 2));
    write('package-lock.json', '{}');
    write('packages/a/package.json', JSON.stringify({ name: '@m/a', scripts: { test: 'vitest run' } }, null, 2));
    write('packages/a/src/a.ts', 'export const a = 1;');
    write('packages/a/src/a.test.ts', 'x');
    write('packages/b/package.json', JSON.stringify({ name: '@m/b', exports: './index.js' }, null, 2));
    write('packages/b/index.js', 'export {}');
    write('packages/notes/readme.md', 'not a component (no package.json)');
    const r = await run();
    expect(r.components.map((c) => [c.id, c.name, c.kind])).toEqual([
      ['.', 'mono', 'root'],
      ['packages/a', '@m/a', 'workspace'],
      ['packages/b', '@m/b', 'workspace'],
    ]);
    expect(r.components[1]!.declaredBy).toEqual({ file: 'package.json', pointer: '/workspaces', line: 4 });
    expect(fact(r, 'node.script', 'packages/a')[0]).toMatchObject({ value: { name: 'test', kind: 'test' }, source: { file: 'packages/a/package.json', pointer: '/scripts/test', line: 4 }, proof: 'declared' });
    expect(fact(r, 'testing.files', 'packages/a')[0]?.value).toMatchObject({ unit: 1 });
    expect(fact(r, 'lang.files', '.')[0]?.value).toEqual({ md: 1 }); // the root's own files only: packages/notes is not a component
    expect(fact(r, 'type.library', 'packages/b')).toHaveLength(1);
    expect(fact(r, 'node.packageManager')[0]).toMatchObject({ value: { name: 'npm', version: null }, proof: 'inferred', source: { file: 'package-lock.json' } });
  });

  it('a pnpm-workspace.yaml without packages carries settings, not components (E-15 point 6)', async () => {
    write('package.json', '{"name":"x","packageManager":"pnpm@12.8.1"}');
    write('pnpm-workspace.yaml', 'minimumReleaseAgeExclude:\n  - foo\n');
    const r = await run();
    expect(r.components.map((c) => c.id)).toEqual(['.']);
    expect(fact(r, 'node.pnpmSettings')[0]?.value).toEqual({ keys: ['minimumReleaseAgeExclude'] });
    expect(fact(r, 'node.packageManager')[0]).toMatchObject({ value: { name: 'pnpm', version: '12.8.1' }, proof: 'declared', source: { pointer: '/packageManager', line: 1 } });
  });

  it('infers an extension whose manifest the build generates (CRXJS, E-15 point 1) and an Obsidian plugin (point 2)', async () => {
    write('package.json', JSON.stringify({ name: 'rasd-like', devDependencies: { '@crxjs/vite-plugin': '2.0.0', vite: '8.3.4' } }, null, 2));
    write('artifacts/design/ext/manifest.json', '{"manifest_version":3}');
    write('vite.config.ts', "export default { build: { outDir: 'artifacts/build' } }");
    let r = await run();
    expect(fact(r, 'type.browserExtension')[0]).toMatchObject({ value: { manifest: null, generated: true, framework: 'crxjs' }, proof: 'inferred' });
    expect(fact(r, 'references.buildOutput')[0]?.value).toEqual({ dir: 'artifacts/build', from: 'vite.config' });
    expect(fact(r, 'type.webApp')).toEqual([]);
    cleanup();
    ({ dir: root, cleanup } = tempRoot('ayar-DEV-4-discovery-'));
    write('package.json', JSON.stringify({ name: 'wasl-like', devDependencies: { obsidian: '1.8.0', esbuild: '0.25.0' } }, null, 2));
    write('manifest.json', JSON.stringify({ id: 'wasl', name: 'Wasl', version: '1.0.0', minAppVersion: '1.5.0' }, null, 2));
    write('test-vault/.obsidian/plugins/wasl/manifest.json', '{"id":"wasl","minAppVersion":"1.5.0"}');
    r = await run();
    expect(fact(r, 'type.obsidianPlugin')[0]).toMatchObject({ value: { manifest: 'manifest.json' }, proof: 'declared' });
    expect(fact(r, 'type.browserExtension')).toEqual([]);
    expect(r.components.map((c) => c.id)).toEqual(['.']);
  });

  it('reads Python projects: manager, lock, requirements, tools and the virtual environment by presence', async () => {
    write('pyproject.toml', '[project]\nname = "lib"\nrequires-python = ">=3.12"\ndependencies = ["requests>=2"]\n\n[tool.poetry]\nname = "lib"\n\n[tool.ruff]\nline-length = 100\n');
    write('poetry.lock', '');
    write('.venv/pyvenv.cfg', 'version = 3.12.13\n');
    write('tests/test_x.py', 'def test_x(): pass\n');
    const r = await run();
    expect(fact(r, 'python.manager')[0]).toMatchObject({ value: { name: 'poetry' }, source: { file: 'pyproject.toml', pointer: 'tool.poetry', line: 6 } });
    expect(fact(r, 'runtime.python')[0]).toMatchObject({ value: { spec: '>=3.12', from: 'requires-python' }, source: { line: 3 } });
    expect(fact(r, 'python.venv')[0]?.value).toEqual({ path: '.venv' });
    expect(fact(r, 'quality.tool').map((f) => f.value)).toContainEqual({ name: 'ruff', from: 'config', config: 'pyproject.toml' });
    expect(fact(r, 'testing.files')[0]?.value).toMatchObject({ pytest: 1 });
  });

  it('reads workflows as a source of commands only, and marks steps that are not runnable locally (10.5)', async () => {
    write('.github/workflows/ci.yml', 'jobs:\n  test:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n      - run: pnpm test\n      - run: deploy --token ${{ secrets.TOKEN }}\n');
    const r = await run();
    expect(fact(r, 'ci.workflow')[0]?.value).toMatchObject({
      file: '.github/workflows/ci.yml',
      nodeVersions: ['24'],
      usesSecrets: true,
      steps: [
        { job: 'test', uses: 'actions/setup-node@v4', run: null, localRunnable: false },
        { job: 'test', run: 'pnpm test', localRunnable: true },
        { job: 'test', localRunnable: false },
      ],
    });
  });

  it('records an invalid configuration as a fact and a warning, and refuses YAML alias bombs', async () => {
    write('package.json', '{ "name": broken }');
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x]', ...Array.from({ length: 9 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [*${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}]`)].join('\n');
    write('pnpm-workspace.yaml', `${bomb}\npackages:\n  - x\n`);
    const r = await run();
    expect(fact(r, 'config.invalid').map((f) => (f.value as { file: string }).file).sort()).toEqual(['package.json', 'pnpm-workspace.yaml']);
    expect(r.warnings).toContainEqual({ code: 'configInvalid', path: 'package.json' });
  });

  it('records the project identity from its root manifest (C-05 relocation)', async () => {
    write('package.json', '{"name":"ident"}');
    const r = await run();
    expect(fact(r, 'project.identity')[0]?.value).toEqual({ name: 'ident', file: 'package.json', fingerprint: 'f' });
  });
});

describe('Git from files (E-16, T2)', () => {
  const sha = (c: string) => c.repeat(40);

  it('reads the branch and commit from a loose ref, then from packed-refs, and a detached HEAD', async () => {
    write('.git/HEAD', 'ref: refs/heads/main\n');
    write('.git/refs/heads/main', `${sha('a')}\n`);
    write('.git/config', '[core]\n\tfsmonitor = "sh -c \'touch /tmp/never\'"\n[remote "origin"]\n\turl = https://user:tok@github.com/x/y.git\n');
    let r = await run();
    expect(fact(r, 'git.repository')[0]?.value).toMatchObject({ branch: 'main', commit: sha('a'), headSource: 'loose', confidence: 'confirmed', remoteHost: 'github.com', objectFormat: 'sha1' });
    expect(JSON.stringify(r)).not.toContain('tok@');
    write('.git/packed-refs', `# pack-refs\n${sha('b')} refs/heads/dev\n`);
    write('.git/HEAD', 'ref: refs/heads/dev\n');
    r = await run();
    expect(fact(r, 'git.repository')[0]?.value).toMatchObject({ branch: 'dev', commit: sha('b'), headSource: 'packed-refs' });
    write('.git/HEAD', `${sha('c')}\n`);
    r = await run();
    expect(fact(r, 'git.repository')[0]?.value).toMatchObject({ branch: null, commit: sha('c'), detached: true });
  });

  it('says unknown, with the reason, for a new repository; reads SHA-256, shallow and a linked work tree', async () => {
    write('.git/HEAD', 'ref: refs/heads/main\n');
    write('.git/config', '[extensions]\n\tobjectFormat = sha256\n');
    write('.git/shallow', '');
    let r = await run();
    expect(fact(r, 'git.repository')[0]).toMatchObject({ value: { commit: null, confidence: 'unknown', reason: 'missing_ref_or_new_repository', objectFormat: 'sha256', shallow: true }, proof: 'inferred' });
    // A linked work tree: .git is a file pointing at the main repository's worktrees/<name>.
    const main = tempRoot('ayar-DEV-4-git-main-');
    try {
      mkdirSync(join(main.dir, '.git/worktrees/wt/'), { recursive: true });
      writeFileSync(join(main.dir, '.git/worktrees/wt/HEAD'), 'ref: refs/heads/feature\n');
      writeFileSync(join(main.dir, '.git/worktrees/wt/commondir'), '../..\n');
      mkdirSync(join(main.dir, '.git/refs/heads'), { recursive: true });
      writeFileSync(join(main.dir, '.git/refs/heads/feature'), `${sha('d')}\n`);
      writeFileSync(join(main.dir, '.git/config'), '[core]\n');
      cleanup();
      ({ dir: root, cleanup } = tempRoot('ayar-DEV-4-discovery-'));
      write('.git', `gitdir: ${join(main.dir, '.git/worktrees/wt')}\n`);
      r = await run();
      expect(fact(r, 'git.repository')[0]?.value).toMatchObject({ branch: 'feature', commit: sha('d'), linkedWorktree: true });
    } finally {
      main.cleanup();
    }
  });

  it('keeps only the host of a remote URL', () => {
    expect(remoteHost('https://user:secret@github.com/a/b.git')).toBe('github.com');
    expect(remoteHost('git@gitlab.example.com:a/b.git')).toBe('gitlab.example.com');
    expect(remoteHost('not a url')).toBeNull();
  });
});

describe('scripts and parsers', () => {
  it('classifies scripts by name first, then content, skipping environment assignments (E-15 point 4)', () => {
    expect(classifyScript('build', 'tsc --noEmit && vite build')).toMatchObject({ kind: 'build', composite: true, tool: 'tsc' });
    expect(classifyScript('build:ff', 'RASD_TARGET=firefox vite build')).toMatchObject({ kind: 'build', tool: 'vite', envAssignments: ['RASD_TARGET'] });
    expect(classifyScript('test', 'NODE_OPTIONS=--max-old-space-size=4096 vitest run')).toMatchObject({ kind: 'test', tool: 'vitest', envAssignments: ['NODE_OPTIONS'] });
    expect(classifyScript('check', 'cross-env CI=1 vitest run')).toMatchObject({ kind: 'test', tool: 'vitest', envAssignments: ['CI'] });
    expect(classifyScript('e2e', 'playwright test')).toMatchObject({ kind: 'e2e' });
    expect(classifyScript('verify', 'playwright test --project=chromium')).toMatchObject({ kind: 'e2e' });
    expect(classifyScript('typecheck', 'svelte-check')).toMatchObject({ kind: 'typecheck' });
    expect(classifyScript('test:watch', 'vitest')).toMatchObject({ kind: 'other' });
    expect(classifyScript('version', 'git add -A && git commit')).toMatchObject({ kind: 'other', composite: true });
    const scripts = [classifyScript('test:coverage', 'vitest run --coverage'), classifyScript('test', 'vitest run'), classifyScript('test:unit', 'vitest run src')];
    expect(pickScript(scripts, 'test')?.name).toBe('test');
  });

  it('parses JSON with comments and trailing commas without touching strings', () => {
    expect(JSON.parse(stripJsonComments('{\n  // c\n  "a": "http://x//y", /* b */ "c": [1, 2,],\n}'))).toEqual({ a: 'http://x//y', c: [1, 2] });
    expect(parseConfig('{"a":1}', 'jsonc')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseConfig('a = [', 'toml').ok).toBe(false);
  });

  it('places keys on their lines', () => {
    const json = '{\n  "scripts": {\n    "test": "vitest"\n  }\n}';
    expect(lineOfJsonPath(json, ['scripts', 'test'])).toBe(3);
    const toml = '[project]\nname = "x"\n\n[tool.ruff]\nline-length = 1\n';
    expect(lineOfToml(toml, 'tool.ruff')).toBe(4);
    expect(lineOfToml(toml, 'project', 'name')).toBe(2);
  });
});


describe('node:test', () => {
  it('is declared by a script that runs node --test', async () => {
    write('package.json', JSON.stringify({ name: 'n', scripts: { test: 'node --test --test-reporter=spec' } }, null, 2));
    const r = await run();
    expect(fact(r, 'testing.framework')[0]).toMatchObject({ value: { name: 'node-test', from: 'script' }, source: { pointer: '/scripts/test' } });
  });
});
