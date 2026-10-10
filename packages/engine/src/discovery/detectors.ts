// C-06 point 7: independent, versioned detectors. Each reads known files through the ProjectReader (never a
// file the walk did not inventory) and returns facts with their source (file, pointer, line) and proof:
// «declared» when a configuration file says it, «inferred» when it is deduced from a pattern. The fact keys
// are the vocabulary C-09's signals and the AT-02 expectations are written in.
import type { Fact, FactSource } from '@ayar/protocol';
import { posix } from 'node:path';
import { isRecord, lineOf, lineOfJsonPath, lineOfToml, pointer, str } from './parse.ts';
import type { ProjectReader } from './reader.ts';
import { classifyScript, type ScriptInfo } from './scripts.ts';

export interface ComponentInfo {
  id: string;
  kind: 'root' | 'workspace';
  name: string | null;
  declaredBy: FactSource | null;
}

export interface DetectorContext {
  reader: ProjectReader;
  component: ComponentInfo;
  /** Files of this component (relative to the root), nested components excluded, sorted. */
  files: readonly string[];
  /** Folders of this component (relative to the root). */
  dirs: ReadonlySet<string>;
}

type Add = (key: string, value: unknown, source: FactSource | null, proof: Fact['proof']) => void;

export interface Detector {
  id: string;
  version: number;
  run(ctx: DetectorContext, add: Add): Promise<void>;
}

const at = (comp: string, rel: string) => (comp === '.' ? rel : `${comp}/${rel}`);
const src = (file: string, ptr: string, line: number | null): FactSource => ({ file, pointer: ptr, line });
const fileSource = (file: string): FactSource => ({ file, pointer: '', line: null });
const ext = (rel: string) => {
  const b = posix.basename(rel);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
};

/** Notable dependencies: test frameworks, quality tools, frameworks (C-06 table). */
const TEST_DEPS: Record<string, string> = {
  vitest: 'vitest',
  jest: 'jest',
  mocha: 'mocha',
  '@playwright/test': 'playwright',
  cypress: 'cypress',
  msw: 'msw',
  'fast-check': 'fast-check',
  '@stryker-mutator/core': 'stryker',
  storybook: 'storybook',
  '@pact-foundation/pact': 'pact',
};
const QUALITY_DEPS: Record<string, string> = {
  eslint: 'eslint',
  '@biomejs/biome': 'biome',
  prettier: 'prettier',
  typescript: 'typescript',
  knip: 'knip',
  'size-limit': 'size-limit',
  'svelte-check': 'svelte-check',
  'vue-tsc': 'vue-tsc',
};
const FRAMEWORK_DEPS = ['vite', 'svelte', '@sveltejs/kit', 'react', 'vue', 'next', 'astro', 'nuxt', 'wxt', '@crxjs/vite-plugin', 'plasmo', 'esbuild', 'rollup', 'webpack', 'electron', '@tauri-apps/api', '@tauri-apps/cli', 'obsidian', '@types/chrome', 'webextension-polyfill'];
const EXTENSION_FRAMEWORKS: Record<string, string> = { '@crxjs/vite-plugin': 'crxjs', wxt: 'wxt', plasmo: 'plasmo' };
const LOCKFILES: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
};

async function readPackageJson(ctx: DetectorContext): Promise<{ value: Record<string, unknown>; text: string; file: string } | null> {
  const file = at(ctx.component.id, 'package.json');
  const c = await ctx.reader.config(file, 'json');
  return c.ok && isRecord(c.value) ? { value: c.value, text: c.text, file } : null;
}

function deps(pkg: Record<string, unknown>): { name: string; version: string; field: string }[] {
  const out: { name: string; version: string; field: string }[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const d = pkg[field];
    if (isRecord(d)) for (const [name, version] of Object.entries(d)) out.push({ name, version: String(version), field });
  }
  return out;
}

