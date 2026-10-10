// C-10's properties (plan 19 «خصائص المخطِّط»): over the discoveries of real fixture projects and random choices —
// profile overrides, readiness, the mode and its instances — the plan never runs an instance twice (once in the
// plan, once in the order, a covered one never also run), it contains every dependency its running items need
// (ordered before them), and it refuses to leave a required check out of the full scan. And it is deterministic.
import { loadCatalog } from '@ayar/catalog';
import type { CheckSpec, DiscoverySnapshot, Readiness, RunSelection } from '@ayar/protocol';
import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discover } from '../src/discovery/discover.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { buildPlan, PlanError, type PlanInput, type ResolvedSelection } from '../src/planner/plan.ts';
import { computeSignals, evaluate, factsOf, computeRefs } from '../src/profile/signals.ts';
import { emptySettings, proposeChecks } from '../src/profile/propose.ts';
import type { InstanceReadiness } from '../src/setup/readiness.ts';
import { tempRoot } from './support/tmp.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const REPO = new URL('../../../', import.meta.url).pathname;

interface Project {
  name: string;
  facts: DiscoverySnapshot['facts'];
  components: DiscoverySnapshot['components'];
}
const projects: Project[] = [];
let cleanup: () => void = () => {};

beforeAll(async () => {
  const t = tempRoot('ayar-DEV-5-planner-');
  cleanup = t.cleanup;
  for (const [fx, variant] of [['FX-EXT', 'good'], ['FX-MONO', 'good'], ['FX-PY', 'good'], ['FX-PROC', 'good'], ['FX-NOISY', 'good']] as const) {
    const out = execFileSync(process.execPath, [join(REPO, 'fixtures/tools/materialize.mjs'), fx, variant, join(t.dir, fx)], { encoding: 'utf8' }).trim().split('\n').pop()!;
    const r = await discover({ root: out, fs: nodeFileSystem, limits: { maxDepth: 12, maxEntries: 100_000, maxConfigBytes: 2 * 1024 * 1024 }, signal: new AbortController().signal, fingerprint: (d) => hash(Buffer.from(d).toString('hex')) });
    projects.push({ name: fx, facts: r.facts, components: r.components });
  }
}, 60_000);
afterAll(() => cleanup());

const READINESS: Readiness[] = ['ready', 'ready', 'ready', 'needs_setup', 'needs_approval', 'untrusted'];

function input(specs: CheckSpec[], facts: Project['facts'], readiness: Map<string, Readiness>, resolved: ResolvedSelection, selection: RunSelection): PlanInput {
  const r = new Map<string, InstanceReadiness>(
    specs.map((s) => {
      const inner = (s.applicable ? (readiness.get(s.instance) ?? 'ready') : 'not_applicable') as InstanceReadiness['inner'];
      return [s.instance, { instance: s.instance, readiness: s.enabled && s.included ? inner : 'not_included', inner, reasons: inner === 'ready' ? [] : [{ key: `setup.reason.${inner}` }], actions: [], tool: null }];
    }),
  );
  return {
    id: 'pln_test',
    projectId: 'p',
    createdAt: '2026-10-10T08:00:00.000Z',
    kind: 'full',
    selection,
    resolved,
    catalog,
    specs,
    facts,
    readiness: r,
    approvals: new Map(specs.map((s) => [s.instance, { specHash: s.specHash }])),
    profileVersion: 1,
    profileHash: 'h',
    untrusted: false,
    history: new Map(),
    previousRunId: null,
    reviews: false,
    setupActionId: () => 'set_x',
  };
}

/** Random profile overrides, kept consistent (7.4: a required check stays included). */
const overridesArb = (instances: string[]) =>
  fc.dictionary(fc.constantFrom(...instances), fc.record({ included: fc.boolean(), enabled: fc.boolean() }), { maxKeys: 12 }).map((o) => {
    const out: Record<string, { included?: boolean; enabled?: boolean; required?: boolean }> = {};
    for (const [k, v] of Object.entries(o)) out[k] = v.enabled === false ? { enabled: false } : v.included ? { included: true } : { included: false, required: false };
    return out;
  });

const ACTIVE = new Set(['run', 'shared', 'covered', 'missing', 'untrusted']);

