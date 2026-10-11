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
import { buildPlan, invocationKey, PlanError, type PlanInput, type ResolvedSelection } from '../src/planner/plan.ts';
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

// ── The plan, item by item (Q-05: the planner's tests assert what the plan says, not only its properties) ──────────
// Specs written by hand against the real catalog, so each rule of C-10 is seen on its own: what an item carries from
// its spec, its status and why, what is added, dropped, covered or shared, the order, the estimate, and what will
// not run.

type Inner = InstanceReadiness['inner'];
function S(instance: string, o: Partial<CheckSpec> = {}): CheckSpec {
  const [checkId, component] = instance.split('@') as [string, string];
  const d = catalog.check(checkId) ?? catalog.check('custom.*')!;
  return {
    instance, checkId, checkVersion: d.version, component, section: d.section, criterion: d.criterion ?? null,
    applicable: true, enabled: true, required: false, blocking: false, included: true, inIndex: d.inIndex, reasons: [],
    runner: { kind: d.runner.kind, ids: [...d.runner.ids] }, command: null, tool: null, invocation: null,
    env: { explicit: {}, allowSensitive: [] }, references: [], referenceValues: {}, customSuccess: null,
    timeoutMin: 10, idleTimeoutSec: null, services: [], resourceClass: 'light', warningsPolicy: 'warn', flakyPolicy: 'flaky',
    thresholds: null, sideEffects: { runsProjectCode: false, writesRepo: 'no' }, network: 'none', cost: 'local',
    missing: [], danger: [], refused: [], specHash: `h:${instance}`, ...o,
  };
}
const cmd = (...argv: string[]): CheckSpec['command'] => ({ argv, cwd: '.', script: null, from: 'tool' });
interface Opts {
  resolved?: ResolvedSelection;
  ready?: Record<string, Inner | Partial<InstanceReadiness>>;
  history?: Record<string, number[]>;
  approvals?: Record<string, string>;
  facts?: Project['facts'];
  catalog?: typeof catalog;
}
function P(specs: CheckSpec[], o: Opts = {}) {
  const readiness = new Map<string, InstanceReadiness>();
  for (const [k, v] of Object.entries(o.ready ?? {})) {
    const r = typeof v === 'string' ? { inner: v } : v;
    const inner = r.inner ?? 'ready';
    readiness.set(k, { instance: k, readiness: inner, inner, reasons: inner === 'ready' ? [] : [{ key: `setup.reason.${inner}` }], actions: [], tool: null, ...r });
  }
  const resolved = o.resolved ?? { kind: 'full' };
  return buildPlan({
    id: 'pln_1', projectId: 'prj_1', createdAt: '2026-10-11T08:00:00.000Z', kind: 'full', selection: { kind: 'full' }, resolved, catalog: o.catalog ?? catalog, specs,
    facts: o.facts ?? [], readiness,
    approvals: new Map(Object.entries(o.approvals ?? Object.fromEntries(specs.map((s) => [s.instance, s.specHash]))).map(([k, h]) => [k, { specHash: h }])),
    profileVersion: 3, profileHash: 'ph', untrusted: false, history: new Map(Object.entries(o.history ?? {})), previousRunId: 'run_0', reviews: false,
    setupActionId: (instance, a) => `set:${instance}:${a.kind}`,
  });
}
const at = (plan: ReturnType<typeof P>, instance: string) => plan.items.find((x) => x.instance === instance);

