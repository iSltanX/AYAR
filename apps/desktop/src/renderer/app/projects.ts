// What a project row, an overview header and a discovery result say about a project from its discovery facts
// (7.1): its type and technologies as tags, in the designs' order (type, language, build tool, package manager,
// test frameworks: «إضافة متصفح · TypeScript · Vite · pnpm · Vitest», «Python · pytest · uv»). Facts only: nothing is inferred here.
import type { Fact } from '@ayar/protocol';
import type { MessageKey, Translate } from '@ayar/i18n';

const TYPES: Record<string, MessageKey> = {
  'type.browserExtension': 'app.projectType.browserExtension',
  'type.webApp': 'app.projectType.webApp',
  'type.staticSite': 'app.projectType.staticSite',
  'type.desktopApp': 'app.projectType.desktopApp',
  'type.cli': 'app.projectType.cli',
  'type.library': 'app.projectType.library',
  'type.vscodeExtension': 'app.projectType.vscodeExtension',
  'type.obsidianPlugin': 'app.projectType.obsidianPlugin',
};

/** Proper names of tools as their projects write them. */
const NAMES: Record<string, string> = {
  vite: 'Vite',
  vitest: 'Vitest',
  jest: 'Jest',
  playwright: 'Playwright',
  mocha: 'Mocha',
  pytest: 'pytest',
  unittest: 'unittest',
  typescript: 'TypeScript',
  webpack: 'webpack',
  esbuild: 'esbuild',
  rollup: 'Rollup',
  tsup: 'tsup',
  next: 'Next.js',
  astro: 'Astro',
  pnpm: 'pnpm',
  npm: 'npm',
  yarn: 'Yarn',
  bun: 'Bun',
  uv: 'uv',
  poetry: 'Poetry',
  pip: 'pip',
  'node-test': 'node:test',
};

const nameOf = (v: unknown): string | null => {
  const n = typeof v === 'object' && v !== null ? (v as { name?: unknown }).name : null;
  return typeof n === 'string' && n ? (NAMES[n] ?? n) : null;
};

/** The project's tags from the root component's facts (and a workspace's, when the root declares none). */
export function projectTags(t: Translate, facts: readonly Fact[]): string[] {
  const tags: string[] = [];
  const add = (s: string | null) => {
    if (s && !tags.includes(s)) tags.push(s);
  };
  for (const f of facts) if (TYPES[f.key]) add(t(TYPES[f.key]!));
  const has = (key: string) => facts.some((f) => f.key === key);
  const tools = (key: string) => facts.filter((f) => f.key === key).map((f) => nameOf(f.value));
  // The language: TypeScript when declared, else the runtime.
  if (tools('quality.tool').includes('TypeScript')) add('TypeScript');
  else if (has('python.project') || has('runtime.python')) add('Python');
  else if (has('node.package') || has('runtime.node')) add('Node');
  if (tags.includes('TypeScript') && (has('python.project') || has('runtime.python'))) add('Python');
  for (const n of tools('build.tool')) add(n);
  // The designs' order: a Node manager before the test frameworks, a Python manager after them (1.2).
  for (const n of tools('node.packageManager')) add(n);
  for (const n of tools('testing.framework')) add(n);
  for (const n of tools('python.manager')) add(n);
  return tags;
}
