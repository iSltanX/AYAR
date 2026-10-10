// C-09 point 1: the literal command a check proposes, from discovery facts. A project script is run through
// its package manager (`pnpm run test`), and the spec keeps the script's text and, where the manager runs them
// itself (npm, Yarn 1), its pre/post scripts. Without a script, the configured tool is called directly. Python
// tools run from the project's .venv when there is one, otherwise through `uv run --no-sync --offline` in a uv
// project, never `uv run` alone nor `poetry run`, which write into the environment (E-07). Checks whose runner
// is a managed tool, an analyzer or the probe have no project command here: their adapter (DEV-6) or analyzer
// defines the invocation, and the spec names the tool.
import type { CheckDefinition } from '@ayar/catalog';
import type { CommandSpec, Fact } from '@ayar/protocol';
import type { ScriptInfo } from '../discovery/scripts.ts';
import { pickScript, type ScriptKind } from '../discovery/scripts.ts';

export interface ToolChoice {
  key: string;
  source: 'project' | 'managed' | 'system' | 'project-venv' | 'uv' | 'poetry-env';
  runtime: { name: 'node' | 'python'; spec: string; from: string } | null;
  path: string | null;
}

export interface CommandChoice {
  command: CommandSpec | null;
  tool: ToolChoice | null;
}

const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

interface ComponentFacts {
  component: string;
  own: readonly Fact[];
  root: readonly Fact[];
}

export function packageManager(cf: ComponentFacts): string {
  for (const facts of [cf.own, cf.root]) {
    const declared = facts.find((f) => f.key === 'node.packageManager');
    if (declared) return text(rec(declared.value).name, 'npm');
  }
  return 'npm';
}

function scriptsOf(cf: ComponentFacts): ScriptInfo[] {
  return cf.own.filter((f) => f.key === 'node.script').map((f) => f.value as unknown as ScriptInfo);
}

function runtimeOf(cf: ComponentFacts, name: 'node' | 'python'): ToolChoice['runtime'] {
  // .nvmrc / .node-version / .python-version first, then engines / requires-python, own component then root.
  const order = name === 'node' ? ['nvmrc', 'node-version', 'tool-versions', 'mise', 'engines'] : ['python-version', 'tool-versions', 'mise', 'requires-python'];
  for (const facts of [cf.own, cf.root]) {
    const found = facts.filter((f) => f.key === `runtime.${name}`).map((f) => rec(f.value));
    for (const from of order) {
      const hit = found.find((v) => v.from === from);
      if (hit && typeof hit.spec === 'string') return { name, spec: hit.spec, from };
    }
  }
  return null;
}

function frameworks(cf: ComponentFacts): string[] {
  return cf.own.filter((f) => f.key === 'testing.framework').map((f) => text(rec(f.value).name, ''));
}

function qualityTools(cf: ComponentFacts): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of cf.own.filter((x) => x.key === 'quality.tool')) {
    const v = rec(f.value);
    const name = text(v.name, '');
    if (!(name in out) || (out[name] === null && typeof v.config === 'string')) out[name] = typeof v.config === 'string' ? v.config : null;
  }
  return out;
}

const MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];
/** Flags of the managers that take a value (`--filter x`, `-C dir`…): their value is not a script name. */
const VALUE_FLAGS = new Set(['--filter', '-F', '--prefix', '-C', '--dir', '--workspace', '-w', '--cwd', '--registry']);
/** Commands of the managers themselves: a positional argument equal to one of them is not a script (pnpm, yarn). */
const BUILTINS = new Set(['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'exec', 'dlx', 'x', 'create', 'init', 'link', 'unlink', 'publish', 'pack', 'audit', 'outdated', 'list', 'ls', 'why', 'config', 'set', 'get', 'store', 'cache', 'import', 'rebuild', 'prune', 'patch', 'env', 'setup', 'self-update', 'help', 'bin', 'root', 'deploy', 'fetch', 'install-test', 'it', 'licenses', 'node', 'workspace', 'workspaces', 'dedupe', 'upgrade', 'info', 'version', 'login', 'logout', 'whoami']);
const NPM_SHORTCUTS: Record<string, string> = { test: 'test', t: 'test', tst: 'test', start: 'start', stop: 'stop', restart: 'restart' };

/**
 * The project script an argument vector runs, whatever the form (review M8): `npm run x`, `npm run-script x`,
 * `npm test`, `npm start`, `pnpm x`, `pnpm --filter a run x`, `yarn x`, `bun run x`. Null for anything else.
 */
export function scriptNameOf(argv: readonly string[], scripts: readonly { name: string }[]): string | null {
  const pm = argv[0]?.split('/').pop();
  if (!pm || !MANAGERS.includes(pm)) return null;
  const positional: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') break;
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith('-')) continue;
    positional.push(a);
  }
  const [first, second] = positional;
  if (!first) return null;
  let name: string | null = null;
  if (first === 'run' || first === 'run-script' || first === 'rs') name = second ?? null;
  else if (pm === 'npm') name = NPM_SHORTCUTS[first] ?? null;
  else if ((pm === 'pnpm' || pm === 'yarn') && !BUILTINS.has(first)) name = first;
  return name && scripts.some((s) => s.name === name) ? name : null;
}