describe('C-10 the plan, item by item', () => {
  it('carries the run\'s identity, and each item what its spec and readiness say', () => {
    const plan = P([S('code.lint@web', { criterion: 'c1', timeoutMin: 7, idleTimeoutSec: 90, network: 'optional', command: cmd('pnpm', 'lint'), tool: { key: 'eslint', source: 'project', runtime: null, path: '/p/node_modules/.bin/eslint' } })]);
    expect(plan).toMatchObject({ id: 'pln_1', projectId: 'prj_1', kind: 'full', selection: { kind: 'full' }, createdAt: '2026-10-11T08:00:00.000Z', profileVersion: 3, profileHash: 'ph', catalogVersion: catalog.version, untrusted: false, previousRunId: 'run_0', frozenAt: null, runId: null });
    expect(at(plan, 'code.lint@web')).toEqual({
      instance: 'code.lint@web', checkId: 'code.lint', checkVersion: catalog.check('code.lint')!.version, component: 'web', section: 'code', criterion: 'c1',
      status: 'run', readiness: 'ready', reasons: [], origin: 'profile', addedFor: [], dependsOn: [], coveredBy: null, sharedInvocationKey: null,
      locks: [], resourceClass: 'light', timeoutMin: 7, idleTimeoutSec: 90, estimateMs: null,
      needs: { network: 'optional', services: [], dataAsset: null }, command: { argv: ['pnpm', 'lint'], cwd: '.' },
      tool: { key: 'eslint', source: 'project', path: '/p/node_modules/.bin/eslint' }, specHash: 'h:code.lint@web', approved: true, setupActions: [],
    });
    expect(plan.order).toEqual(['code.lint@web']);
    expect(plan.willNotRun).toEqual([]);
  });

  it('takes the tool the readiness located over the spec\'s, names the setup actions, and is approved only for this very spec', () => {
    const tool = { key: 'semgrep', source: 'system' as const, path: '/opt/homebrew/bin/semgrep', version: '1.180.0' };
    const specs = [S('sec.sast@.', { tool: { key: 'semgrep', source: 'managed', runtime: null, path: null } }), S('code.types@.', { tool: { key: 'tsc', source: 'project', runtime: null, path: '/p/tsc' } }), S('code.lint@.')];
    const plan = P(specs, { ready: { 'sec.sast@.': { inner: 'needs_setup', tool, actions: [{ kind: 'install_tool', tool: 'semgrep' }] } }, approvals: { 'sec.sast@.': 'h:sec.sast@.', 'code.types@.': 'old' } });
    expect(at(plan, 'sec.sast@.')).toMatchObject({ tool: { key: 'semgrep', source: 'system', path: '/opt/homebrew/bin/semgrep' }, setupActions: ['set:sec.sast@.:install_tool'], approved: true });
    expect(at(plan, 'code.types@.')).toMatchObject({ tool: { key: 'tsc', source: 'project', path: '/p/tsc' }, approved: false });
    expect(at(plan, 'code.lint@.')).toMatchObject({ tool: null, approved: false, command: null });
  });

  it('locks what two checks must not hold at once: heavy work, the browser, a build\'s folder, a service\'s ports', () => {
    const svc = { id: 'api', argv: ['node', 'server.js'], cwd: '.', readyUrl: null, readyPattern: null, readyTimeoutSec: 30, ports: [5432, 3000] };
    const plan = P([
      S('beh.unit@a', { resourceClass: 'heavy' }), S('beh.integration@a', { resourceClass: 'very_heavy' }), S('beh.contract@a', { resourceClass: 'medium' }),
      S('design.a11y@a'), S('beh.e2e@a', { services: [svc] }), S('code.build@a'), S('code.lint@a', { resourceClass: 'giant' }),
    ]);
    expect(Object.fromEntries(plan.items.map((x) => [x.instance, x.locks]))).toEqual({
      'beh.unit@a': ['heavy'], 'beh.integration@a': ['heavy'], 'beh.contract@a': [], 'design.a11y@a': ['browser'], 'beh.e2e@a': ['browser', 'port:3000', 'port:5432'], 'code.build@a': ['fs:a'], 'code.lint@a': [],
    });
    expect(Object.fromEntries(plan.items.map((x) => [x.instance, x.resourceClass]))).toMatchObject({ 'beh.unit@a': 'heavy', 'beh.integration@a': 'very_heavy', 'beh.contract@a': 'medium', 'code.lint@a': 'medium', 'code.build@a': 'light' });
    expect(Object.fromEntries(plan.items.map((x) => [x.instance, x.needs.dataAsset]))).toMatchObject({ 'beh.e2e@a': 'browser', 'design.a11y@a': 'browser', 'code.lint@a': null });
    expect(at(plan, 'beh.e2e@a')!.needs.services).toEqual([svc]);
    expect(at(P([S('sec.deps@.')]), 'sec.deps@.')!.needs.dataAsset).toBe('osv-db');
  });

  it('says why each candidate will not run, and which origin put the others in', () => {
    const specs = [
      S('code.lint@.', { applicable: false, reasons: [{ key: 'profile.reason.notApplicable', params: { why: 'no lint' } }, { key: 'profile.reason.other' }] }),
      S('code.types@.', { applicable: false }),
      S('code.unused@.', { enabled: false }),
      S('code.size@.', { included: false, reasons: [{ key: 'profile.reason.defaultOptional' }, { key: 'profile.reason.conditionUnmet', params: { c: 'x' } }, { key: 'profile.reason.other' }] }),
      S('beh.unit@.', { reasons: [{ key: 'profile.reason.alwaysOn' }] }),
      S('beh.integration@.'),
    ];
    const plan = P(specs);
    expect(plan.items.map((x) => [x.instance, x.status, x.origin, x.reasons])).toEqual([
      ['code.types@.', 'not_applicable', 'profile', [{ key: 'plan.reason.notApplicable' }]],
      ['code.lint@.', 'not_applicable', 'profile', [{ key: 'profile.reason.notApplicable', params: { why: 'no lint' } }]],
      ['code.unused@.', 'not_included', 'profile', [{ key: 'plan.reason.disabled' }]],
      ['code.size@.', 'not_included', 'profile', [{ key: 'plan.reason.notIncludedByProfile' }, { key: 'profile.reason.defaultOptional' }, { key: 'profile.reason.conditionUnmet', params: { c: 'x' } }]],
      ['beh.unit@.', 'run', 'always_on', []],
      ['beh.integration@.', 'run', 'profile', []],
    ].sort((a, b) => plan.items.findIndex((x) => x.instance === a[0]) - plan.items.findIndex((x) => x.instance === b[0])));
    expect(plan.willNotRun).toEqual(plan.items.filter((x) => x.status !== 'run').map((x) => ({ instance: x.instance, status: x.status, reasons: x.reasons })));
    expect(plan.willNotRun.map((x) => x.instance)).toEqual(['code.types@.', 'code.lint@.', 'code.unused@.', 'code.size@.'].sort((a, b) => plan.items.findIndex((x) => x.instance === a) - plan.items.findIndex((x) => x.instance === b)));
    expect(plan.order).toEqual(['beh.unit@.', 'beh.integration@.']);
    // An explicit choice runs a check the profile leaves out, never a disabled one; its origin is the selection.
    const chosen = P(specs, { resolved: { kind: 'instances', instances: ['code.size@.', 'code.unused@.', 'code.lint@.', 'code.size@.'], explicit: true } });
    expect(chosen.items.map((x) => [x.instance, x.status, x.origin])).toEqual([['code.lint@.', 'not_applicable', 'selection'], ['code.unused@.', 'not_included', 'selection'], ['code.size@.', 'run', 'selection']]);
  });

  it('a section runs its own checks only; an unknown section or instance is refused, never guessed', () => {
    const specs = [S('code.lint@.'), S('beh.unit@.'), S('sec.sast@.')];
    expect(P(specs, { resolved: { kind: 'section', section: 'behavior' } }).items.map((x) => x.instance)).toEqual(['beh.unit@.']);
    const refused = (resolved: ResolvedSelection) => {
      try {
        P(specs, { resolved });
      } catch (e) {
        return [(e as PlanError).reason, (e as PlanError).details];
      }
      return null;
    };
    expect(refused({ kind: 'section', section: 'nope' })).toEqual(['unknown_section', { section: 'nope' }]);
    expect(refused({ kind: 'instances', instances: ['beh.unit@.', 'x@.'], explicit: true })).toEqual(['unknown_instance', { instance: 'x@.' }]);
    expect(refused({ kind: 'fullExcluding', exclude: ['y@.'] })).toEqual(['unknown_instance', { instance: 'y@.' }]);
    // Leaving out: a required check cannot be, unless it does not apply.
    const req = [S('code.lint@.', { required: true }), S('code.types@.', { required: true, applicable: false }), S('beh.unit@.')];
    expect(refused({ kind: 'fullExcluding', exclude: ['code.lint@.'] }) ?? null).toEqual(null);
    expect((() => { try { P(req, { resolved: { kind: 'fullExcluding', exclude: ['code.lint@.'] } }); } catch (e) { return [(e as PlanError).reason, (e as PlanError).details]; } return null; })()).toEqual(['required_excluded', { instance: 'code.lint@.' }]);
    expect(P(req, { resolved: { kind: 'fullExcluding', exclude: ['code.types@.', 'beh.unit@.'] } }).items.map((x) => x.instance)).toEqual(['code.lint@.']);
  });

  it('adds what a running check depends on, with why and for whom, before it; only what applies, only when its condition holds', () => {
    const plan = P([S('code.size@web'), S('code.build@web', { included: false }), S('code.size@api'), S('code.build@api', { applicable: false })]);
    expect(at(plan, 'code.build@web')).toMatchObject({ status: 'run', origin: 'dependency', addedFor: ['code.size@web'], reasons: [{ key: 'plan.reason.addedAsDependency', params: { for: 'code.size@web' } }] });
    expect(at(plan, 'code.size@web')!.dependsOn).toEqual(['code.build@web']);
    expect(plan.order.indexOf('code.build@web')).toBeLessThan(plan.order.indexOf('code.size@web'));
    // Not applicable where it is needed: not added, and nothing to wait for.
    expect(at(plan, 'code.build@api')).toMatchObject({ status: 'not_applicable' });
    expect(at(plan, 'code.size@api')).toMatchObject({ status: 'run', dependsOn: [] });
    // A dependency the profile runs anyway keeps its own origin.
    const own = P([S('code.size@.'), S('code.build@.')]);
    expect(at(own, 'code.build@.')).toMatchObject({ status: 'run', origin: 'profile', addedFor: [], reasons: [] });
    expect(at(own, 'code.size@.')!.dependsOn).toEqual(['code.build@.']);
    // A dependency under a condition (the manifest is generated by the build): only when the facts say so.
    const ext = projects.find((p) => p.name === 'FX-EXT')!;
    const specs = [S('sec.ext.manifest@.'), S('design.a11y@.'), S('code.size@.'), S('code.build@.', { included: false })];
    const withFacts = P(specs, { facts: ext.facts });
    const build = at(withFacts, 'code.build@.')!;
    expect(build).toMatchObject({ status: 'run', origin: 'dependency' });
    expect([...build.addedFor].sort()).toEqual(['code.size@.', 'design.a11y@.']);
    expect(at(withFacts, 'design.a11y@.')!.dependsOn).toEqual(['code.build@.']);
    // FX-EXT's facts do not say its manifest is generated by the build: that condition does not hold.
    expect(at(withFacts, 'sec.ext.manifest@.')!.dependsOn).toEqual([]);
    const without = P(specs, { facts: [] });
    expect(at(without, 'code.build@.')).toMatchObject({ addedFor: ['code.size@.'] });
    expect(at(without, 'design.a11y@.')!.dependsOn).toEqual([]);
    expect(at(without, 'sec.ext.manifest@.')!.dependsOn).toEqual([]);
  });

  it('keeps one of two alternatives: the one that is ready, else the first in the catalog; the other says which', () => {
    const both = [S('sec.deps@.'), S('sec.deps.audit@.')];
    const pick = (ready: Opts['ready']) => { const p = P(both, { ready }); return [at(p, 'sec.deps@.')!, at(p, 'sec.deps.audit@.')!].map((x) => [x.status, x.reasons]); };
    expect(pick({})).toEqual([['run', []], ['not_included', [{ key: 'plan.reason.alternativeOf', params: { other: 'sec.deps@.' } }]]]);
    expect(pick({ 'sec.deps@.': 'needs_setup' })).toEqual([['not_included', [{ key: 'plan.reason.alternativeOf', params: { other: 'sec.deps.audit@.' } }]], ['run', []]]);
    expect(pick({ 'sec.deps.audit@.': 'needs_approval' })).toEqual([['run', []], ['not_included', [{ key: 'plan.reason.alternativeOf', params: { other: 'sec.deps@.' } }]]]);
    expect(pick({ 'sec.deps@.': 'needs_setup', 'sec.deps.audit@.': 'needs_setup' })[1]![0]).toBe('not_included');
    // Only between two that would run.
    const one = P([S('sec.deps@.'), S('sec.deps.audit@.', { included: false })]);
    expect([at(one, 'sec.deps@.')!.status, at(one, 'sec.deps.audit@.')!.reasons]).toEqual(['run', [{ key: 'plan.reason.notIncludedByProfile' }]]);
  });

  it('a check that is not ready is «ناقص» with the readiness\'s reasons first; an untrusted one is left out (FR-55)', () => {
    const plan = P([S('code.size@.'), S('code.build@.', { included: false }), S('code.lint@.'), S('code.types@.')], {
      ready: { 'code.build@.': 'needs_setup', 'code.lint@.': 'untrusted', 'code.types@.': { inner: 'needs_approval', reasons: [{ key: 'setup.reason.changed' }] } },
    });
    expect(at(plan, 'code.build@.')).toMatchObject({ status: 'missing', readiness: 'needs_setup', reasons: [{ key: 'setup.reason.needs_setup' }, { key: 'plan.reason.addedAsDependency', params: { for: 'code.size@.' } }] });
    expect(at(plan, 'code.lint@.')).toMatchObject({ status: 'untrusted', readiness: 'untrusted', reasons: [{ key: 'setup.reason.untrusted' }] });
    expect(at(plan, 'code.types@.')).toMatchObject({ status: 'missing', readiness: 'needs_approval', reasons: [{ key: 'setup.reason.changed' }] });
    expect(plan.willNotRun.map((x) => [x.instance, x.status])).toEqual(expect.arrayContaining([['code.build@.', 'missing'], ['code.lint@.', 'untrusted'], ['code.types@.', 'missing']]));
    expect(plan.willNotRun.some((x) => x.instance === 'code.size@.')).toBe(false);
    // In the plan still, waiting: what will not run is ordered too (the scheduler records it).
    expect([...plan.order].sort()).toEqual(['code.build@.', 'code.lint@.', 'code.size@.', 'code.types@.']);
  });

  it('covers what an including check runs, in its own component, and the covered waits for it', () => {
    const plan = P([S('beh.unit@a'), S('beh.stability@a'), S('beh.unit@b')], { history: { 'beh.unit@a': [100], 'beh.stability@a': [500], 'beh.unit@b': [40] } });
    expect(at(plan, 'beh.unit@a')).toMatchObject({ status: 'covered', coveredBy: 'beh.stability@a', reasons: [{ key: 'plan.reason.coveredBy', params: { by: 'beh.stability@a' } }] });
    expect(at(plan, 'beh.unit@b')).toMatchObject({ status: 'run', coveredBy: null });
    expect(plan.order.indexOf('beh.stability@a')).toBeLessThan(plan.order.indexOf('beh.unit@a'));
    // The estimate counts what runs: the covered one runs inside the covering one.
    expect(plan.estimateMs).toBe(540);
    expect(plan.willNotRun).toEqual([]);
  });

  it('shares one execution only for a declared pair with the very same invocation, in one component (D-45)', () => {
    const c = cmd('pnpm', 'exec', 'playwright', 'test');
    const pair = P([S('beh.e2e@.', { command: c }), S('perf.compat@.', { command: c })]);
    const key = at(pair, 'beh.e2e@.')!.sharedInvocationKey;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(at(pair, 'perf.compat@.')).toMatchObject({ status: 'shared', sharedInvocationKey: key, reasons: [{ key: 'plan.reason.sharesExecution', params: { with: 'beh.e2e@.' } }] });
    expect(at(pair, 'beh.e2e@.')).toMatchObject({ status: 'run', reasons: [] });
    expect(pair.order).toEqual(['beh.e2e@.', 'perf.compat@.']);
    const statuses = (p: ReturnType<typeof P>) => p.items.map((x) => [x.instance, x.status, x.sharedInvocationKey]);
    // Not the same invocation, not a declared pair, not one component, no command: each runs its own.
    expect(statuses(P([S('beh.e2e@.', { command: c }), S('perf.compat@.', { command: cmd('pnpm', 'exec', 'playwright', 'test', '--project=compat') })]))).toEqual([['beh.e2e@.', 'run', null], ['perf.compat@.', 'run', null]]);
    expect(statuses(P([S('beh.unit@.', { command: c }), S('beh.integration@.', { command: c })]))).toEqual([['beh.unit@.', 'run', null], ['beh.integration@.', 'run', null]]);
    expect(statuses(P([S('beh.e2e@a', { command: c }), S('perf.compat@b', { command: c })]))).toEqual([['beh.e2e@a', 'run', null], ['perf.compat@b', 'run', null]]);
    expect(statuses(P([S('beh.e2e@.'), S('perf.compat@.')]))).toEqual([['beh.e2e@.', 'run', null], ['perf.compat@.', 'run', null]]);
  });

  it('the invocation key is the whole invocation: each part changes it, the runners\' order does not', () => {
    const base = S('beh.unit@web', { command: cmd('pnpm', 'test'), runner: { kind: 'adapter', ids: ['vitest', 'jest'] }, tool: { key: 'vitest', source: 'project', runtime: null, path: '/p/v' } });
    const k = invocationKey(base);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(invocationKey({ ...base, runner: { kind: 'adapter', ids: ['jest', 'vitest'] } })).toBe(k);
    expect(invocationKey({ ...base, checkId: 'beh.integration', instance: 'beh.integration@web' })).toBe(k);
    for (const changed of [
      { ...base, command: cmd('pnpm', 'test', '--', 'x') },
      { ...base, command: { ...base.command!, cwd: 'web' } },
      { ...base, component: 'api' },
      { ...base, env: { explicit: { CI: '1' }, allowSensitive: [] } },
      { ...base, tool: { ...base.tool!, path: '/q/v' } },
      { ...base, services: [{ id: 'db', argv: ['x'], cwd: '.', readyUrl: null, readyPattern: null, readyTimeoutSec: 5, ports: [1] }] },
      { ...base, runner: { kind: 'adapter', ids: ['vitest'] } },
    ]) expect(invocationKey(changed)).not.toBe(k);
    expect(invocationKey(S('code.lint@.'))).toBeNull();
  });

  it('orders by the catalog, then by name; a check outside the catalog last; a cycle is refused', () => {
    const plan = P([S('beh.unit@b'), S('custom.zz@.', { section: 'custom' }), S('code.lint@b'), S('beh.unit@a'), S('code.lint@a')]);
    expect(plan.order).toEqual(['code.lint@a', 'code.lint@b', 'beh.unit@a', 'beh.unit@b', 'custom.zz@.']);
    expect(plan.items.map((x) => x.instance)).toEqual(plan.order);
    // A dependency cycle cannot be waited out: refused, with its members.
    const build = catalog.check('code.build')!;
    const cyclic = { ...catalog, check: (id: string) => (id === 'code.build' ? { ...build, relations: { ...build.relations, dependsOn: [{ check: 'code.size' }] } } : catalog.check(id)) };
    let error: PlanError | null = null;
    try {
      P([S('code.size@.'), S('code.build@.'), S('code.lint@.')], { catalog: cyclic });
    } catch (e) {
      error = e as PlanError;
    }
    expect(error).toBeInstanceOf(PlanError);
    expect([error?.name, error?.reason, error?.message, error?.details]).toEqual(['PlanError', 'dependency_cycle', 'dependency_cycle', { instances: 'code.size@.,code.build@.' }]);
  });

  it('estimates from the median of the last five durations, marked as such, and the plan only when every run has one', () => {
    const est = (h: number[]) => at(P([S('code.lint@.')], { history: { 'code.lint@.': h } }), 'code.lint@.')!.estimateMs;
    expect([est([30, 10, 20]), est([10, 20, 30, 40]), est([10, 11]), est([5, 1, 4, 2, 3, 900, 1000]), est([])]).toEqual([20, 25, 11, 3, null]);
    expect(P([S('code.lint@.'), S('code.types@.')], { history: { 'code.lint@.': [100], 'code.types@.': [250, 350] } }).estimateMs).toBe(400);
    expect(P([S('code.lint@.'), S('code.types@.')], { history: { 'code.lint@.': [100] } }).estimateMs).toBeNull();
    expect(P([S('code.lint@.', { included: false })], { history: { 'code.lint@.': [100] } }).estimateMs).toBeNull();
    // What will not run counts for nothing.
    expect(P([S('code.lint@.'), S('code.types@.', { included: false })], { history: { 'code.lint@.': [100] } }).estimateMs).toBe(100);
  });
});
