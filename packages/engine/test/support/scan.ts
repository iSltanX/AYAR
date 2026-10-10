// Engine-driven scans of the fixture projects (plan 19 «تكامل المحرك», plan 20): each variant materialized in a
// fresh temp folder (G-09), its dependencies installed offline from the toolchain's caches as «ثبّت التبعيات» would
// (pnpm --frozen-lockfile, uv sync --frozen), then added, approved, planned and run through the protocol by the
// engine as tools/cli spawns it, with its own temporary data folder (G-09: AYAR's data reset for every test).
import type { CheckRunDetail, CheckSpec, ProfileView, ResultsPage, RunDetail, RunSelection } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { addProject, approveAll, connectEngine, FIXTURES, loginShell, materialize, ok, plan, startRun, waitRun, type EngineConnection } from '../../../../tools/cli/test/support/fixtures.ts';

export { FIXTURES, materialize, ok, tempDir, type EngineConnection } from '../../../../tools/cli/test/support/fixtures.ts';

export const TOOLCHAIN = join(homedir(), '.cache/ayar-fixtures-toolchain');
/** pnpm 12.8.1 lives beside nvm's Node 24.16.0 on the owner's machine (FX-EXT's packageManager). */
export const NVM_NODE = join(homedir(), '.nvm/versions/node/v24.16.0/bin');
export const PNPM = join(NVM_NODE, 'pnpm');
export const UV = join(TOOLCHAIN, 'py/bin/uv');
/** The login PATH the engine reads in these scans: the toolchain first, then the system (no other tool leaks in). */
export const LOGIN_PATH = [NVM_NODE, join(TOOLCHAIN, 'bin'), join(TOOLCHAIN, 'py/bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
export const toolchainReady = (): boolean => existsSync(PNPM) && existsSync(UV) && existsSync(join(TOOLCHAIN, 'py/bin/semgrep'));

/** «ثبّت التبعيات», offline: every folder of the project with a pnpm or uv lock file (not inside node_modules). */
export function installDependencies(root: string): void {
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    if (existsSync(join(dir, 'pnpm-lock.yaml')) && !existsSync(join(dir, 'node_modules'))) {
      execFileSync(PNPM, ['install', '--frozen-lockfile', '--offline', '--ignore-scripts', '--reporter=silent'], { cwd: dir, env: { PATH: LOGIN_PATH, HOME: homedir() }, stdio: 'pipe' });
    }
    if (existsSync(join(dir, 'uv.lock')) && !existsSync(join(dir, '.venv'))) {
      execFileSync(UV, ['sync', '--frozen', '--offline', '--quiet'], { cwd: dir, env: { PATH: LOGIN_PATH, HOME: homedir(), UV_PYTHON_PREFERENCE: 'only-system', UV_NO_CONFIG: '1' }, stdio: 'pipe' });
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
}

export interface Scan {
  projectId: string;
  root: string;
  profile: ProfileView;
  detail: RunDetail;
  results: ResultsPage;
}

/** One engine for a test (its own data folder), reading a login shell with the toolchain's PATH. */
export async function engineFor(root: string, o: { path?: string; exports?: Record<string, string> } = {}): Promise<EngineConnection> {
  const engine = await connectEngine({ dataDir: join(root, 'AYAR'), env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: o.path ?? LOGIN_PATH, ...(o.exports ? { exports: o.exports } : {}) }) } });
  await engine.waitForEvent('engine.health', undefined, 30_000);
  return engine;
}

/**
 * Materializes a variant, installs its dependencies, adds it, includes the instances asked for (and any other
 * profile change), approves everything, plans the selection and runs it to its end.
 */
export async function scanVariant(
  engine: EngineConnection,
  root: string,
  project: string,
  variant: string,
  o: { selection?: RunSelection; include?: string[]; patch?: Record<string, unknown>; install?: boolean; folder?: string; timeoutMs?: number; subdir?: string } = {},
): Promise<Scan> {
  // FX-ADAPTERS: each component folder is a project of its own (its own lock file, its own tool).
  const path = join(materialize(project, variant, join(root, o.folder ?? `${project}-${variant}`)), o.subdir ?? '');
  if (o.install !== false) installDependencies(path);
  const { projectId } = await addProject(engine, path);
  const checks: Record<string, unknown> = {};
  for (const i of o.include ?? []) checks[i] = { included: true };
  if (Object.keys(checks).length || o.patch) ok(await engine.invoke('profile.update', { projectId, patch: { ...(o.patch ?? {}), ...(Object.keys(checks).length ? { checks: { ...((o.patch?.checks as Record<string, unknown>) ?? {}), ...checks } } : {}) } }));
  const profile = await approveAll(engine, projectId);
  const p = await plan(engine, projectId, o.selection ?? { kind: 'full' });
  const detail = await waitRun(engine, (await startRun(engine, p.id)).runId, o.timeoutMs ?? 300_000);
  const results = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: detail.run.runId, includeExcluded: true, limit: 1000 } }));
  return { projectId, root: path, profile, detail, results };
}

export function execOf(d: RunDetail, instance: string): CheckRunDetail {
  const c = d.checks.find((x) => x.instance === instance);
  if (!c) throw new Error(`no execution of ${instance}: ${d.checks.map((x) => x.instance).join(', ')}`);
  return c;
}

export function specOf(p: ProfileView, instance: string): CheckSpec {
  const s = p.checks.find((x) => x.instance === instance);
  if (!s) throw new Error(`no spec ${instance}`);
  return s;
}

/** Plan 20's fixture-expect/1 file of a variant. */
export interface Expectation {
  check: string;
  component?: string;
  result: string;
  rule: string | null;
  rule_pending?: boolean;
  tool_rule?: string;
  location: { path: string; line?: number; anchor?: string; history?: string } | null;
  confidence: string | null;
  origin?: string;
  exit_code?: number;
  reason?: string;
}

export function expectations(project: string, variant: string): { expectations: Expectation[]; pending?: unknown[] } {
  return JSON.parse(readFileSync(join(FIXTURES, project, 'variants', variant, 'expected.json'), 'utf8')) as { expectations: Expectation[]; pending?: unknown[] };
}

/** The Arabic words of plan 20's files, as AYAR's outcomes, proofs and origins. */
export const OUTCOME: Record<string, string> = {
  اجتاز: 'passed',
  أخفق: 'failed',
  تحذير: 'warning',
  'يحتاج مراجعة': 'needs_review',
  متذبذب: 'flaky',
  ناقص: 'missing',
  'ناقص إعداد': 'missing',
  تعذّر: 'unavailable',
  'انتهت المهلة': 'timed_out',
  'أُلغي': 'cancelled',
  انقطع: 'interrupted',
  'تُخطّي': 'skipped',
  'غير منطبق': 'not_applicable',
};
export const PROOF: Record<string, string> = { 'مخالفة مثبتة': 'proven', اشتباه: 'suspected', 'اقتراح تحسين': 'suggestion' };
export const ORIGIN: Record<string, string> = { المشروع: 'project', الأداة: 'tool', البيئة: 'environment' };
