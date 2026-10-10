// C-06: one discovery from start to finish, read-only (D-05): the root files that declare workspaces, the walk,
// the components, the detectors per component, the project-wide detectors (Git from files, sensitive names,
// AYAR's own files in the repository, workflows, broken configuration), then the inventory and the warnings.
// The result is not yet a snapshot: the manager redacts it (C-18) and computes the spec hashes (C-09) before
// saving it (C-17). A cancelled discovery throws DiscoveryCancelled and leaves nothing behind.
import type { DiscoveryComponent, DiscoveryWarning, Fact, FactSource, Inventory } from '@ayar/protocol';
import { posix } from 'node:path';
import { componentOf, matchesWorkspace, workspaceDecls } from './components.ts';
import { COMPONENT_DETECTORS, type ComponentInfo, type DetectorContext } from './detectors.ts';
import { readGitInfo } from './git.ts';
import { readIdentity } from '../projects/identity.ts';
import { isRecord, str } from './parse.ts';
import { ProjectReader } from './reader.ts';
import { DiscoveryCancelled, walk, type DiscoveryFs, type DiscoveryLimits, type WalkResult } from './walker.ts';

export const SCANNER_VERSION = 'discovery/1.1.0';
/** Configuration files C-06 knows by name (C-06 point 5). */
const KNOWN_CONFIG = /^(package\.json|pnpm-workspace\.yaml|tsconfig(\.[\w-]+)?\.json|jsconfig\.json|pyproject\.toml|manifest\.json|biome\.jsonc?|\.eslintrc(\.\w+)?|eslint\.config\.\w+|(vite|vitest|playwright|jest|svelte|next|astro|nuxt|wxt)\.config\.\w+|mise\.toml|\.tool-versions|\.nvmrc|\.node-version|\.python-version|pytest\.ini|ruff\.toml|mypy\.ini|knip\.json)$/;
const TEST_PATH_CAP = 500;

export interface DiscoverOptions {
  root: string;
  fs: DiscoveryFs;
  limits: DiscoveryLimits;
  signal: AbortSignal;
  /** HMAC of a file's content (C-18 fingerprints), for AYAR's model-result files. */
  fingerprint: (data: Uint8Array) => string;
  onProgress?: (p: { filesSeen: number; dirsSeen: number; currentDir: string; markers: ReadonlySet<string> }) => void;
}

export interface DiscoveryResult {
  components: DiscoveryComponent[];
  facts: Fact[];
  inventory: Inventory;
  warnings: DiscoveryWarning[];
  partial: boolean;
  partialReasons: ('depth' | 'entries')[];
  /** Files opened, with the byte limit asked for (evidence that .env and huge files were not read). */
  opened: { path: string; maxBytes: number }[];
}

async function rootText(o: DiscoverOptions, name: string): Promise<string | null> {
  const path = posix.join(o.root, name);
  const st = await o.fs.lstat(path);
  if (!st?.isFile || st.size > o.limits.maxConfigBytes) return null;
  try {
    return new TextDecoder().decode((await o.fs.readFilePrefix(path, o.limits.maxConfigBytes)).data);
  } catch {
    return null;
  }
}

function inventoryOf(w: WalkResult): Inventory {
  const byExtension: Record<string, number> = {};
  let totalBytes = 0;
  for (const [rel, f] of w.files) {
    totalBytes += f.size;
    const base = posix.basename(rel);
    const i = base.lastIndexOf('.');
    const e = i > 0 ? base.slice(i + 1).toLowerCase() : '(none)';
    byExtension[e] = (byExtension[e] ?? 0) + 1;
  }
  // The inventory lists test files by file pattern only; the testing detector splits unit from journeys.
  const kinds: Record<string, RegExp> = {
    jsTests: /\.(test|spec)\.[cm]?[jt]sx?$/,
    pyTests: /(^|\/)(test_[^/]*|[^/]*_test)\.py$/,
    stories: /\.stories\.[cm]?[jt]sx?$/,
  };
  const testFiles: Inventory['testFiles'] = {};
  const files = [...w.files.keys()].sort();
  for (const [kind, re] of Object.entries(kinds)) {
    const paths = files.filter((f) => re.test(f));
    testFiles[kind] = { count: paths.length, paths: paths.slice(0, TEST_PATH_CAP), truncated: paths.length > TEST_PATH_CAP };
  }
  return {
    entries: w.entries,
    files: w.files.size,
    dirs: w.dirs.size,
    totalBytes,
    byExtension,
    testFiles,
    skipped: w.skipped,
    outputDirs: w.outputDirs,
    symlinks: w.symlinks,
    sensitiveFiles: w.sensitive,
  };
}