/** Scripts a script runs in turn, by name (`npm run a && pnpm b`), followed to a fixed depth. */
function referencedScripts(text: string, all: readonly ScriptInfo[], self: string): { name: string; text: string }[] {
  const out = new Map<string, string>();
  const visit = (t: string, depth: number) => {
    if (depth > 5) return;
    for (const part of t.split(/&&|\|\||;|\|/)) {
      const argv = part.trim().split(/\s+/);
      const at = argv.findIndex((a) => MANAGERS.includes(a));
      if (at < 0) continue;
      const name = scriptNameOf(argv.slice(at), all);
      if (!name || name === self || out.has(name)) continue;
      const s = all.find((x) => x.name === name)!;
      out.set(name, s.text);
      visit(s.text, depth + 1);
    }
  };
  visit(text, 0);
  return [...out].map(([name, t]) => ({ name, text: t })).sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** The literal script and what the manager runs with it: pre/post (npm, Yarn 1) and the scripts it calls. */
export function scriptSpec(pm: string, s: ScriptInfo, all: readonly ScriptInfo[]): NonNullable<CommandSpec['script']> {
  const prePost = pm === 'npm' || pm === 'yarn';
  const pre = prePost ? (all.find((x) => x.name === `pre${s.name}`)?.text ?? null) : null;
  const post = prePost ? (all.find((x) => x.name === `post${s.name}`)?.text ?? null) : null;
  return { name: s.name, text: s.text, pre, post, composite: s.composite, referenced: referencedScripts(s.text, all, s.name) };
}

/** The script and its pre/post texts when the manager runs them (npm and Yarn 1 do; pnpm, Yarn 2+ and bun do not). */
function scriptCommand(cf: ComponentFacts, s: ScriptInfo): CommandSpec {
  const pm = packageManager(cf);
  return { argv: [pm, 'run', s.name], cwd: cf.component, script: scriptSpec(pm, s, scriptsOf(cf)), from: 'script' };
}

export function scriptsOfFacts(facts: readonly Fact[]): ScriptInfo[] {
  return facts.filter((f) => f.key === 'node.script').map((f) => f.value as unknown as ScriptInfo);
}

function nodeTool(cf: ComponentFacts, args: string[], key: string): CommandChoice {
  const pm = packageManager(cf);
  const exec = pm === 'npm' ? ['npx', '--no-install'] : pm === 'yarn' ? ['yarn'] : pm === 'bun' ? ['bunx', '--no-install'] : [pm, 'exec'];
  return { command: { argv: [...exec, ...args], cwd: cf.component, script: null, from: 'tool' }, tool: { key, source: 'project', runtime: runtimeOf(cf, 'node'), path: null } };
}

/** How Python runs in this component (E-07): the project venv, then uv without syncing, then the manager's env. */
function pythonPrefix(cf: ComponentFacts, program: string): { argv: string[]; source: ToolChoice['source'] } {
  const venv = cf.own.find((f) => f.key === 'python.venv');
  const manager = text(rec(cf.own.find((f) => f.key === 'python.manager')?.value).name, '');
  if (venv) {
    const dir = text(rec(venv.value).path, '.venv').split('/').pop()!;
    return { argv: [program === 'python' ? `${dir}/bin/python` : `${dir}/bin/${program}`], source: 'project-venv' };
  }
  if (manager === 'uv') return { argv: ['uv', 'run', '--no-sync', '--offline', '--', program], source: 'uv' };
  if (manager === 'poetry') return { argv: [program], source: 'poetry-env' };
  return { argv: [program === 'python' ? 'python3' : program], source: 'system' };
}

function pythonTool(cf: ComponentFacts, module: string | null, program: string | null, args: string[], key: string): CommandChoice {
  const p = module ? pythonPrefix(cf, 'python') : pythonPrefix(cf, program!);
  const argv = module ? [...p.argv, '-m', module, ...args] : [...p.argv, ...args];
  return { command: { argv, cwd: cf.component, script: null, from: 'tool' }, tool: { key, source: p.source, runtime: runtimeOf(cf, 'python'), path: null } };
}

const isPython = (cf: ComponentFacts) => cf.own.some((f) => f.key === 'python.project' || f.key === 'python.requirements' || f.key === 'python.manager');
const isNode = (cf: ComponentFacts) => cf.own.some((f) => f.key === 'node.package');

function fromScript(cf: ComponentFacts, kind: ScriptKind, key: string): CommandChoice | null {
  const s = pickScript(scriptsOf(cf), kind);
  return s ? { command: scriptCommand(cf, s), tool: { key, source: 'project', runtime: runtimeOf(cf, 'node'), path: null } } : null;
}

export function proposeCommand(def: CheckDefinition, cf: ComponentFacts): CommandChoice {
  const fw = frameworks(cf);
  const qt = qualityTools(cf);
  switch (def.id) {
    case 'beh.unit':
    case 'beh.stability': {
      if (isNode(cf)) {
        const s = fromScript(cf, 'test', fw.find((f) => ['vitest', 'jest', 'mocha'].includes(f)) ?? 'test-script');
        if (s) return s;
        if (fw.includes('vitest')) return nodeTool(cf, ['vitest', 'run'], 'vitest');
        if (fw.includes('jest')) return nodeTool(cf, ['jest'], 'jest');
        if (fw.includes('mocha')) return nodeTool(cf, ['mocha'], 'mocha');
      }
      if (isPython(cf) && fw.includes('pytest')) return pythonTool(cf, 'pytest', null, [], 'pytest');
      return { command: null, tool: null };
    }
    case 'beh.integration':
      return fromScript(cf, 'integration', 'test-script') ?? { command: null, tool: null };
    case 'beh.e2e':
    case 'perf.compat':
      return fromScript(cf, 'e2e', 'playwright') ?? nodeTool(cf, ['playwright', 'test'], 'playwright');
    case 'perf.load':
      return fromScript(cf, 'load', 'k6') ?? { command: null, tool: { key: 'k6', source: 'system', runtime: null, path: null } };
    case 'code.types': {
      if (isNode(cf)) {
        const s = fromScript(cf, 'typecheck', 'tsc');
        if (s) return s;
        if (qt.typescript) return nodeTool(cf, ['tsc', '--noEmit', '-p', qt.typescript.split('/').pop()!], 'tsc');
        if ('svelte-check' in qt) return nodeTool(cf, ['svelte-check'], 'svelte-check');
        if ('vue-tsc' in qt) return nodeTool(cf, ['vue-tsc', '--noEmit'], 'vue-tsc');
      }
      if ('mypy' in qt) return pythonTool(cf, 'mypy', null, [], 'mypy');
      if ('pyright' in qt) return pythonTool(cf, null, 'pyright', [], 'pyright');
      return { command: null, tool: null };
    }
    case 'code.lint': {
      if (isNode(cf)) {
        const s = fromScript(cf, 'lint', 'eslint');
        if (s) return s;
        if (qt.eslint) return nodeTool(cf, ['eslint', '.'], 'eslint');
        if (qt.biome) return nodeTool(cf, ['biome', 'lint', '.'], 'biome');
      }
      if ('ruff' in qt) return pythonTool(cf, null, 'ruff', ['check', '.'], 'ruff');
      return { command: null, tool: null };
    }
    case 'code.build': {
      if (isNode(cf)) {
        const s = fromScript(cf, 'build', 'build-script');
        if (s) return s;
      }
      const buildSystem = cf.own.find((f) => f.key === 'python.buildSystem');
      if (buildSystem) {
        // The project's own front end first (`python -m build`, in its environment), then the manager's.
        if (rec(buildSystem.value).frontend === 'build') return pythonTool(cf, 'build', null, [], 'build');
        const manager = text(rec(cf.own.find((f) => f.key === 'python.manager')?.value).name, '');
        if (manager === 'uv' && !cf.own.some((f) => f.key === 'python.venv')) return { command: { argv: ['uv', 'build', '--offline'], cwd: cf.component, script: null, from: 'tool' }, tool: { key: 'uv', source: 'uv', runtime: runtimeOf(cf, 'python'), path: null } };
        if (manager === 'poetry') return { command: { argv: ['poetry', 'build'], cwd: cf.component, script: null, from: 'tool' }, tool: { key: 'poetry', source: 'poetry-env', runtime: runtimeOf(cf, 'python'), path: null } };
        return pythonTool(cf, 'build', null, [], 'build');
      }
      return { command: null, tool: null };
    }
    case 'code.unused':
      return nodeTool(cf, ['knip'], 'knip');
    case 'beh.mutation':
      return nodeTool(cf, ['stryker', 'run'], 'stryker');
    default:
      break;
  }
  // The network audit uses the ecosystem's own tool: npm audit for npm, pip-audit for Python (10.3).
  if (def.id === 'sec.deps.audit') return { command: null, tool: isNode(cf) ? { key: 'npm', source: 'system', runtime: null, path: null } : { key: 'pip-audit', source: 'system', runtime: null, path: null } };
  // Managed tools (secrets, OSV, Semgrep, lychee): the adapter defines the invocation (DEV-6).
  if (def.runner.kind === 'adapter') {
    const managed = def.requirements.find((r) => r.kind === 'tool' && (r.from === 'managed' || r.from === 'system'));
    if (managed && managed.kind === 'tool') return { command: null, tool: { key: managed.tools[0]!, source: managed.from === 'managed' ? 'managed' : 'system', runtime: null, path: null } };
  }
  return { command: null, tool: null };
}