export const nodePackage: Detector = {
  id: 'node-package',
  version: 1,
  async run(ctx, add) {
    const pkg = await readPackageJson(ctx);
    if (!pkg) return;
    const { value: p, text, file } = pkg;
    const engines = isRecord(p.engines) ? p.engines : {};
    add('node.package', { name: str(p.name), version: str(p.version), private: p.private === true, type: str(p.type) ?? 'commonjs', hasBin: p.bin !== undefined, hasExports: p.exports !== undefined || p.main !== undefined || p.module !== undefined }, src(file, '', 1), 'declared');
    const pm = str(p.packageManager);
    if (pm) {
      const m = /^([a-z]+)@([^+\s]+)/.exec(pm);
      add('node.packageManager', { name: m?.[1] ?? pm, version: m?.[2] ?? null, spec: pm }, src(file, '/packageManager', lineOfJsonPath(text, ['packageManager'])), 'declared');
    }
    if (typeof engines.node === 'string') add('runtime.node', { spec: engines.node, from: 'engines' }, src(file, '/engines/node', lineOfJsonPath(text, ['engines', 'node'])), 'declared');
    if (typeof engines.vscode === 'string') add('type.vscodeExtension', { engine: engines.vscode }, src(file, '/engines/vscode', lineOfJsonPath(text, ['engines', 'vscode'])), 'declared');
    if (p.bin !== undefined) add('type.cli', { from: 'bin' }, src(file, '/bin', lineOfJsonPath(text, ['bin'])), 'declared');
    if (isRecord(p.scripts)) {
      for (const [name, body] of Object.entries(p.scripts)) {
        if (typeof body !== 'string') continue;
        const info: ScriptInfo = classifyScript(name, body);
        add('node.script', info, src(file, pointer(['scripts', name]), lineOfJsonPath(text, ['scripts', name])), 'declared');
      }
    }
    const all = deps(p);
    const runtime = all.filter((d) => d.field !== 'devDependencies').length;
    const notable = Object.fromEntries(all.filter((d) => FRAMEWORK_DEPS.includes(d.name) || TEST_DEPS[d.name] || QUALITY_DEPS[d.name] || d.name.startsWith('@storybook/')).map((d) => [d.name, d.version]));
    add('node.dependencies', { count: all.length, runtime, dev: all.length - runtime, notable }, src(file, all.length ? `/${all[0]!.field}` : '', all.length ? lineOfJsonPath(text, [all[0]!.field]) : null), 'declared');
    for (const d of all) {
      const ptr = pointer([d.field, d.name]);
      const line = lineOfJsonPath(text, [d.field, d.name]);
      const t = TEST_DEPS[d.name] ?? (d.name.startsWith('@storybook/') ? 'storybook' : null);
      if (t) add('testing.framework', { name: t, from: 'dependency', version: d.version }, src(file, ptr, line), 'declared');
      const q = QUALITY_DEPS[d.name];
      if (q) add('quality.tool', { name: q, from: 'dependency', config: null }, src(file, ptr, line), 'declared');
      if (d.name === 'electron') add('type.desktopApp', { kind: 'electron' }, src(file, ptr, line), 'declared');
    }
    if (p['size-limit'] !== undefined) add('references.sizeBudgets', { from: 'package.json' }, src(file, '/size-limit', lineOfJsonPath(text, ['size-limit'])), 'declared');
    // Lock files of this component, and the manager they imply when packageManager is absent.
    const locks = Object.keys(LOCKFILES).filter((l) => ctx.reader.has(at(ctx.component.id, l)));
    for (const l of locks) add('node.lockfile', { file: at(ctx.component.id, l), manager: LOCKFILES[l] }, fileSource(at(ctx.component.id, l)), 'declared');
    if (!pm && locks.length) add('node.packageManager', { name: LOCKFILES[locks[0]!], version: null, spec: null }, fileSource(at(ctx.component.id, locks[0]!)), 'inferred');
  },
};

export const pnpmWorkspace: Detector = {
  id: 'pnpm-workspace',
  version: 1,
  async run(ctx, add) {
    if (ctx.component.id !== '.') return;
    const c = await ctx.reader.config('pnpm-workspace.yaml', 'yaml');
    if (!c.ok || !isRecord(c.value)) return;
    const packages = Array.isArray(c.value.packages) ? c.value.packages.filter((x): x is string => typeof x === 'string') : [];
    if (packages.length) add('node.workspaces', { patterns: packages, file: 'pnpm-workspace.yaml' }, src('pnpm-workspace.yaml', '/packages', lineOf(c.text, 'packages')), 'declared');
    else add('node.pnpmSettings', { keys: Object.keys(c.value).sort() }, src('pnpm-workspace.yaml', '', 1), 'declared');
  },
};