describe('C-10 planner properties (plan 19)', () => {
  it('never runs an instance twice, includes every dependency before its dependant, and is deterministic', () => {
    for (const project of projects) {
      const base = proposeChecks({ catalog, components: project.components, facts: project.facts, settings: emptySettings(), state: { reviews: false }, hash });
      const instances = base.map((s) => s.instance);
      fc.assert(
        fc.property(
          overridesArb(instances),
          fc.dictionary(fc.constantFrom(...instances), fc.constantFrom(...READINESS), { maxKeys: 20 }),
          fc.oneof(
            fc.constant<ResolvedSelection>({ kind: 'full' }),
            fc.constantFrom(...catalog.sections.map((s) => s.id)).map((section): ResolvedSelection => ({ kind: 'section', section })),
            fc.subarray(instances, { minLength: 1, maxLength: 8 }).map((x): ResolvedSelection => ({ kind: 'instances', instances: x, explicit: true })),
          ),
          (overrides, ready, resolved) => {
            const settings = { ...emptySettings(), overrides };
            const specs = proposeChecks({ catalog, components: project.components, facts: project.facts, settings, state: { reviews: false }, hash });
            const sel: RunSelection = resolved.kind === 'instances' ? { kind: 'group', instances: [...resolved.instances] } : resolved.kind === 'section' ? { kind: 'section', section: resolved.section } : { kind: 'full' };
            const i = input(specs, project.facts, new Map(Object.entries(ready)), resolved, sel);
            const plan = buildPlan(i);
            // Never twice.
            expect(new Set(plan.items.map((x) => x.instance)).size).toBe(plan.items.length);
            expect(new Set(plan.order).size).toBe(plan.order.length);
            for (const it of plan.items.filter((x) => x.status === 'covered')) {
              const by = plan.items.find((x) => x.instance === it.coveredBy);
              // 9.4 point 5: only a check that will run covers another (never a «ناقص» one).
              expect(by?.status, `${it.instance} covered by a check that runs`).toBe('run');
            }
            // Every dependency of what is in the plan, with the dependency first.
            for (const it of plan.items.filter((x) => ACTIVE.has(x.status))) {
              const def = catalog.check(it.checkId);
              for (const dep of def?.relations.dependsOn ?? []) {
                const depDef = catalog.check(dep.check)!;
                const facts = factsOf(project.facts, def!.scope === 'project' ? 'all' : it.component);
                if (dep.when && !evaluate(dep.when, { signals: computeSignals(facts, { reviews: false }), refs: computeRefs(facts, {}), context: settings.context })) continue;
                const target = `${dep.check}@${depDef.scope === 'project' ? '.' : it.component}`;
                if (!specs.find((s) => s.instance === target)?.applicable) continue;
                const d = plan.items.find((x) => x.instance === target);
                expect(d && ACTIVE.has(d.status), `${it.instance} needs ${target}`).toBe(true);
                expect(it.dependsOn).toContain(target);
                expect(plan.order.indexOf(target)).toBeLessThan(plan.order.indexOf(it.instance));
              }
            }
            // Untrusted readiness leaves the project command out; not ready is «ناقص» (never set up here).
            for (const it of plan.items.filter((x) => x.status === 'run')) expect(i.readiness.get(it.instance)?.inner).toBe('ready');
            // Deterministic.
            expect(buildPlan(i)).toEqual(plan);
          },
        ),
        { numRuns: 60, seed: 5 },
      );
    }
  });

  it('refuses to leave a required check out of the full scan, and leaves any other out', () => {
    for (const project of projects) {
      const specs = proposeChecks({ catalog, components: project.components, facts: project.facts, settings: emptySettings(), state: { reviews: false }, hash });
      const applicable = specs.filter((s) => s.applicable).map((s) => s.instance);
      fc.assert(
        fc.property(fc.subarray(applicable, { minLength: 1, maxLength: 6 }), (exclude) => {
          const required = exclude.filter((x) => specs.find((s) => s.instance === x)!.required);
          const run = () => buildPlan(input(specs, project.facts, new Map(), { kind: 'fullExcluding', exclude }, { kind: 'fullExcluding', exclude }));
          if (required.length) {
            expect(run).toThrow(PlanError);
            try {
              run();
            } catch (e) {
              expect((e as PlanError).reason).toBe('required_excluded');
            }
          } else {
            const plan = run();
            for (const x of exclude) expect(plan.items.some((i) => i.instance === x && i.origin !== 'dependency')).toBe(false);
          }
        }),
        { numRuns: 40, seed: 7 },
      );
    }
  });

  it('a covering check that is not ready covers nothing: the covered one runs on its own (9.4 point 5)', () => {
    const project = projects.find((p) => p.name === 'FX-EXT')!;
    for (const included of [true, false]) {
      const settings = { ...emptySettings(), overrides: { 'beh.stability@.': included ? { included: true } : { included: false, required: false } } };
      const specs = proposeChecks({ catalog, components: project.components, facts: project.facts, settings, state: { reviews: false }, hash });
      expect(specs.find((s) => s.instance === 'beh.stability@.')?.applicable).toBe(true);
      // beh.stability needs its approval (changed after it, or chosen without being included); beh.unit is ready.
      const ready = new Map<string, Readiness>([['beh.stability@.', 'needs_approval']]);
      const resolved: ResolvedSelection = included ? { kind: 'full' } : { kind: 'instances', instances: ['beh.unit@.', 'beh.stability@.'], explicit: true };
      const sel: RunSelection = included ? { kind: 'full' } : { kind: 'group', instances: ['beh.unit@.', 'beh.stability@.'] };
      const plan = buildPlan(input(specs, project.facts, ready, resolved, sel));
      const item = (x: string) => plan.items.find((i) => i.instance === x);
      expect(item('beh.stability@.'), String(included)).toMatchObject({ status: 'missing', readiness: 'needs_approval' });
      expect(item('beh.unit@.'), String(included)).toMatchObject({ status: 'run', readiness: 'ready', coveredBy: null });
      expect(plan.order).toContain('beh.unit@.');
    }
    // Both ready: beh.unit is covered by beh.stability, as AT-07 shows.
    const settings = { ...emptySettings(), overrides: { 'beh.stability@.': { included: true } } };
    const specs = proposeChecks({ catalog, components: project.components, facts: project.facts, settings, state: { reviews: false }, hash });
    const plan = buildPlan(input(specs, project.facts, new Map(), { kind: 'full' }, { kind: 'full' }));
    expect(plan.items.find((i) => i.instance === 'beh.unit@.')).toMatchObject({ status: 'covered', coveredBy: 'beh.stability@.' });
  });
});
