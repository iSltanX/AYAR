// Classifying package.json scripts by name and content (C-06 «السكربتات»): test, typecheck, lint, build, e2e,
// integration, format, serve, load. A composite script (&&, ;, |, $(), backticks) is marked, because adding
// arguments to it is not reliable (C-15). Leading environment assignments (`RASD_TARGET=firefox vite build`,
// `NODE_OPTIONS=… vitest`, `cross-env A=1 …`) are skipped to find the tool, and their names are recorded
// (E-15 point 4); their values stay in the script text, which C-18 redacts before it is saved.

export type ScriptKind = 'test' | 'e2e' | 'integration' | 'typecheck' | 'lint' | 'build' | 'format' | 'serve' | 'load' | 'other';

export interface ScriptInfo {
  name: string;
  text: string;
  kind: ScriptKind;
  composite: boolean;
  /** The program the script starts with, after environment assignments (vitest, tsc, pnpm…). */
  tool: string | null;
  envAssignments: string[];
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)\s+/;

export function splitAssignments(text: string): { names: string[]; rest: string } {
  let rest = text.trim();
  const names: string[] = [];
  for (;;) {
    if (rest.startsWith('cross-env ')) {
      rest = rest.slice('cross-env '.length).trimStart();
      continue;
    }
    const m = ASSIGNMENT.exec(rest);
    if (!m) break;
    names.push(m[1]!);
    rest = rest.slice(m[0].length).trimStart();
  }
  return { names, rest };
}

export function isComposite(text: string): boolean {
  return /&&|\|\||;|\||\$\(|`/.test(text);
}

const TEST_TOOLS = /^(vitest|jest|mocha|ava|tap|uvu|pytest)\b|^node\s+(--test\b|.*\s--test\b)|^python3?\s+-m\s+pytest\b/;
const TYPE_TOOLS = /^(tsc|vue-tsc|svelte-check|tsgo|mypy|pyright)\b|^python3?\s+-m\s+mypy\b/;
const LINT_TOOLS = /^(eslint|biome\s+(lint|check)|ruff\s+check|oxlint|stylelint|xo|standard)\b/;
const BUILD_TOOLS = /^(vite\s+build|tsc\s+(-b|--build)|next\s+build|astro\s+build|nuxt\s+build|svelte-kit\s+build|webpack|rollup|esbuild|tsup|parcel\s+build|wxt\s+build|plasmo\s+build|tauri\s+build|electron-forge\s+(make|package)|python3?\s+-m\s+build|uv\s+build|cargo\s+build)\b/;

export function classifyScript(name: string, text: string): ScriptInfo {
  const { names, rest } = splitAssignments(text);
  const composite = isComposite(text);
  const tool = rest.split(/\s+/)[0] || null;
  const n = name.toLowerCase();
  // The name decides first (a `build` script that starts with `tsc --noEmit` is still the build); the content
  // decides only when the name says nothing.
  let kind: ScriptKind = 'other';
  if (/(^|:)e2e(:|$)|playwright|cypress/.test(n)) kind = 'e2e';
  else if (/integration/.test(n)) kind = 'integration';
  else if (/^(load|test:load|perf:load)$/.test(n)) kind = 'load';
  else if (/^(test|tests|unit)(:|$)/.test(n) && !/watch|(^|:)ui$/.test(n)) kind = 'test';
  else if (/^(typecheck|type-check|types|check-types|tsc|check:types|types:check)$/.test(n)) kind = 'typecheck';
  else if (/^lint(:|$)/.test(n)) kind = 'lint';
  else if (/^build(:|$)/.test(n)) kind = 'build';
  else if (/format|prettier/.test(n)) kind = 'format';
  else if (/^(dev|start|serve|preview|watch)(:|$)/.test(n)) kind = 'serve';
  else if (/^(playwright\s+test|cypress\s+run)\b/.test(rest)) kind = 'e2e';
  else if (/^k6\s+run\b/.test(rest)) kind = 'load';
  else if (TEST_TOOLS.test(rest) && !/watch/.test(n)) kind = 'test';
  else if (TYPE_TOOLS.test(rest)) kind = 'typecheck';
  else if (LINT_TOOLS.test(rest)) kind = 'lint';
  else if (BUILD_TOOLS.test(rest)) kind = 'build';
  else if (/^prettier\b/.test(rest)) kind = 'format';
  if (kind === 'test' && /^(playwright\s+test|cypress\s+run)\b/.test(rest)) kind = 'e2e';
  return { name, text, kind, composite, tool, envAssignments: names };
}

/** The preferred script for each kind, by name first (C-09 picks the command a check proposes). */
const PREFERRED: Record<string, readonly string[]> = {
  test: ['test', 'test:unit', 'unit', 'test:run', 'test:ci'],
  e2e: ['e2e', 'test:e2e', 'playwright', 'e2e:test'],
  integration: ['test:integration', 'integration'],
  typecheck: ['typecheck', 'type-check', 'check-types', 'types', 'tsc', 'check:types'],
  lint: ['lint', 'lint:all'],
  build: ['build'],
  load: ['load', 'test:load', 'perf:load'],
};

export function pickScript(scripts: readonly ScriptInfo[], kind: ScriptKind): ScriptInfo | null {
  for (const name of PREFERRED[kind] ?? []) {
    const s = scripts.find((x) => x.name === name && x.kind === kind);
    if (s) return s;
  }
  return scripts.filter((s) => s.kind === kind).sort((a, b) => a.name.length - b.name.length || (a.name < b.name ? -1 : 1))[0] ?? null;
}