export const nodeWorkspaces: Detector = {
  id: 'node-workspaces',
  version: 1,
  async run(ctx, add) {
    if (ctx.component.id !== '.') return;
    const pkg = await readPackageJson(ctx);
    const w = pkg?.value.workspaces;
    const patterns = Array.isArray(w) ? w : isRecord(w) && Array.isArray(w.packages) ? w.packages : [];
    const list = patterns.filter((x): x is string => typeof x === 'string');
    if (pkg && list.length) add('node.workspaces', { patterns: list, file: 'package.json' }, src(pkg.file, '/workspaces', lineOfJsonPath(pkg.text, ['workspaces'])), 'declared');
  },
};

export const python: Detector = {
  id: 'python',
  version: 1,
  async run(ctx, add) {
    const c = ctx.component.id;
    const pyFile = at(c, 'pyproject.toml');
    const py = await ctx.reader.config(pyFile, 'toml');
    const tool = py.ok && isRecord(py.value) && isRecord(py.value.tool) ? py.value.tool : {};
    let manager: { name: string; source: FactSource; proof: Fact['proof'] } | null = null;
    if (py.ok && isRecord(py.value)) {
      const v = py.value;
      const t = py.text;
      if (isRecord(v.project)) {
        const proj = v.project;
        add('python.project', { name: str(proj.name), version: str(proj.version), requiresPython: str(proj['requires-python']) }, src(pyFile, 'project', lineOfToml(t, 'project')), 'declared');
        if (typeof proj['requires-python'] === 'string') add('runtime.python', { spec: proj['requires-python'], from: 'requires-python' }, src(pyFile, 'project.requires-python', lineOfToml(t, 'project', 'requires-python')), 'declared');
        if (isRecord(proj.scripts)) add('type.cli', { from: 'project.scripts' }, src(pyFile, 'project.scripts', lineOfToml(t, 'project.scripts')), 'declared');
      }
      const runtimeDeps = isRecord(v.project) && Array.isArray(v.project.dependencies) ? v.project.dependencies.length : 0;
      const groups: Record<string, number> = {};
      if (isRecord(v['dependency-groups'])) for (const [g, list] of Object.entries(v['dependency-groups'])) if (Array.isArray(list)) groups[g] = list.length;
      if (isRecord(v.project) && isRecord(v.project['optional-dependencies'])) for (const [g, list] of Object.entries(v.project['optional-dependencies'])) if (Array.isArray(list)) groups[`optional:${g}`] = list.length;
      const devNames = Object.values(isRecord(v['dependency-groups']) ? v['dependency-groups'] : {}).flatMap((l): unknown[] => (Array.isArray(l) ? (l as unknown[]) : [])).filter((x): x is string => typeof x === 'string').map((x) => x.split(/[<>=!~ ;[]/)[0]!.toLowerCase());
      const allNames = [...devNames, ...(isRecord(v.project) && Array.isArray(v.project.dependencies) ? v.project.dependencies.filter((x): x is string => typeof x === 'string').map((x) => x.split(/[<>=!~ ;[]/)[0]!.toLowerCase()) : [])];
      add('python.dependencies', { count: runtimeDeps + Object.values(groups).reduce((a, b) => a + b, 0), runtime: runtimeDeps, groups }, src(pyFile, 'project.dependencies', lineOfToml(t, 'project', 'dependencies')), 'declared');
      // The build front end the project itself declares (`build` in its dependencies), if any.
      if (isRecord(v['build-system'])) add('python.buildSystem', { backend: str(v['build-system']['build-backend']), frontend: allNames.includes('build') ? 'build' : null }, src(pyFile, 'build-system', lineOfToml(t, 'build-system')), 'declared');
      if (isRecord(tool.poetry)) manager = { name: 'poetry', source: src(pyFile, 'tool.poetry', lineOfToml(t, 'tool.poetry')), proof: 'declared' };
      else if (isRecord(tool.uv)) manager = { name: 'uv', source: src(pyFile, 'tool.uv', lineOfToml(t, 'tool.uv')), proof: 'declared' };
      // Tool configuration sections: test framework and quality tools.
      if (isRecord(tool.pytest)) add('testing.framework', { name: 'pytest', from: 'config', version: null }, src(pyFile, 'tool.pytest.ini_options', lineOfToml(t, 'tool.pytest.ini_options')), 'declared');
      for (const q of ['ruff', 'mypy', 'pyright'] as const) if (isRecord(tool[q])) add('quality.tool', { name: q, from: 'config', config: pyFile }, src(pyFile, `tool.${q}`, lineOfToml(t, `tool.${q}`)), 'declared');
      for (const name of ['pytest', 'hypothesis', 'ruff', 'mypy', 'pyright', 'pip-audit']) {
        if (!allNames.includes(name)) continue;
        const line = lineOf(t, `"${name}`);
        if (name === 'pytest' || name === 'hypothesis') add('testing.framework', { name, from: 'dependency', version: null }, src(pyFile, 'dependency-groups', line), 'declared');
        else add('quality.tool', { name, from: 'dependency', config: null }, src(pyFile, 'dependency-groups', line), 'declared');
      }
    }
    // Lock files and manager evidence (C-06 «المنظومة»).
    const locks: Record<string, string> = { 'uv.lock': 'uv', 'poetry.lock': 'poetry', 'Pipfile.lock': 'pipenv' };
    for (const [l, m] of Object.entries(locks)) {
      if (!ctx.reader.has(at(c, l))) continue;
      add('python.lockfile', { file: at(c, l), manager: m }, fileSource(at(c, l)), 'declared');
      manager ??= { name: m, source: fileSource(at(c, l)), proof: 'declared' };
    }
    if (ctx.reader.has(at(c, 'Pipfile'))) manager ??= { name: 'pipenv', source: fileSource(at(c, 'Pipfile')), proof: 'declared' };
    const requirements = ctx.files.filter((f) => posix.dirname(f) === (c === '.' ? '.' : c) && /^requirements[\w.-]*\.txt$/.test(posix.basename(f)));
    for (const r of requirements) {
      const t = await ctx.reader.text(r);
      const lines = t.ok ? t.text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('-')).length : 0;
      add('python.requirements', { file: r, count: lines }, fileSource(r), 'declared');
    }
    if (requirements.length) manager ??= { name: 'pip', source: fileSource(requirements[0]!), proof: 'inferred' };
    if (manager) add('python.manager', { name: manager.name }, manager.source, manager.proof);
    for (const f of ['pytest.ini', 'conftest.py', 'tests/conftest.py', 'test/conftest.py']) if (ctx.reader.has(at(c, f))) add('testing.framework', { name: 'pytest', from: 'config', version: null }, fileSource(at(c, f)), 'declared');
    for (const [f, q] of [['ruff.toml', 'ruff'], ['.ruff.toml', 'ruff'], ['mypy.ini', 'mypy'], ['.mypy.ini', 'mypy'], ['pyrightconfig.json', 'pyright']] as const) if (ctx.reader.has(at(c, f))) add('quality.tool', { name: q, from: 'config', config: at(c, f) }, fileSource(at(c, f)), 'declared');
    // A virtual environment in the component (skipped by the walk, recorded by presence).
    const venv = ctx.reader.walk.skipped.find((s) => s.path === at(c, '.venv') || s.path === at(c, 'venv'));
    if (venv) add('python.venv', { path: venv.path }, null, 'declared');
  },
};

export const runtimeFiles: Detector = {
  id: 'runtime-files',
  version: 1,
  async run(ctx, add) {
    const c = ctx.component.id;
    for (const [f, from] of [['.nvmrc', 'nvmrc'], ['.node-version', 'node-version']] as const) {
      const t = await ctx.reader.text(at(c, f), 4096);
      const spec = t.ok ? t.text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) : null;
      if (spec) add('runtime.node', { spec, from }, src(at(c, f), '', 1), 'declared');
    }
    const pv = await ctx.reader.text(at(c, '.python-version'), 4096);
    const pspec = pv.ok ? pv.text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) : null;
    if (pspec) add('runtime.python', { spec: pspec, from: 'python-version' }, src(at(c, '.python-version'), '', 1), 'declared');
    const tv = await ctx.reader.text(at(c, '.tool-versions'), 64 * 1024);
    if (tv.ok) {
      tv.text.split('\n').forEach((line, i) => {
        const m = /^\s*(nodejs|node|python)\s+(\S+)/.exec(line);
        if (m) add(m[1] === 'python' ? 'runtime.python' : 'runtime.node', { spec: m[2], from: 'tool-versions' }, src(at(c, '.tool-versions'), '', i + 1), 'declared');
      });
    }
    for (const f of ['mise.toml', '.mise.toml']) {
      const m = await ctx.reader.config(at(c, f), 'toml');
      if (!m.ok || !isRecord(m.value) || !isRecord(m.value.tools)) continue;
      for (const [k, v] of Object.entries(m.value.tools)) {
        const spec = typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
        if (spec && (k === 'node' || k === 'python')) add(`runtime.${k}`, { spec, from: 'mise' }, src(at(c, f), `tools.${k}`, lineOfToml(m.text, 'tools', k)), 'declared');
      }
    }
  },
};

