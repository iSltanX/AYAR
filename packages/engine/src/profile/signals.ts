// C-09: the boolean signals the catalog's conditions name (packages/catalog SIGNALS), computed from the facts of
// one component (or of the whole project, for project-scope checks), and the references that are present —
// declared by the user in the profile, or found by discovery. Each true signal keeps the fact behind it, so a
// proposal can say why.
import type { Condition, ReferenceKind, Signal } from '@ayar/catalog';
import type { Fact, ProfileContext, ProfileReferences } from '@ayar/protocol';

export type Signals = Record<Signal, boolean>;
export type Refs = Record<ReferenceKind, boolean>;

const RTL = /^(ar|fa|he|ur|ps|ku|yi|dv|sd|ug)(-|_|$)/i;
const WEB_BUILD = ['vite', 'next', 'astro', 'svelte', 'nuxt'];

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The facts of one component, or of the whole project (`all`, for project-scope checks). */
export function factsOf(facts: readonly Fact[], component: string): Fact[] {
  return component === 'all' ? [...facts] : facts.filter((f) => f.component === component);
}

export function computeSignals(facts: readonly Fact[], o: { reviews: boolean }): Signals {
  const has = (key: string) => facts.some((f) => f.key === key);
  const values = (key: string) => facts.filter((f) => f.key === key).map((f) => rec(f.value));
  const langs: Record<string, number> = {};
  for (const l of values('lang.files')) for (const [k, v] of Object.entries(l)) if (typeof v === 'number') langs[k] = (langs[k] ?? 0) + v;
  const n = (...ks: string[]) => ks.reduce((a, k) => a + (langs[k] ?? 0), 0);
  const quality = values('quality.tool');
  const q = (name: string, withConfig = false) => quality.some((t) => t.name === name && (!withConfig || t.from === 'config'));
  const scripts = values('node.script');
  const frameworks = values('testing.framework').map((f) => f.name);
  const testFiles = values('testing.files');
  const tf = (k: string) => testFiles.reduce((a, t) => a + (typeof t[k] === 'number' ? t[k] : 0), 0);
  const ext = values('type.browserExtension');
  const nodeDeps = values('node.dependencies').reduce((a, d) => a + (typeof d.count === 'number' ? d.count : 0), 0);
  const pyDeps = values('python.dependencies').reduce((a, d) => a + (typeof d.count === 'number' ? d.count : 0), 0) + values('python.requirements').reduce((a, d) => a + (typeof d.count === 'number' ? d.count : 0), 0);
  const rtlLocales =
    values('ui.locales').some((l) => Array.isArray(l.languages) && l.languages.some((x) => RTL.test(String(x)))) ||
    values('ui.defaultLocale').some((l) => RTL.test(String(l.value))) ||
    values('ui.languages').some((l) => Array.isArray(l.languages) && l.languages.some((x) => RTL.test(String(x))));
  const workflowsNode = values('ci.workflow').reduce((a, w) => Math.max(a, Array.isArray(w.nodeVersions) ? w.nodeVersions.length : 0), 0);
  const pwProjects = values('testing.playwrightProjects').reduce((a, p) => Math.max(a, typeof p.count === 'number' ? p.count : 0), 0);
  const code = n('js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'py', 'svelte', 'vue', 'astro');
  return {
    'code.any': code > 0,
    'lang.js': n('js', 'mjs', 'cjs', 'jsx') > 0,
    'lang.ts': n('ts', 'mts', 'cts', 'tsx') > 0,
    'lang.python': n('py') > 0,
    'styles.any': n('css', 'scss', 'svelte', 'vue', 'astro') > 0,
    'markup.any': n('html', 'css', 'md') > 0,
    'ui.rendered':
      !has('type.obsidianPlugin') &&
      (ext.length > 0 || has('type.webApp') || has('type.staticSite') || has('references.storybook') || has('ui.entryPages') || values('build.tool').some((b) => WEB_BUILD.includes(String(b.name)))),
    'ui.rtl': has('ui.rtl') || rtlLocales,
    'type.browserExtension': ext.length > 0,
    'type.chromiumExtension': ext.some((e) => e.manifestVersion === 3 || e.generated === true),
    'build.step': scripts.some((s) => s.kind === 'build') || has('python.buildSystem'),
    'types.config': q('typescript', true) || q('mypy') || q('pyright') || q('svelte-check') || q('vue-tsc'),
    'lint.config': q('eslint', true) || q('biome', true) || q('ruff'),
    'deps.external': nodeDeps + pyDeps > 0,
    'deps.ecosystem': has('node.package') || has('python.project') || has('python.requirements'),
    'git.repo': has('git.repository'),
    'tests.integration': scripts.some((s) => s.kind === 'integration'),
    'tests.playwright': frameworks.includes('playwright') && tf('e2e') > 0,
    'tests.contract': frameworks.includes('pact'),
    'perf.loadScenario': scripts.some((s) => s.kind === 'load') || tf('load') > 0,
    'compat.matrix': workflowsNode > 1 || pwProjects > 1,
    'ayar.aiResults': has('ayar.aiResults'),
    'state.reviews': o.reviews,
    'site.staticNoScripts': has('type.staticSite'),
    'ext.manifestGenerated': ext.some((e) => e.generated === true),
    'type.library': has('type.library'),
  };
}

/**
 * The references present for these facts: declared in the profile, or found by discovery (a permissions policy
 * file, tokens, size budgets, an extension's build folder as render target).
 */
export function computeRefs(facts: readonly Fact[], declared: ProfileReferences): Refs {
  const has = (key: string) => facts.some((f) => f.key === key);
  const d = (k: ReferenceKind) => declared[k] !== undefined && declared[k] !== null;
  const policy = facts.some((f) => f.key === 'references.permissionsPolicy' && rec(f.value).valid === true);
  const extBuilt = facts.some((f) => f.key === 'type.browserExtension') && facts.some((f) => f.key === 'references.buildOutput');
  return {
    tokens: d('tokens') || has('references.tokens'),
    fonts: d('fonts'),
    renderTarget: d('renderTarget') || extBuilt || has('type.staticSite') || has('ui.entryPages'),
    states: d('states'),
    budgets: d('budgets') || has('references.sizeBudgets'),
    permissionsPolicy: d('permissionsPolicy') || policy,
    baselines: d('baselines'),
    recoveryCommand: d('recoveryCommand'),
    reviewScope: d('reviewScope'),
    outputs: d('outputs'),
  };
}

export interface EvalEnv {
  signals: Signals;
  refs: Refs;
  context: ProfileContext;
}

/** The audience the conditions see: an undeclared audience is «جمهور عام», the safest (10.3, FR-13). */
export function effectiveAudience(context: ProfileContext): 'solo' | 'small_group' | 'public' {
  return context.audience ?? 'public';
}

export function evaluate(c: Condition, env: EvalEnv): boolean {
  if ('always' in c) return true;
  if ('signal' in c) return env.signals[c.signal];
  if ('ref' in c) return env.refs[c.ref];
  if ('audience' in c) return c.audience.includes(effectiveAudience(env.context));
  if ('context' in c) return env.context[c.context] === true;
  if ('all' in c) return c.all.every((x) => evaluate(x, env));
  if ('any' in c) return c.any.some((x) => evaluate(x, env));
  return !evaluate(c.not, env);
}

/** The subjects that make a condition false, as message keys (what the reason names). */
export function unmet(c: Condition, env: EvalEnv): string[] {
  if (evaluate(c, env)) return [];
  if ('signal' in c) return [`profile.signal.${c.signal}`];
  if ('ref' in c) return [`profile.ref.${c.ref}`];
  if ('audience' in c) return [`profile.audience.${effectiveAudience(env.context)}`];
  if ('context' in c) return [`profile.context.${c.context}`];
  if ('all' in c) return c.all.flatMap((x) => unmet(x, env));
  if ('any' in c) return c.any.flatMap((x) => unmet(x, env));
  if ('not' in c) return 'signal' in c.not ? [`profile.signal.${c.not.signal}.present`] : ['profile.condition.excluded'];
  return [];
}