export async function discover(o: DiscoverOptions): Promise<DiscoveryResult> {
  // 1. Workspace declarations and build output folders, from the root files, before the walk.
  const decls = workspaceDecls({
    packageJson: await rootText(o, 'package.json'),
    pnpmWorkspace: await rootText(o, 'pnpm-workspace.yaml'),
    pyproject: await rootText(o, 'pyproject.toml'),
  });
  const extraOutputDirs = new Set<string>();
  for (const name of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts']) {
    const t = await rootText(o, name);
    const m = t ? /outDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(t) : null;
    const dir = m?.[1]?.replace(/^\.\//, '').replace(/\/+$/, '');
    if (dir && !dir.startsWith('/') && !dir.split('/').includes('..')) extraOutputDirs.add(dir);
  }

  // 2. The walk.
  const w = await walk({ root: o.root, fs: o.fs, limits: o.limits, signal: o.signal, extraOutputDirs, isComponentRoot: (rel) => matchesWorkspace(rel, decls) !== null, ...(o.onProgress ? { onProgress: o.onProgress } : {}) });
  const reader = new ProjectReader(o.root, o.fs, w, o.limits.maxConfigBytes);

  // 3. Components: the root, and each workspace folder that holds a package.json or pyproject.toml.
  const components: ComponentInfo[] = [{ id: '.', kind: 'root', name: null, declaredBy: null }];
  for (const dir of [...w.dirs].sort()) {
    const d = matchesWorkspace(dir, decls);
    if (!d) continue;
    if (!reader.has(`${dir}/package.json`) && !reader.has(`${dir}/pyproject.toml`)) continue;
    components.push({ id: dir, kind: 'workspace', name: null, declaredBy: d.source });
  }
  const ids = components.map((c) => c.id);
  const filesByComponent = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const rel of [...w.files.keys()].sort()) filesByComponent.get(componentOf(rel, ids))!.push(rel);
  const dirsByComponent = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const rel of w.dirs) dirsByComponent.get(rel === '.' ? '.' : componentOf(rel, ids))!.add(rel);

  // 4. Detectors per component.
  const facts: Fact[] = [];
  for (const comp of components) {
    if (o.signal.aborted) throw new DiscoveryCancelled();
    const ctx: DetectorContext = { reader, component: comp, files: filesByComponent.get(comp.id)!, dirs: dirsByComponent.get(comp.id)! };
    for (const d of COMPONENT_DETECTORS) {
      await d.run(ctx, (key, value, source, proof) => facts.push({ key, component: comp.id, value: value as Fact['value'], source: bounded(source), proof, detector: `${d.id}@${d.version}` }));
    }
    deriveTypes(facts, comp.id);
    const pkg = facts.find((f) => f.component === comp.id && f.key === 'node.package');
    const py = facts.find((f) => f.component === comp.id && f.key === 'python.project');
    comp.name = (isRecord(pkg?.value) ? str(pkg.value.name) : null) ?? (isRecord(py?.value) ? str(py.value.name) : null);
  }

  // 5. Project-wide detectors.
  const project = (key: string, value: unknown, source: FactSource | null, proof: Fact['proof'], detector: string) =>
    facts.push({ key, component: '.', value: value as Fact['value'], source, proof, detector });
  const identity = await readIdentity(async (file) => {
    const t = await reader.text(file);
    return t.ok ? t.text : null;
  }, o.fingerprint);
  if (identity) project('project.identity', { ...identity }, { file: identity.file, pointer: '', line: null }, 'declared', 'identity@1');
  const git = await readGitInfo(o.fs, o.root, 0, o.signal);
  if (o.signal.aborted) throw new DiscoveryCancelled();
  if (git) project('git.repository', { ...git }, { file: '.git/HEAD', pointer: '', line: 1 }, git.confidence === 'confirmed' ? 'declared' : 'inferred', 'git@1');
  if (w.sensitive.length) project('sensitive.files', { files: w.sensitive.map((s) => ({ path: s.path, kind: s.kind })) }, null, 'declared', 'sensitive@1');
  if (reader.has('.ayar/profile.json')) project('ayar.repoProfile', { path: '.ayar/profile.json', size: reader.size('.ayar/profile.json') }, { file: '.ayar/profile.json', pointer: '', line: null }, 'declared', 'ayar@1');
  const aiChecks = reader.find((f) => /^\.ayar\/ai-checks\/[^/]+\.md$/.test(f));
  if (aiChecks.length) project('ayar.aiChecks', { files: aiChecks }, { file: aiChecks[0]!, pointer: '', line: null }, 'declared', 'ayar@1');
  const aiResults: { path: string; size: number | null; fingerprint: string | null }[] = [];
  for (const f of reader.find((x) => /^\.ayar\/ai-results\/[^/]+\.json$/.test(x))) {
    const t = await reader.text(f);
    aiResults.push({ path: f, size: reader.size(f), fingerprint: t.ok ? o.fingerprint(new TextEncoder().encode(t.text)) : null });
  }
  if (aiResults.length) project('ayar.aiResults', { files: aiResults }, { file: aiResults[0]!.path, pointer: '', line: null }, 'declared', 'ayar@1');
  for (const f of reader.find((x) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(x))) {
    const c = await reader.config(f, 'yaml');
    if (!c.ok || !isRecord(c.value)) continue;
    const steps: { job: string; name: string | null; run: string | null; uses: string | null; localRunnable: boolean }[] = [];
    const nodeVersions = new Set<string>();
    const pythonVersions = new Set<string>();
    const jobs = isRecord(c.value.jobs) ? c.value.jobs : {};
    for (const [job, def] of Object.entries(jobs)) {
      if (!isRecord(def) || !Array.isArray(def.steps)) continue;
      for (const st of def.steps.slice(0, 100)) {
        if (!isRecord(st)) continue;
        const run = str(st.run);
        const uses = str(st.uses);
        const w2 = isRecord(st.with) ? st.with : {};
        if (typeof w2['node-version'] === 'string' || typeof w2['node-version'] === 'number') nodeVersions.add(String(w2['node-version']));
        if (typeof w2['python-version'] === 'string' || typeof w2['python-version'] === 'number') pythonVersions.add(String(w2['python-version']));
        // A step that needs secrets, services or platform expressions is not runnable locally as written (10.5).
        const text = JSON.stringify(st);
        steps.push({ job, name: str(st.name), run, uses, localRunnable: run !== null && !/\$\{\{/.test(text) });
      }
    }
    project('ci.workflow', { file: f, jobs: Object.keys(jobs).length, steps, nodeVersions: [...nodeVersions].sort(), pythonVersions: [...pythonVersions].sort(), usesSecrets: /\$\{\{\s*secrets\./.test(c.text) }, { file: f, pointer: '', line: 1 }, 'declared', 'workflows@1');
  }

  // 6. Configuration that could not be read or parsed: a fact (it explains «تعذّر»/«ناقص» later) and a warning.
  //    A known configuration file over the limit is reported even when no detector needed it.
  for (const [rel, f] of w.files) {
    if (f.size > o.limits.maxConfigBytes && KNOWN_CONFIG.test(posix.basename(rel)) && !reader.problems.has(rel)) reader.problems.set(rel, { error: 'too_large' });
  }
  const warnings: DiscoveryWarning[] = w.warnings.map((x) => ({ code: x.code, ...(x.path ? { path: x.path } : {}), ...(x.values ? { values: x.values } : {}) }));
  for (const [file, p] of [...reader.problems.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    project('config.invalid', { file, error: p.error, ...(p.message ? { message: p.message } : {}) }, { file, pointer: '', line: null }, 'declared', 'config@1');
    warnings.push({ code: p.error === 'too_large' ? 'configTooLarge' : p.error === 'invalid' ? 'configInvalid' : 'unreadable', path: file });
  }

  facts.sort((a, b) => cmp(a.component, b.component) || cmp(a.key, b.key) || cmp(a.source?.file ?? '', b.source?.file ?? '') || cmp(a.source?.pointer ?? '', b.source?.pointer ?? ''));
  return {
    components: components.map((c) => ({ id: c.id, kind: c.kind, name: c.name, declaredBy: c.declaredBy })),
    facts,
    inventory: inventoryOf(w),
    warnings,
    partial: w.partial,
    partialReasons: w.partialReasons,
    opened: reader.opened,
  };
}

/** A pointer longer than the contract allows (a hostile key) keeps its file and line, without the pointer. */
function bounded(source: FactSource | null): FactSource | null {
  return source && source.pointer.length > 1024 ? { ...source, pointer: '' } : source;
}

const WEB_BUILD_TOOLS = ['vite', 'next', 'astro', 'svelte', 'nuxt'];

/**
 * The types C-06 infers from what the detectors found (a component may have several, FR-05): a web app (a web
 * framework's configuration, and no extension or plugin manifest), a library (exports without an app, or a
 * Python package with a build system and no command), a static site (pages and no code).
 */
function deriveTypes(facts: Fact[], component: string): void {
  const own = facts.filter((f) => f.component === component);
  const has = (key: string) => own.some((f) => f.key === key);
  const add = (key: string, value: unknown, source: FactSource | null) =>
    facts.push({ key, component, value: value as Fact['value'], source, proof: 'inferred', detector: 'types@1' });
  const appLike = has('type.browserExtension') || has('type.obsidianPlugin') || has('type.desktopApp') || has('type.vscodeExtension');
  const web = own.find((f) => f.key === 'build.tool' && isRecord(f.value) && typeof f.value.name === 'string' && WEB_BUILD_TOOLS.includes(f.value.name));
  if (web && !appLike) add('type.webApp', { framework: (web.value as { name: string }).name }, web.source);
  const pkg = own.find((f) => f.key === 'node.package');
  if (pkg && isRecord(pkg.value) && pkg.value.hasExports === true && pkg.value.hasBin !== true && !appLike && !web) add('type.library', { ecosystem: 'node' }, pkg.source);
  const py = own.find((f) => f.key === 'python.project');
  if (py && has('python.buildSystem') && !has('type.cli') && !appLike) add('type.library', { ecosystem: 'python' }, py.source);
  const langs = own.find((f) => f.key === 'lang.files')?.value;
  const count = (k: string) => (isRecord(langs) && typeof langs[k] === 'number' ? langs[k] : 0);
  const code = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'py', 'svelte', 'vue', 'astro'].reduce((a, k) => a + count(k), 0);
  if (!pkg && !py && count('html') > 0 && code === 0) add('type.staticSite', { pages: count('html') }, null);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export { DiscoveryCancelled } from './walker.ts';