const MANIFEST_CANDIDATES = ['manifest.json', 'src/manifest.json', 'public/manifest.json', 'static/manifest.json'];

export const extension: Detector = {
  id: 'extension',
  version: 1,
  async run(ctx, add) {
    const c = ctx.component.id;
    let found = false;
    for (const cand of MANIFEST_CANDIDATES) {
      const file = at(c, cand);
      const m = await ctx.reader.config(file, 'jsonc');
      if (!m.ok || !isRecord(m.value)) continue;
      const v = m.value;
      if (typeof v.manifest_version === 'number') {
        found = true;
        const perms = Array.isArray(v.permissions) ? v.permissions.length : 0;
        const hosts = Array.isArray(v.host_permissions) ? v.host_permissions.length : 0;
        add('type.browserExtension', { manifest: file, manifestVersion: v.manifest_version, generated: false, framework: null, permissions: perms, hostPermissions: hosts }, src(file, '/manifest_version', lineOfJsonPath(m.text, ['manifest_version'])), 'declared');
        add('references.manifest', { path: file, generated: false }, src(file, '', 1), 'declared');
        if (typeof v.default_locale === 'string') add('ui.defaultLocale', { value: v.default_locale }, src(file, '/default_locale', lineOfJsonPath(m.text, ['default_locale'])), 'declared');
        break;
      }
      if (typeof v.minAppVersion === 'string' && typeof v.id === 'string') {
        found = true;
        add('type.obsidianPlugin', { manifest: file, minAppVersion: v.minAppVersion }, src(file, '/minAppVersion', lineOfJsonPath(m.text, ['minAppVersion'])), 'declared');
        break;
      }
    }
    if (!found) {
      // A manifest the build generates (CRXJS, WXT, Plasmo): the extension is inferred from its framework (E-15 point 1).
      const pkg = await readPackageJson(ctx);
      const fw = pkg ? deps(pkg.value).find((d) => EXTENSION_FRAMEWORKS[d.name]) : undefined;
      if (pkg && fw) {
        const source = src(pkg.file, pointer([fw.field, fw.name]), lineOfJsonPath(pkg.text, [fw.field, fw.name]));
        add('type.browserExtension', { manifest: null, manifestVersion: null, generated: true, framework: EXTENSION_FRAMEWORKS[fw.name], permissions: null, hostPermissions: null }, source, 'inferred');
        add('references.manifest', { path: null, generated: true }, source, 'inferred');
      } else if (pkg) {
        const obs = deps(pkg.value).find((d) => d.name === 'obsidian');
        if (obs) add('type.obsidianPlugin', { manifest: null, minAppVersion: null }, src(pkg.file, pointer([obs.field, obs.name]), lineOfJsonPath(pkg.text, [obs.field, obs.name])), 'inferred');
      }
    }
    // Extension locales: _locales/<lang>/messages.json.
    const localeFiles = ctx.files.filter((f) => /(^|\/)_locales\/[^/]+\/messages\.json$/.test(f));
    if (localeFiles.length) {
      const dir = localeFiles[0]!.replace(/\/[^/]+\/messages\.json$/, '');
      const languages = [...new Set(localeFiles.map((f) => /_locales\/([^/]+)\//.exec(f)![1]!))].sort();
      add('ui.locales', { dir, languages }, fileSource(localeFiles[0]!), 'declared');
    }
  },
};

const BUILD_CONFIGS: [RegExp, string][] = [
  [/^vite\.config\.(ts|js|mjs|mts|cjs|cts)$/, 'vite'],
  [/^next\.config\.(js|mjs|ts|cjs)$/, 'next'],
  [/^astro\.config\.(mjs|js|ts|mts)$/, 'astro'],
  [/^svelte\.config\.(js|mjs|ts)$/, 'svelte'],
  [/^nuxt\.config\.(ts|js|mjs)$/, 'nuxt'],
  [/^wxt\.config\.(ts|js|mjs)$/, 'wxt'],
];
const RTL_LANGS = /^(ar|fa|he|ur|ps|ku|yi|dv|sd|ug)(-|$)/i;

export const web: Detector = {
  id: 'web',
  version: 1,
  async run(ctx, add) {
    const c = ctx.component.id;
    const rootFiles = ctx.files.filter((f) => posix.dirname(f) === c);
    for (const f of rootFiles) {
      const name = posix.basename(f);
      const hit = BUILD_CONFIGS.find(([re]) => re.test(name));
      if (!hit) continue;
      add('build.tool', { name: hit[1], config: f }, fileSource(f), 'declared');
      if (hit[1] === 'vite') {
        const t = await ctx.reader.text(f, 512 * 1024);
        const m = t.ok ? /outDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(t.text) : null;
        add('references.buildOutput', { dir: at(c, (m?.[1] ?? 'dist').replace(/^\.\//, '').replace(/\/+$/, '')), from: m ? 'vite.config' : 'default' }, m && t.ok ? src(f, 'build.outDir', lineOf(t.text, m[0])) : fileSource(f), 'inferred');
      }
    }
    // Desktop shells (C-06 «النوع»).
    if (ctx.reader.has(at(c, 'src-tauri/tauri.conf.json'))) add('type.desktopApp', { kind: 'tauri' }, fileSource(at(c, 'src-tauri/tauri.conf.json')), 'declared');
    if (ctx.reader.has(at(c, 'Package.swift'))) add('type.desktopApp', { kind: 'swift' }, fileSource(at(c, 'Package.swift')), 'declared');
    const xcode = [...ctx.dirs].find((d) => posix.dirname(d) === c && d.endsWith('.xcodeproj'));
    if (xcode) add('type.desktopApp', { kind: 'xcode' }, fileSource(xcode), 'declared');
    // Entry pages, and the right-to-left languages they declare.
    const pages = ctx.files.filter((f) => ext(f) === 'html' && [c, at(c, 'public'), at(c, 'src')].includes(posix.dirname(f)));
    if (pages.length) add('ui.entryPages', { files: pages }, fileSource(pages[0]!), 'inferred');
    const rtlFiles: string[] = [];
    const languages = new Set<string>();
    let first: FactSource | null = null;
    const ui = [...pages, ...ctx.files.filter((f) => ['svelte', 'vue', 'astro'].includes(ext(f))).slice(0, 40)];
    for (const f of ui) {
      const h = await ctx.reader.head(f, 64 * 1024);
      if (!h.ok) continue;
      const dir = /\bdir\s*=\s*["']rtl["']/i.exec(h.text);
      const lang = /<html[^>]*\blang\s*=\s*["']([A-Za-z-]+)["']/i.exec(h.text);
      if (lang && RTL_LANGS.test(lang[1]!)) languages.add(lang[1]!.toLowerCase());
      if (dir || (lang && RTL_LANGS.test(lang[1]!))) {
        rtlFiles.push(f);
        first ??= src(f, '', lineOf(h.text, (dir ?? lang)![0]));
      }
    }
    if (rtlFiles.length) add('ui.rtl', { files: rtlFiles, languages: [...languages].sort() }, first, 'declared');
    // Translation files that name a right-to-left language (Tauri and web apps, E-15 point 11).
    const i18n = ctx.files.filter((f) => /(^|\/)(i18n|locales?|lang|translations)\/[^/]*\.(json|ts|js|ya?ml)$/i.test(f) && !/_locales\//.test(f));
    const i18nLangs = [...new Set(i18n.map((f) => posix.basename(f).replace(/\.[^.]+$/, '')).filter((n) => /^[a-z]{2}([-_][A-Za-z]{2})?$/.test(n)))].sort();
    if (i18nLangs.length) add('ui.languages', { languages: i18nLangs, files: i18n.slice(0, 20) }, fileSource(i18n[0]!), 'inferred');
  },
};

const TEST_PATTERNS = {
  unit: /\.(test|spec)\.[cm]?[jt]sx?$/,
  pytest: /(^|\/)(test_[^/]*|[^/]*_test)\.py$/,
  stories: /\.stories\.[cm]?[jt]sx?$/,
  k6: /\.k6\.[cm]?[jt]s$|(^|\/)locustfile\.py$/,
};

export const testing: Detector = {
  id: 'testing',
  version: 1,
  async run(ctx, add) {
    const c = ctx.component.id;
    // Configuration files of the frameworks.
    for (const f of ctx.files.filter((x) => posix.dirname(x) === c)) {
      const n = posix.basename(f);
      const fw = /^vitest\.(config|workspace)\./.test(n) ? 'vitest' : /^jest\.config\./.test(n) ? 'jest' : /^playwright\.config\./.test(n) ? 'playwright' : /^cypress\.config\./.test(n) ? 'cypress' : /^\.mocharc/.test(n) ? 'mocha' : /^stryker\.conf/.test(n) ? 'stryker' : null;
      if (fw) add('testing.framework', { name: fw, from: 'config', version: null }, fileSource(f), 'declared');
    }
    if ([...ctx.dirs].some((d) => d === at(c, '.storybook'))) add('testing.framework', { name: 'storybook', from: 'config', version: null }, fileSource(at(c, '.storybook')), 'declared');
    // The Playwright test folder, when its configuration names one.
    let e2eDir = at(c, 'e2e');
    const pwConfig = ctx.files.find((f) => posix.dirname(f) === c && /^playwright\.config\./.test(posix.basename(f)));
    if (pwConfig) {
      const t = await ctx.reader.text(pwConfig, 256 * 1024);
      const m = t.ok ? /testDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(t.text) : null;
      if (m) e2eDir = at(c, m[1]!.replace(/^\.\//, '').replace(/\/+$/, ''));
      // Several Playwright projects (browsers, sizes) declare a compatibility matrix (perf.compat).
      const projects = t.ok ? /\bprojects\s*:\s*\[/.exec(t.text) : null;
      if (t.ok && projects) {
        const count = (t.text.slice(projects.index).match(/\bname\s*:/g) ?? []).length;
        if (count) add('testing.playwrightProjects', { count }, src(pwConfig, 'projects', lineOf(t.text, projects[0])), 'inferred');
      }
    }
    const underE2e = (f: string) => f.startsWith(`${e2eDir}/`) || /(^|\/)(e2e|tests\/e2e)\//.test(f);
    const counts = {
      unit: ctx.files.filter((f) => TEST_PATTERNS.unit.test(f) && !underE2e(f)).length,
      e2e: ctx.files.filter((f) => underE2e(f) && /\.(spec|test)\.[cm]?[jt]sx?$/.test(f)).length,
      pytest: ctx.files.filter((f) => TEST_PATTERNS.pytest.test(f)).length,
      stories: ctx.files.filter((f) => TEST_PATTERNS.stories.test(f)).length,
      load: ctx.files.filter((f) => TEST_PATTERNS.k6.test(f)).length,
    };
    add('testing.files', counts, null, 'inferred');
  },
};

export const qualityConfig: Detector = {
  id: 'quality-config',
  version: 1,
  run(ctx, add) {
    const c = ctx.component.id;
    const rules: [RegExp, string][] = [
      [/^eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/, 'eslint'],
      [/^\.eslintrc(\.(json|js|cjs|yml|yaml))?$/, 'eslint'],
      [/^biome\.jsonc?$/, 'biome'],
      [/^(\.prettierrc(\.(json|js|cjs|mjs|ya?ml|toml))?|prettier\.config\.(js|cjs|mjs|ts))$/, 'prettier'],
      [/^tsconfig(\.[\w-]+)?\.json$/, 'typescript'],
      [/^(knip\.json|knip\.jsonc|\.knip\.json|knip\.config\.(ts|js))$/, 'knip'],
      [/^\.semgrep\.ya?ml$/, 'semgrep'],
      [/^\.gitleaks\.toml$/, 'gitleaks'],
      [/^osv-scanner\.toml$/, 'osv-scanner'],
      [/^lychee\.toml$/, 'lychee'],
      [/^\.size-limit\.(json|js|cjs|mjs|ts)$/, 'size-limit'],
    ];
    for (const f of ctx.files.filter((x) => posix.dirname(x) === c)) {
      const hit = rules.find(([re]) => re.test(posix.basename(f)));
      if (!hit) continue;
      add('quality.tool', { name: hit[1], from: 'config', config: f }, fileSource(f), 'declared');
      if (hit[1] === 'size-limit') add('references.sizeBudgets', { from: f }, fileSource(f), 'declared');
    }
    return Promise.resolve();
  },
};

export const references: Detector = {
  id: 'references',
  version: 1,
  async run(ctx, add) {
    const c = ctx.component.id;
    for (const f of ctx.files.filter((x) => /(^|\/)([\w.-]*\.tokens\.json|tokens\.json|design-tokens\.json)$/.test(x))) add('references.tokens', { path: f, format: 'dtcg' }, fileSource(f), 'declared');
    for (const f of ctx.files.filter((x) => /(^|\/)(sd|style-dictionary)\.config\.(json|js|mjs|cjs|ts)$/.test(x))) add('references.tokens', { path: f, format: 'style-dictionary' }, fileSource(f), 'declared');
    const css = ctx.files.filter((f) => ['css', 'scss'].includes(ext(f))).slice(0, 50);
    const vars: string[] = [];
    const themes: string[] = [];
    const fonts: string[] = [];
    let fontFaces = 0;
    for (const f of css) {
      const h = await ctx.reader.head(f, 128 * 1024);
      if (!h.ok) continue;
      if (/:root\s*\{[^}]*--[\w-]+\s*:/.test(h.text)) vars.push(f);
      if (/@theme\b/.test(h.text)) themes.push(f);
      const n = (h.text.match(/@font-face\b/g) ?? []).length;
      if (n) {
        fontFaces += n;
        fonts.push(f);
      }
    }
    if (vars.length) add('references.cssVariables', { files: vars }, fileSource(vars[0]!), 'inferred');
    if (themes.length) add('references.tailwindTheme', { files: themes }, fileSource(themes[0]!), 'declared');
    if (fontFaces) add('references.fontFaces', { count: fontFaces, files: fonts }, fileSource(fonts[0]!), 'declared');
    if ([...ctx.dirs].some((d) => d === at(c, '.storybook'))) add('references.storybook', { dir: at(c, '.storybook') }, fileSource(at(c, '.storybook')), 'declared');
    for (const f of ctx.files.filter((x) => /(^|\/)(openapi|swagger)[\w.-]*\.(ya?ml|json)$/i.test(x))) add('references.openapi', { path: f }, fileSource(f), 'declared');
    for (const name of ['permissions-policy.json', '.ayar/permissions-policy.json']) {
      const f = at(c, name);
      if (!ctx.reader.has(f)) continue;
      const p = await ctx.reader.config(f, 'json');
      add('references.permissionsPolicy', { path: f, valid: p.ok && isRecord(p.value) }, fileSource(f), 'declared');
    }
  },
};

export const languages: Detector = {
  id: 'languages',
  version: 1,
  run(ctx, add) {
    const counts: Record<string, number> = {};
    const KNOWN = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'py', 'css', 'scss', 'html', 'md', 'svelte', 'vue', 'astro', 'rs', 'go', 'swift'];
    for (const f of ctx.files) {
      const e = ext(f);
      if (KNOWN.includes(e)) counts[e] = (counts[e] ?? 0) + 1;
    }
    add('lang.files', counts, null, 'inferred');
    return Promise.resolve();
  },
};

export const otherEcosystems: Detector = {
  id: 'other-ecosystems',
  version: 1,
  run(ctx, add) {
    const c = ctx.component.id;
    for (const [f, kind] of [['Cargo.toml', 'rust'], ['src-tauri/Cargo.toml', 'rust'], ['go.mod', 'go'], ['Package.swift', 'swift']] as const) {
      if (ctx.reader.has(at(c, f))) add('ecosystem.other', { kind, file: at(c, f) }, fileSource(at(c, f)), 'declared');
    }
    return Promise.resolve();
  },
};

/** Detectors run for every component, in this order. */
export const COMPONENT_DETECTORS: readonly Detector[] = [nodePackage, nodeWorkspaces, pnpmWorkspace, python, runtimeFiles, extension, web, testing, qualityConfig, references, languages, otherEcosystems];
