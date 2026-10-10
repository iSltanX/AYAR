// What C-12 runs for an instance (C-12 «المدخلات: مواصفات الاستدعاء من المحولات»): the adapter's template that the
// approval showed literally (CheckSpec.invocation, C-15), expanded into its steps (template.ts) with AYAR's folders,
// the managed or system tool (C-11), and, for a project command, the chosen tool version first on PATH (C-07 point
// 3). A check whose runner is an adapter but whose tool no adapter knows has nothing approved to run: «تعذّر» with
// why, never a guessed result. The analyzers run inside the engine (run.ts); the probe (DEV-7) and the internal
// integrity checks (DEV-9) are not here yet: such an instance ends «تعذّر» because its runner is not available.
import { adapterFor } from '@ayar/adapters';
import type { CheckSpec, InvocationTemplate, Reason } from '@ayar/protocol';
import { posix } from 'node:path';
import type { ToolLocation } from '../tools/service.ts';
import { expandTemplate, type Step } from './template.ts';

export interface InvocationPlan {
  template: InvocationTemplate;
  steps: Step[];
  /** Added to every step's computed child environment (C-07 point 5), before the step's own variables. */
  env: Record<string, string>;
  /** Tool versions recorded with the evidence (9.9). */
  toolVersions: Record<string, string>;
}

export type InvocationResult = { ok: true; plan: InvocationPlan } | { ok: false; outcome: 'missing' | 'unavailable'; reason: Reason };

export interface InvocationContext {
  spec: CheckSpec;
  projectRoot: string;
  reportsDir: string;
  tmpDir: string;
  tool: ToolLocation | null;
  osvDbDir: string;
  /** PATH of the computed environment (to put a chosen tool version first, and Semgrep's stand-in git before it). */
  path: string;
  /** The run's inventory (relative to the root): `{targets}`. */
  inventory: readonly string[];
}

export function resolveInvocation(c: InvocationContext): InvocationResult {
  const { spec } = c;
  const t = spec.invocation;
  if (!t) {
    if (spec.runner.kind === 'adapter' || spec.runner.kind === 'custom') {
      const choice = adapterFor(spec);
      if (choice && choice.adapter === null) return { ok: false, outcome: 'unavailable', reason: choice.reason };
    }
    return { ok: false, outcome: 'unavailable', reason: { key: 'run.reason.runnerUnavailable', params: { runner: spec.runner.ids.join(',') || spec.runner.kind } } };
  }
  const managed = spec.tool?.source === 'managed' || spec.tool?.source === 'system';
  if (managed && !spec.command && !c.tool) return { ok: false, outcome: 'missing', reason: { key: 'run.reason.toolMissing', params: { tool: spec.tool?.key ?? t.adapter } } };
  const x = expandTemplate(t, { root: c.projectRoot, reportsDir: c.reportsDir, tmpDir: c.tmpDir, tool: c.tool?.path ?? null, path: c.path, osvDb: c.osvDbDir, inventory: c.inventory, component: spec.component });
  if (!x.ok) return x;
  const env: Record<string, string> = {};
  // C-07 point 3: a matching installed version chosen in the profile comes first on PATH (it was approved).
  if (spec.tool?.path) env.PATH = [posix.dirname(spec.tool.path), c.path].filter(Boolean).join(':');
  const toolVersions: Record<string, string> = { [`adapter:${t.adapter}`]: t.adapterVersion };
  if (c.tool) toolVersions[c.tool.key] = c.tool.version;
  return { ok: true, plan: { template: t, steps: x.steps, env, toolVersions } };
}
