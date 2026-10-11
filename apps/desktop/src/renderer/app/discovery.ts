// What screen 2 says about a discovery snapshot (9.2, 13.3 «ما وجده عِيَار»): the facts as chips with their source,
// the checks the project already declares, its references, and the warnings. From the snapshot alone (7.1).
import type { DiscoverySnapshot, Fact } from '@ayar/protocol';
import type { Translate } from '@ayar/i18n';

export interface FactChip {
  label: string;
  /** «من manifest.json السطر 3», or why there is no file. */
  source: string;
}

const PROPER: Record<string, string> = {
  vite: 'Vite',
  vitest: 'Vitest',
  jest: 'Jest',
  playwright: 'Playwright',
  pytest: 'pytest',
  typescript: 'TypeScript',
  pnpm: 'pnpm',
  npm: 'npm',
  yarn: 'Yarn',
  uv: 'uv',
  poetry: 'Poetry',
  webpack: 'webpack',
  esbuild: 'esbuild',
  rollup: 'Rollup',
  eslint: 'ESLint',
  biome: 'Biome',
  ruff: 'Ruff',
  pyright: 'Pyright',
};

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** «5.0.3» → «5»; a range «^6.1» → «6». */
const major = (v: unknown): string | null => {
  const m = typeof v === 'string' ? /(\d+)/.exec(v) : null;
  return m ? m[1]! : null;
};

export function factSource(t: Translate, f: Fact): string {
  if (!f.source) return t('discoverui.fact.inferred');
  return f.source.line ? t('discoverui.fact.source', { file: f.source.file, line: f.source.line }) : t('discoverui.fact.sourceFile', { file: f.source.file });
}

/** The chips of «النوع والتقنيات», in the design's order: type, interface language, language, build, manager, tests. */
export function factChips(t: Translate, typeLabel: (key: string) => string | null, facts: readonly Fact[]): FactChip[] {
  const root = facts.filter((f) => f.component === '.');
  const chips: FactChip[] = [];
  const seen = new Set<string>();
  const push = (label: string | null, f: Fact) => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    chips.push({ label, source: factSource(t, f) });
  };
  for (const f of root) if (f.key.startsWith('type.')) push(typeLabel(f.key), f);
  for (const f of root) if (f.key === 'ui.rtl') push(t('discoverui.fact.rtlUi'), f);
  // A tool's version comes from its dependency fact when the configuration fact has none.
  const versionOf = (key: string, name: string) => root.map((f) => rec(f.value)).find((v) => v.name === name && major(v.version))?.version;
  const named = (key: string) => {
    for (const f of root.filter((x) => x.key === key)) {
      const name = str(rec(f.value).name);
      if (!name) continue;
      const v = major(rec(f.value).version) ?? major(versionOf(key, name));
      push(`${PROPER[name] ?? name}${v ? ` ${v}` : ''}`, f);
    }
  };
  for (const f of root.filter((x) => x.key === 'quality.tool' && rec(x.value).name === 'typescript')) {
    const v = major(rec(f.value).version) ?? major(versionOf('quality.tool', 'typescript'));
    push(`TypeScript${v ? ` ${v}` : ''}`, f);
    break;
  }
  if (!seen.has('TypeScript') && ![...seen].some((s) => s.startsWith('TypeScript'))) {
    const py = root.find((f) => f.key === 'python.project' || f.key === 'runtime.python');
    if (py) push('Python', py);
  }
  named('build.tool');
  named('node.packageManager');
  named('testing.framework');
  named('python.manager');
  // Labels without their version, once: «Vitest 5» and «Vitest» are one chip.
  return chips.filter((c, i) => !chips.some((d, j) => j < i && d.label.split(' ')[0] === c.label.split(' ')[0]));
}

export interface CheckLines {
  scripts: string[];
  configs: string[];
  tests: { count: number; folders: string[] };
}

export function existingChecks(s: DiscoverySnapshot): CheckLines {
  const root = s.facts.filter((f) => f.component === '.');
  const scripts = root.filter((f) => f.key === 'node.script').map((f) => str(rec(f.value).name)).filter((x): x is string => !!x);
  const configs = [
    ...new Set(
      root
        .filter((f) => ['quality.tool', 'testing.framework', 'build.tool'].includes(f.key))
        .map((f) => str(rec(f.value).config))
        .filter((x): x is string => !!x),
    ),
  ];
  let count = 0;
  const folders = new Set<string>();
  for (const [kind, v] of Object.entries(s.inventory.testFiles)) {
    if (kind === 'stories') continue;
    count += v.count;
    for (const p of v.paths) folders.add(p.includes('/') ? `${p.split('/')[0]}/` : './');
  }
  return { scripts, configs, tests: { count, folders: [...folders].sort() } };
}

export interface RefLine {
  key: 'permissions' | 'render' | 'tokens' | 'manifest' | 'budgets' | 'openapi' | 'storybook' | 'fonts';
  values: string[];
}

export function referenceLines(s: DiscoverySnapshot): RefLine[] {
  const root = s.facts.filter((f) => f.component === '.');
  const val = (key: string, field: string) => root.filter((f) => f.key === key).map((f) => rec(f.value)[field]);
  const strings = (xs: unknown[]) => xs.flatMap((x) => (Array.isArray(x) ? x : [x])).filter((x): x is string => typeof x === 'string' && x.length > 0);
  const lines: RefLine[] = [];
  const add = (key: RefLine['key'], values: string[]) => values.length && lines.push({ key, values: [...new Set(values)] });
  add('permissions', strings(val('references.permissionsPolicy', 'path')));
  add('render', strings(val('references.buildOutput', 'dir')).map((d) => `${d}/`));
  add('tokens', strings([...val('references.tokens', 'path'), ...val('references.cssVariables', 'files'), ...val('references.tailwindTheme', 'path')]));
  add('manifest', strings(val('references.manifest', 'path')));
  add('budgets', strings(val('references.sizeBudgets', 'path')));
  add('openapi', strings(val('references.openapi', 'path')));
  add('storybook', strings(val('references.storybook', 'path')));
  add('fonts', strings(val('references.fontFaces', 'files')));
  return lines;
}

export interface WarningLines {
  sensitive: string[];
  symlinksOutside: string[];
  partial: boolean;
}

export function warningLines(s: DiscoverySnapshot): WarningLines {
  return {
    sensitive: s.inventory.sensitiveFiles.map((f) => f.path),
    symlinksOutside: s.inventory.symlinks.filter((l) => !l.inside).map((l) => l.path),
    partial: s.partial,
  };
}
