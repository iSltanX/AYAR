// C-10 the planner [D-24, D-45, 10.2, FR-18 to FR-20]: from a selection to an explicit plan, shown before anything
// runs. Its steps, in order: the candidates of the mode; applicability; the profile's inclusion; «يشمل» removes
// the duplicate (the included check is «مشمول بـ» and inherits the covering check's verdict, it never runs again);
// «يعتمد على» adds what is depended on, with a note; one of two alternatives; the readiness label (a check that is
// not ready is «ناقص» and never set up implicitly; in «مشروع غير موثوق» a project command is left out, FR-55);
// shared execution only for a full invocation-key match of a declared pair (D-45: never for equal text alone);
// resource locks; an order with no cycle; estimates from history marked «تقديري»; and what will not run, and why.
// A pure function: the property tests drive it directly.
import { canonicalJson, type Catalog, type CheckDefinition } from '@ayar/catalog';
import type { CheckSpec, Fact, PlanItem, PlanItemStatus, Reason, RunKind, RunPlan, RunSelection } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { computeSignals, evaluate, factsOf, computeRefs, type EvalEnv } from '../profile/signals.ts';
import type { InstanceReadiness } from '../setup/readiness.ts';

export class PlanError extends Error {
  readonly reason: string;
  readonly details: Record<string, string>;
  constructor(reason: string, details: Record<string, string> = {}) {
    super(reason);
    this.name = 'PlanError';
    this.reason = reason;
    this.details = details;
  }
}

/** The candidates of a selection, resolved by the service (a saved group, a previous run's outcomes). */
export type ResolvedSelection =
  | { kind: 'full' }
  | { kind: 'section'; section: string }
  | { kind: 'instances'; instances: readonly string[]; explicit: true }
  | { kind: 'fullExcluding'; exclude: readonly string[] };

export interface PlanInput {
  id: string;
  projectId: string;
  createdAt: string;
  kind: RunKind;
  selection: RunSelection;
  resolved: ResolvedSelection;
  catalog: Catalog;
  specs: readonly CheckSpec[];
  facts: readonly Fact[];
  readiness: ReadonlyMap<string, InstanceReadiness>;
  approvals: ReadonlyMap<string, { specHash: string }>;
  profileVersion: number;
  profileHash: string;
  untrusted: boolean;
  /** Durations (ms) of earlier finished executions per instance, newest first. */
  history: ReadonlyMap<string, readonly number[]>;
  previousRunId: string | null;
  reviews: boolean;
  setupActionId: (instance: string, seed: InstanceReadiness['actions'][number]) => string;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function defOf(catalog: Catalog, checkId: string): CheckDefinition | undefined {
  return catalog.check(checkId) ?? (checkId.startsWith('custom.') ? catalog.check('custom.*') : undefined);
}

function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2);
}

/**
 * The invocation key (C-10 point 4): the command and its arguments, the folder, the component, the differences of
 * environment, the tool's path, the companion services, and the runner that maps its reports. Only a full match
 * shares an execution.
 */
export function invocationKey(spec: CheckSpec): string | null {
  if (!spec.command) return null;
  return sha(canonicalJson({ argv: spec.command.argv, cwd: spec.command.cwd, component: spec.component, env: spec.env, tool: spec.tool?.path ?? null, services: spec.services, runner: [...spec.runner.ids].sort() }));
}

