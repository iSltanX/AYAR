// C-09 points 1 and 7 (FR-10): the proposal. For every check of the catalog and every instance (`checkId@
// component`, D-45): is it applicable (its condition over the discovery signals) and why not; the defaults of
// the «الافتراضي» column, with the audience declared or treated as «جمهور عام» (FR-13); the user's overrides;
// the literal command and the tool; what is missing (G-39: a reference the user writes is «ناقص إعداد» on an
// included check, while a check conditional on that reference stays optional); dangers (FR-56); and the
// specHash, computed from discovery and profile data alone (D-08), so it exists before anything runs.
import type { Catalog, CheckDefinition, ReferenceKind } from '@ayar/catalog';
import type { CheckOverride, CheckSpec, CustomCheck, DiscoveryComponent, Fact, JsonValue, MissingRequirement, ProfileContext, ProfileReferences, Reason } from '@ayar/protocol';
import { canonicalJson } from '@ayar/catalog';
import { proposeCommand } from './commands.ts';
import { argvText, compilePolicy, judgeCommand, type CompiledPolicy } from './policy.ts';
import { computeRefs, computeSignals, effectiveAudience, evaluate, factsOf, unmet, type EvalEnv } from './signals.ts';

export interface ProfileSettings {
  schema: 'ayar-profile/1';
  context: ProfileContext;
  references: ProfileReferences;
  overrides: Record<string, CheckOverride>;
  custom: Record<string, CustomCheck>;
  /** FR-55 (G-20): the «مشروع غير موثوق» flag, owned here (C-09) and enforced by C-10 and C-12 (DEV-5). Local only. */
  untrusted: boolean;
}

export const EMPTY_CONTEXT: ProfileContext = { audience: null, worstConsequence: null, persistentData: null, permissions: null, stage: null, uiLanguages: null };

export function emptySettings(): ProfileSettings {
  return { schema: 'ayar-profile/1', context: { ...EMPTY_CONTEXT }, references: {}, overrides: {}, custom: {}, untrusted: false };
}

export interface ProposalInput {
  catalog: Catalog;
  components: readonly DiscoveryComponent[];
  facts: readonly Fact[];
  settings: ProfileSettings;
  state: { reviews: boolean };
  /** The spec hash function (HMAC with the install key, C-18). */
  hash: (canonical: string) => string;
}

const policies = new WeakMap<Catalog, CompiledPolicy>();
function policyOf(catalog: Catalog): CompiledPolicy {
  let p = policies.get(catalog);
  if (!p) {
    p = compilePolicy(catalog.commandPolicy);
    policies.set(catalog, p);
  }
  return p;
}

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The value of a reference as the spec sees it: what the user declared, else what discovery found. */
function referenceValue(kind: ReferenceKind, declared: ProfileReferences, facts: readonly Fact[]): unknown {
  if (declared[kind] !== undefined && declared[kind] !== null) return { declared: declared[kind] };
  const fact = (key: string) => facts.find((f) => f.key === key);
  switch (kind) {
    case 'permissionsPolicy':
      return fact('references.permissionsPolicy') ? { discovered: rec(fact('references.permissionsPolicy')!.value).path } : null;
    case 'tokens':
      return fact('references.tokens') ? { discovered: rec(fact('references.tokens')!.value).path } : null;
    case 'budgets':
      return fact('references.sizeBudgets') ? { discovered: rec(fact('references.sizeBudgets')!.value).from } : null;
    case 'renderTarget': {
      const out = fact('references.buildOutput');
      if (fact('type.browserExtension') && out) return { discovered: { kind: 'extension', dir: rec(out.value).dir } };
      if (fact('type.staticSite')) return { discovered: { kind: 'static', dir: '.' } };
      return null;
    }
    default:
      return null;
  }
}

/** The fields that make up the spec hash (C-09 point 1): what runs, where, with what, touching what. */
export function specMaterial(spec: Omit<CheckSpec, 'specHash' | 'reasons'>): unknown {
  return {
    instance: spec.instance,
    check: `${spec.checkId}@${spec.checkVersion}`,
    runner: spec.runner,
    command: spec.command,
    tool: spec.tool,
    env: spec.env,
    references: spec.referenceValues,
    custom: spec.customSuccess,
    timeoutMin: spec.timeoutMin,
    thresholds: spec.thresholds,
    sideEffects: spec.sideEffects,
    network: spec.network,
  };
}

