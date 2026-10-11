// @ayar/adapters (C-15): the twenty adapters of the first release, the guarded report readers, and the choice of the
// adapter for a check's spec. One line per module (docs/waves/README.md 6).
import type { InvocationTemplate, Reason } from '@ayar/protocol';
import type { Adapter, SpecInput, TemplateExtras } from './framework.ts';
import { programOf } from './script.ts';
import { jest } from './tools/jest.ts';
import { biome, eslint, ruff } from './tools/lint.ts';
import { nodeTest } from './tools/node-test.ts';
import { build, custom, k6, stryker } from './tools/other.ts';
import { playwright } from './tools/playwright.ts';
import { pytest } from './tools/pytest.ts';
import { betterleaks, gitleaks, lychee, osv, semgrep } from './tools/security.ts';
import { knip, mypy, pyright, svelteCheck, tsc } from './tools/types.ts';
import { vitest } from './tools/vitest.ts';

export * from './framework.ts';
export * from './script.ts';
export * from './read/guards.ts';
export * from './read/xml.ts';
export * from './read/junit.ts';
export * from './read/sarif.ts';
export * from './read/text.ts';
export { fillTests, isSnapshotMissing, testsExit, type Attempt, type TestResult } from './tools/tests-common.ts';
export { junitFlags } from './tools/node-test.ts';
export { cvssSeverity, LOCAL_ADDRESSES, semgrepRuleId } from './tools/security.ts';
export { buildErrors, mutationScore } from './tools/other.ts';
export { TSC_CONFIG_CODES } from './tools/types.ts';
export { repeatsOf } from './tools/vitest.ts';

/** The adapters of C-15's table (with svelte-check beside tsc, and Gitleaks beside Betterleaks), by catalog runner id. */
export const ADAPTERS: readonly Adapter[] = [vitest, jest, nodeTest, playwright, pytest, eslint, ruff, biome, tsc, svelteCheck, mypy, pyright, knip, build, semgrep, osv, betterleaks, gitleaks, lychee, stryker, k6, custom];

const byId = new Map(ADAPTERS.map((a) => [a.id, a]));

export function adapterById(id: string): Adapter | undefined {
  return byId.get(id);
}

/** The managed tools and their adapters (a check with no project command, C-11). */
const MANAGED: Record<string, string> = { betterleaks: 'betterleaks', gitleaks: 'gitleaks', 'osv-scanner': 'osv-scanner', semgrep: 'semgrep', lychee: 'lychee' };

export type AdapterChoice = { adapter: Adapter; template: InvocationTemplate } | { adapter: null; reason: Reason };

/**
 * The adapter of a check and its final command (C-15 buildInvocation), or why there is none. Null: the check is not
 * an adapter's (an analyzer, the probe, an internal check).
 */
export function adapterFor(spec: SpecInput, extras: TemplateExtras = { configs: {} }): AdapterChoice | null {
  const kind = spec.runner.kind;
  if (kind !== 'adapter' && kind !== 'custom') return null;
  if (spec.checkId.startsWith('custom.') || spec.runner.ids.includes('custom-command')) {
    const t = custom.template(spec, extras);
    return t ? { adapter: custom, template: t } : { adapter: null, reason: { key: 'adapter.reason.noCommand' } };
  }
  if (spec.runner.ids.includes('build-command')) {
    const t = build.template(spec, extras);
    return t ? { adapter: build, template: t } : { adapter: null, reason: { key: 'adapter.reason.noCommand' } };
  }
  if (!spec.command) {
    const key = spec.tool?.key ?? '';
    const a = MANAGED[key] ? byId.get(MANAGED[key]) : undefined;
    const t = a?.template(spec, extras) ?? null;
    return a && t ? { adapter: a, template: t } : { adapter: null, reason: { key: 'adapter.reason.noAdapter', params: { tool: key || spec.runner.ids.join(',') } } };
  }
  // A project command: the adapter of the catalog's runners that recognizes its tool, in the catalog's order.
  for (const id of spec.runner.ids) {
    const a = byId.get(id);
    const t = a?.template(spec, extras) ?? null;
    if (a && t) return { adapter: a, template: t };
  }
  const shown = spec.command.script ? spec.command.script.text : spec.command.argv.join(' ');
  const program = programOf(spec.command.script ? shown.split(/\s+/) : spec.command.argv)?.program ?? spec.command.argv[0]!;
  return { adapter: null, reason: { key: 'adapter.reason.noAdapter', params: { tool: program } } };
}