export function buildPlan(i: PlanInput): RunPlan {
  const bySpec = new Map(i.specs.map((s) => [s.instance, s]));
  const catalogOrder = new Map(i.catalog.checks.map((c, n) => [c.id, n]));
  const order = (instance: string) => {
    const s = bySpec.get(instance);
    return [catalogOrder.get(s?.checkId ?? '') ?? 1e6, instance] as const;
  };
  const cmp = (a: string, b: string) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0);
  };
  const envFor = new Map<string, EvalEnv>();
  const env = (component: string, scope: 'project' | 'component') => {
    const k = scope === 'project' ? 'all' : component;
    if (!envFor.has(k)) {
      const facts = factsOf(i.facts, k);
      envFor.set(k, { signals: computeSignals(facts, { reviews: i.reviews }), refs: computeRefs(facts, {}), context: { audience: null, worstConsequence: null, persistentData: null, permissions: null, stage: null, uiLanguages: null } });
    }
    return envFor.get(k)!;
  };

  // 1. The candidates of the mode.
  let candidates: string[];
  const explicit = i.resolved.kind === 'instances';
  switch (i.resolved.kind) {
    case 'full':
      candidates = i.specs.map((s) => s.instance);
      break;
    case 'section': {
      const section = i.resolved.section;
      if (!i.catalog.sections.some((s) => s.id === section)) throw new PlanError('unknown_section', { section });
      candidates = i.specs.filter((s) => s.section === section).map((s) => s.instance);
      break;
    }
    case 'fullExcluding': {
      for (const x of i.resolved.exclude) {
        const s = bySpec.get(x);
        if (!s) throw new PlanError('unknown_instance', { instance: x });
        // 7.4: a required check is never left out of the full scan (AT-07).
        if (s.applicable && s.required) throw new PlanError('required_excluded', { instance: x });
      }
      const ex = new Set(i.resolved.exclude);
      candidates = i.specs.map((s) => s.instance).filter((x) => !ex.has(x));
      break;
    }
    case 'instances':
      for (const x of i.resolved.instances) if (!bySpec.has(x)) throw new PlanError('unknown_instance', { instance: x });
      candidates = [...new Set(i.resolved.instances)];
      break;
  }

  const items = new Map<string, PlanItem>();
  const make = (spec: CheckSpec, status: PlanItemStatus, origin: PlanItem['origin'], reasons: Reason[]): PlanItem => {
    const def = defOf(i.catalog, spec.checkId);
    const r = i.readiness.get(spec.instance);
    const locks = new Set<string>();
    if (spec.resourceClass === 'heavy' || spec.resourceClass === 'very_heavy') locks.add('heavy');
    if (def?.runner.kind === 'probe' || def?.requirements.some((q) => q.kind === 'dataAsset' && q.asset === 'browser')) locks.add('browser');
    if (spec.checkId === 'code.build') locks.add(`fs:${spec.component}`);
    for (const s of spec.services) for (const p of s.ports) locks.add(`port:${p}`);
    const hist = i.history.get(spec.instance) ?? [];
    return {
      instance: spec.instance,
      checkId: spec.checkId,
      checkVersion: spec.checkVersion,
      component: spec.component,
      section: spec.section,
      criterion: spec.criterion,
      status,
      readiness: r?.readiness ?? (spec.applicable ? 'ready' : 'not_applicable'),
      reasons,
      origin,
      addedFor: [],
      dependsOn: [],
      coveredBy: null,
      sharedInvocationKey: null,
      locks: [...locks].sort(),
      resourceClass: (['light', 'medium', 'heavy', 'very_heavy'].includes(spec.resourceClass) ? spec.resourceClass : 'medium') as PlanItem['resourceClass'],
      timeoutMin: spec.timeoutMin,
      idleTimeoutSec: spec.idleTimeoutSec,
      estimateMs: median(hist.slice(0, 5)),
      needs: {
        network: spec.network,
        services: spec.services,
        dataAsset: def?.requirements.find((q) => q.kind === 'dataAsset')?.kind === 'dataAsset' ? (def.requirements.find((q) => q.kind === 'dataAsset') as { asset: 'osv-db' | 'browser' }).asset : null,
      },
      command: spec.command ? { argv: spec.command.argv, cwd: spec.command.cwd } : null,
      tool: r?.tool ? { key: r.tool.key, source: r.tool.source, path: r.tool.path } : spec.tool ? { key: spec.tool.key, source: spec.tool.source, path: spec.tool.path } : null,
      specHash: spec.specHash,
      approved: i.approvals.get(spec.instance)?.specHash === spec.specHash,
      setupActions: (r?.actions ?? []).map((a) => i.setupActionId(spec.instance, a)),
    };
  };

  // 2 and 3. Applicability, then the profile (in the full and section modes; an explicit choice runs a check the
  //    profile leaves optional, but never a disabled one).
  for (const x of candidates) {
    const s = bySpec.get(x)!;
    if (!s.applicable) items.set(x, make(s, 'not_applicable', explicit ? 'selection' : 'profile', s.reasons.filter((r) => r.key === 'profile.reason.notApplicable').length ? s.reasons.filter((r) => r.key === 'profile.reason.notApplicable') : [{ key: 'plan.reason.notApplicable' }]));
    else if (!s.enabled) items.set(x, make(s, 'not_included', explicit ? 'selection' : 'profile', [{ key: 'plan.reason.disabled' }]));
    else if (!explicit && !s.included) items.set(x, make(s, 'not_included', 'profile', [{ key: 'plan.reason.notIncludedByProfile' }, ...s.reasons.filter((r) => r.key === 'profile.reason.conditionUnmet' || r.key === 'profile.reason.defaultOptional')]));
    else items.set(x, make(s, 'run', explicit ? 'selection' : bySpec.get(x)?.reasons.some((r) => r.key === 'profile.reason.alwaysOn') ? 'always_on' : 'profile', []));
  }
  const running = () => [...items.values()].filter((it) => it.status === 'run');

  // 5. Dependencies, to a fixed point (a dependency's own dependencies too).
  for (let changed = true; changed; ) {
    changed = false;
    for (const it of running()) {
      const def = defOf(i.catalog, it.checkId);
      for (const dep of def?.relations.dependsOn ?? []) {
        const depDef = i.catalog.check(dep.check);
        if (!depDef) continue;
        if (dep.when && !evaluate(dep.when, env(it.component, def!.scope))) continue;
        const depInstance = `${dep.check}@${depDef.scope === 'project' ? '.' : it.component}`;
        const depSpec = bySpec.get(depInstance);
        if (!depSpec?.applicable || depInstance === it.instance) continue;
        if (!it.dependsOn.includes(depInstance)) it.dependsOn.push(depInstance);
        const existing = items.get(depInstance);
        if (!existing || existing.status === 'not_included') {
          const added = make(depSpec, 'run', 'dependency', [{ key: 'plan.reason.addedAsDependency', params: { for: it.instance } }]);
          added.addedFor.push(it.instance);
          items.set(depInstance, added);
          changed = true;
        } else if (existing.status === 'run' && existing.origin === 'dependency' && !existing.addedFor.includes(it.instance)) existing.addedFor.push(it.instance);
      }
    }
  }

  // 4. «يشمل»: the covered check does not run again; it inherits the covering execution's verdict (AT-07).
  for (const it of running()) {
    for (const inc of defOf(i.catalog, it.checkId)?.relations.includes ?? []) {
      const covered = items.get(`${inc}@${it.component}`);
      if (covered && covered.status === 'run') {
        covered.status = 'covered';
        covered.coveredBy = it.instance;
        covered.reasons = [{ key: 'plan.reason.coveredBy', params: { by: it.instance } }];
      }
    }
  }

  // Alternatives (10.3): never both; the first in the catalog that is ready, else the first.
  for (const it of running()) {
    for (const alt of defOf(i.catalog, it.checkId)?.relations.alternativeTo ?? []) {
      const other = items.get(`${alt}@${it.component}`);
      if (!other || other.status !== 'run') continue;
      const ready = (x: PlanItem) => i.readiness.get(x.instance)?.inner === 'ready';
      const keep = ready(it) && !ready(other) ? it : ready(other) && !ready(it) ? other : cmp(it.instance, other.instance) <= 0 ? it : other;
      const drop = keep === it ? other : it;
      drop.status = 'not_included';
      drop.reasons = [{ key: 'plan.reason.alternativeOf', params: { other: keep.instance } }];
    }
  }

  // 6. Readiness (9.4 point 5): a check that is not ready is «ناقص» in the plan and is never set up here.
  for (const it of [...items.values()].filter((x) => x.status === 'run' || x.status === 'covered')) {
    const r = i.readiness.get(it.instance);
    const inner = r?.inner ?? 'ready';
    if (it.status === 'run') it.readiness = inner === 'not_applicable' ? 'not_applicable' : inner;
    if (it.status !== 'run' || inner === 'ready') continue;
    it.status = inner === 'untrusted' ? 'untrusted' : 'missing';
    it.reasons = [...(r?.reasons ?? []), ...it.reasons];
  }

  // Shared execution (D-45): a declared pair with the very same invocation key runs once.
  const keys = new Map<string, PlanItem>();
  for (const it of running().sort((a, b) => cmp(a.instance, b.instance))) {
    const key = invocationKey(bySpec.get(it.instance)!);
    if (!key) continue;
    const first = keys.get(key);
    const declared = first && (defOf(i.catalog, first.checkId)?.relations.sharesExecutionWith.includes(it.checkId) || defOf(i.catalog, it.checkId)?.relations.sharesExecutionWith.includes(first.checkId));
    if (first && declared && first.component === it.component) {
      it.status = 'shared';
      it.sharedInvocationKey = key;
      first.sharedInvocationKey = key;
      it.reasons = [{ key: 'plan.reason.sharesExecution', params: { with: first.instance } }];
    } else if (!first) keys.set(key, it);
  }

  // 7. An order with no cycle (Kahn), ties broken by catalog order. What an item waits for is its dependencies,
  //    and the execution it takes its verdict from (the covering one, or the shared one): a cycle through those is
  //    refused here, never left for the scheduler to wait on.
  const inPlan = [...items.values()].filter((x) => ['run', 'shared', 'covered', 'missing', 'untrusted'].includes(x.status));
  const set = new Set(inPlan.map((x) => x.instance));
  const sourceOf = (x: PlanItem): string | null =>
    x.status === 'covered' ? x.coveredBy : x.status === 'shared' ? (inPlan.find((p) => p.status === 'run' && p.sharedInvocationKey === x.sharedInvocationKey)?.instance ?? null) : null;
  const after = new Map(inPlan.map((x) => [x.instance, [...new Set([...x.dependsOn, ...(sourceOf(x) ? [sourceOf(x)!] : [])])].filter((d) => set.has(d) && d !== x.instance)]));
  const indeg = new Map(inPlan.map((x) => [x.instance, after.get(x.instance)!.length]));
  const ready = inPlan.filter((x) => indeg.get(x.instance) === 0).map((x) => x.instance).sort(cmp);
  const ordered: string[] = [];
  while (ready.length) {
    const x = ready.shift()!;
    ordered.push(x);
    for (const y of inPlan.filter((p) => after.get(p.instance)!.includes(x))) {
      indeg.set(y.instance, indeg.get(y.instance)! - 1);
      if (indeg.get(y.instance) === 0) {
        ready.push(y.instance);
        ready.sort(cmp);
      }
    }
  }
  if (ordered.length !== inPlan.length) throw new PlanError('dependency_cycle', { instances: inPlan.filter((x) => !ordered.includes(x.instance)).map((x) => x.instance).join(',') });

  // 8 and 9. Estimates, and what will not run.
  const all = [...items.values()].sort((a, b) => cmp(a.instance, b.instance));
  const runs = all.filter((x) => x.status === 'run');
  const estimateMs = runs.length && runs.every((x) => x.estimateMs !== null) ? runs.reduce((a, x) => a + x.estimateMs!, 0) : null;
  return {
    id: i.id,
    projectId: i.projectId,
    kind: i.kind,
    selection: i.selection,
    createdAt: i.createdAt,
    profileVersion: i.profileVersion,
    profileHash: i.profileHash,
    catalogVersion: i.catalog.version,
    untrusted: i.untrusted,
    items: all,
    order: ordered,
    willNotRun: all.filter((x) => ['not_applicable', 'not_included', 'missing', 'untrusted'].includes(x.status)).map((x) => ({ instance: x.instance, status: x.status, reasons: x.reasons })),
    previousRunId: i.previousRunId,
    estimateMs,
    frozenAt: null,
    runId: null,
  };
}