function sameArgv(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** `npm|pnpm|yarn|bun run <script>` (or `yarn <script>`): the script it runs, with its text. */
function scriptRun(argv: readonly string[], facts: readonly Fact[]): { name: string; text: string; pre: string | null; post: string | null; composite: boolean } | null {
  const pm = argv[0];
  const name = argv[1] === 'run' ? argv[2] : pm === 'yarn' ? argv[1] : undefined;
  if (!pm || !['npm', 'pnpm', 'yarn', 'bun'].includes(pm) || !name) return null;
  const s = facts.find((f) => f.key === 'node.script' && rec(f.value).name === name);
  if (!s) return null;
  const v = rec(s.value);
  const all = facts.filter((f) => f.key === 'node.script').map((f) => rec(f.value));
  const prePost = pm === 'npm' || pm === 'yarn';
  const pre = prePost ? (all.find((x) => x.name === `pre${name}`)?.text as string | undefined) ?? null : null;
  const post = prePost ? (all.find((x) => x.name === `post${name}`)?.text as string | undefined) ?? null : null;
  return { name, text: String(v.text), pre, post, composite: v.composite === true };
}

function overriddenFields(o: CheckOverride | undefined): string[] {
  return o ? Object.keys(o).filter((k) => (o as Record<string, unknown>)[k] !== undefined).sort() : [];
}

export function proposeChecks(input: ProposalInput): CheckSpec[] {
  const { catalog, settings } = input;
  const policy = policyOf(catalog);
  const rootFacts = factsOf(input.facts, '.');
  const out: CheckSpec[] = [];
  const audienceUndeclared = settings.context.audience === null;

  for (const def of catalog.checks) {
    if (def.id === 'custom.*') continue;
    const components = def.scope === 'project' ? ['.'] : input.components.map((c) => c.id);
    for (const component of components) {
      const facts = def.scope === 'project' ? factsOf(input.facts, 'all') : factsOf(input.facts, component);
      const env: EvalEnv = { signals: computeSignals(facts, input.state), refs: computeRefs(facts, settings.references), context: settings.context };
      out.push(specFor(def, component, facts, rootFacts, env, input, policy, audienceUndeclared));
    }
  }
  // custom.<name>: the user's own checks (10.3), project scope.
  const customDef = catalog.check('custom.*')!;
  for (const [name, custom] of Object.entries(settings.custom).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const facts = factsOf(input.facts, 'all');
    const env: EvalEnv = { signals: computeSignals(facts, input.state), refs: computeRefs(facts, settings.references), context: settings.context };
    out.push(specFor(customDef, '.', facts, rootFacts, env, input, policy, audienceUndeclared, { name, custom }));
  }
  return out;
}

function specFor(
  def: CheckDefinition,
  component: string,
  facts: readonly Fact[],
  rootFacts: readonly Fact[],
  env: EvalEnv,
  input: ProposalInput,
  policy: CompiledPolicy,
  audienceUndeclared: boolean,
  customEntry?: { name: string; custom: CustomCheck },
): CheckSpec {
  const checkId = customEntry ? `custom.${customEntry.name}` : def.id;
  const instance = `${checkId}@${component}`;
  const override = input.settings.overrides[instance];
  const reasons: Reason[] = [];
  const applicable = customEntry ? true : evaluate(def.applies, env);

  // Defaults (10.3 «الافتراضي», 7.4).
  let required = false;
  let included = false;
  let blocking = false;
  if (!applicable) reasons.push({ key: 'profile.reason.notApplicable', refs: unmet(def.applies, env) });
  else if (customEntry) {
    included = true;
    reasons.push({ key: 'profile.reason.customDefined' });
  } else {
    const d = def.default;
    if (d.kind === 'required') {
      required = true;
      included = true;
      blocking = d.blocking;
      reasons.push({ key: d.blocking ? 'profile.reason.defaultRequiredBlocking' : 'profile.reason.defaultRequired' });
    } else if (d.kind === 'optional') {
      reasons.push({ key: 'profile.reason.defaultOptional' });
      if (d.suggestWhen && evaluate(d.suggestWhen, env)) reasons.push({ key: 'profile.reason.suggested' });
    } else if (d.kind === 'alwaysOn') {
      included = true;
      reasons.push({ key: 'profile.reason.alwaysOn' });
    } else if (evaluate(d.when, env)) {
      required = true;
      included = true;
      reasons.push({ key: 'profile.reason.conditionMet' });
      if (audienceUndeclared && JSON.stringify(d.when).includes('"audience"')) reasons.push({ key: 'profile.reason.audienceUndeclared' });
    } else {
      reasons.push({ key: 'profile.reason.conditionUnmet', refs: unmet(d.when, env) });
      if (JSON.stringify(d.when).includes('"audience"')) reasons.push({ key: 'profile.reason.audienceExcludes', params: { audience: effectiveAudience(env.context) } });
    }
  }

  // The user's choices (FR-10: «يعدّل ما يشاء»). A disabled check is neither required nor included.
  let enabled = applicable;
  if (applicable && override) {
    if (override.enabled === false) enabled = false;
    if (override.required !== undefined) required = override.required;
    if (override.included !== undefined) included = override.included;
    if (override.blocking !== undefined) blocking = override.blocking;
    reasons.push({ key: 'profile.reason.userOverride', params: { fields: overriddenFields(override).join(', ') } });
  }
  if (!enabled) {
    required = false;
    included = false;
    blocking = false;
    if (applicable) reasons.push({ key: 'profile.reason.disabledByUser' });
  }
  if (required) included = true;

  // The command and the tool.
  const cf = { component, own: facts, root: rootFacts };
  let { command, tool } = customEntry
    ? { command: { argv: customEntry.custom.argv, cwd: customEntry.custom.cwd, script: null, from: 'custom' as const }, tool: null }
    : applicable
      ? proposeCommand(def, cf)
      : { command: null, tool: null };
  if (override?.argv && !(command && sameArgv(command.argv, override.argv))) {
    // A user command that runs a project script still carries the script's text, so editing the script
    // still asks for approval (D-08).
    const script = scriptRun(override.argv, facts);
    command = { argv: override.argv, cwd: override.cwd ?? command?.cwd ?? component, script, from: script ? 'script' : 'user' };
  }
  else if (override?.cwd && command) command = { ...command, cwd: override.cwd };
  if (tool && override?.toolPath !== undefined) tool = { ...tool, path: override.toolPath };
  if (applicable && command && !customEntry) {
    if (command.from === 'script') reasons.push({ key: 'profile.reason.commandFromScript', params: { script: command.script!.name } });
    else if (command.from === 'tool') reasons.push({ key: 'profile.reason.commandFromTool', params: { tool: tool?.key ?? '' } });
  } else if (applicable && tool?.source === 'managed') reasons.push({ key: 'profile.reason.managedTool', params: { tool: tool.key } });
  else if (applicable && !command && ['analyzer', 'probe', 'internal'].includes(def.runner.kind)) reasons.push({ key: 'profile.reason.builtIn' });

  // What is missing (G-39) — reported for applicable instances only.
  const missing: MissingRequirement[] = [];
  const usedRefs: ReferenceKind[] = [];
  if (applicable) {
    for (const r of def.requirements) {
      if (r.kind === 'reference') {
        usedRefs.push(r.ref);
        if (!env.refs[r.ref]) missing.push({ kind: 'configuration', ref: r.ref });
      } else if (r.kind === 'tests') {
        const tf = facts.filter((f) => f.key === 'testing.files').map((f) => rec(f.value));
        const n = tf.reduce((a, t) => a + (Number(t.unit) || 0) + (Number(t.pytest) || 0), 0);
        if (n === 0) missing.push({ kind: 'tests' });
      } else if (r.kind === 'lockfile') {
        if (!facts.some((f) => f.key === 'node.lockfile' || f.key === 'python.lockfile')) missing.push({ kind: 'lockfile' });
      }
    }
  }

  // FR-56: judged on the command line and, for a script, its literal text with its pre/post scripts.
  const verdict = command ? judgeCommand(policy, [argvText(command.argv), command.script?.text, command.script?.pre, command.script?.post]) : { refused: [], danger: [] };

  const custom = customEntry?.custom ?? null;
  const base: Omit<CheckSpec, 'specHash' | 'reasons'> = {
    instance,
    checkId,
    checkVersion: def.version,
    component,
    section: def.section,
    criterion: def.criterion,
    applicable,
    enabled,
    required,
    blocking,
    included,
    inIndex: def.inIndex,
    runner: { kind: def.runner.kind, ids: [...def.runner.ids] },
    command,
    tool,
    env: { explicit: { ...(override?.explicitEnv ?? {}) }, allowSensitive: [...(override?.allowSensitive ?? [])].sort() },
    references: usedRefs,
    referenceValues: Object.fromEntries(usedRefs.map((k) => [k, (referenceValue(k, input.settings.references, facts) ?? null) as JsonValue])),
    customSuccess: custom ? (custom.success) : null,
    timeoutMin: override?.timeoutMin ?? custom?.timeoutMin ?? input.catalog.timeoutMinutes(def),
    resourceClass: def.resourceClass,
    warningsPolicy: override?.warningsPolicy ?? 'warn',
    flakyPolicy: override?.flakyPolicy ?? 'flaky',
    thresholds: override?.thresholds ?? null,
    sideEffects: custom ? { runsProjectCode: true, writesRepo: custom.writesRepo === false ? 'no' : 'maybe' } : { ...def.sideEffects },
    network: custom ? (custom.network === true ? 'required' : custom.network === false ? 'none' : 'optional') : def.network,
    cost: custom?.network ? 'network' : def.cost,
    missing,
    danger: verdict.danger,
    refused: verdict.refused,
  };
  const specHash = input.hash(canonicalJson(specMaterial(base)));
  return { ...base, reasons, specHash };
}

/** The instances that need an approval before they may run: applicable, enabled, included, and not refused. */
export function needsApproval(spec: CheckSpec): boolean {
  return spec.applicable && spec.enabled && spec.included && spec.refused.length === 0;
}
