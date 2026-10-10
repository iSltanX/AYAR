// Schemas of the catalog data (C-08, 10.3, 11.6, 12.7, 12.10). The catalog is data, not code: each check is an
// entry with a stable id and version, its section and criterion, text keys, an applicability condition over
// discovery signals, its requirements, the runner it binds to (by id), default policies, resource class,
// side effects, network need, cost tag, next-step class per outcome, relations, and dated sources. The engine
// evaluates the conditions (C-09); the catalog only names them.
import { z } from '@ayar/protocol';

export const SECTION_IDS = ['design', 'security', 'code', 'behavior', 'performance', 'custom', 'integrity', 'model'] as const;
export const SectionId = z.enum(SECTION_IDS);
export type SectionId = z.infer<typeof SectionId>;

/**
 * Boolean signals computed from a discovery snapshot for one component (C-09 evaluates them). A condition can
 * only name a signal listed here, so a typo in the data fails validation instead of silently never matching.
 */
export const SIGNALS = [
  'code.any',
  'lang.js',
  'lang.ts',
  'lang.python',
  'styles.any',
  'markup.any',
  'ui.rendered',
  'ui.rtl',
  'type.browserExtension',
  'type.chromiumExtension',
  'build.step',
  'types.config',
  'lint.config',
  'deps.external',
  'deps.ecosystem',
  'git.repo',
  'tests.integration',
  'tests.playwright',
  'tests.contract',
  'perf.loadScenario',
  'compat.matrix',
  'ayar.aiResults',
  'state.reviews',
  'site.staticNoScripts',
  'ext.manifestGenerated',
  'type.library',
] as const;
export const Signal = z.enum(SIGNALS);
export type Signal = z.infer<typeof Signal>;

/** References the user declares in the profile (or discovery finds): their absence is «ناقص إعداد» or optional (G-39). */
export const REFERENCE_KINDS = [
  'tokens',
  'fonts',
  'renderTarget',
  'states',
  'budgets',
  'permissionsPolicy',
  'baselines',
  'recoveryCommand',
  'reviewScope',
] as const;
export const ReferenceKind = z.enum(REFERENCE_KINDS);
export type ReferenceKind = z.infer<typeof ReferenceKind>;

export const AUDIENCES = ['solo', 'small_group', 'public'] as const;
export const Audience = z.enum(AUDIENCES);
export type Audience = z.infer<typeof Audience>;

export type Condition =
  | { always: true }
  | { signal: Signal }
  | { ref: ReferenceKind }
  | { audience: Audience[] }
  | { context: 'persistentData' | 'permissions' }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ always: z.literal(true) }),
    z.strictObject({ signal: Signal }),
    z.strictObject({ ref: ReferenceKind }),
    z.strictObject({ audience: z.array(Audience).min(1) }),
    z.strictObject({ context: z.enum(['persistentData', 'permissions']) }),
    z.strictObject({ all: z.array(Condition).min(1) }),
    z.strictObject({ any: z.array(Condition).min(1) }),
    z.strictObject({ not: Condition }),
  ]),
);

/** The «الافتراضي» column of 10.3: م ح ك, م ك, خ, «بشرط: …», or always on (integrity: outside the index). */
export const DefaultPolicy = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('required'), blocking: z.boolean() }),
  z.strictObject({ kind: z.literal('optional'), suggestWhen: Condition.optional() }),
  z.strictObject({ kind: z.literal('conditional'), when: Condition }),
  z.strictObject({ kind: z.literal('alwaysOn') }),
]);
export type DefaultPolicy = z.infer<typeof DefaultPolicy>;

export const ToolSource = z.enum(['project', 'managed', 'system', 'project_or_managed', 'project_or_system']);

export const Requirement = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tool'), tools: z.array(z.string().min(1)).min(1), from: ToolSource }),
  /** A reference the user writes. Absent on an included check: «ناقص إعداد» (G-39). */
  z.strictObject({ kind: z.literal('reference'), ref: ReferenceKind }),
  z.strictObject({ kind: z.literal('tests') }),
  z.strictObject({ kind: z.literal('lockfile') }),
  z.strictObject({ kind: z.literal('dependencies') }),
  z.strictObject({ kind: z.literal('network') }),
  z.strictObject({ kind: z.literal('service') }),
  z.strictObject({ kind: z.literal('dataAsset'), asset: z.enum(['osv-db', 'browser']) }),
  z.strictObject({ kind: z.literal('baseline') }),
]);
export type Requirement = z.infer<typeof Requirement>;

export const RunnerKind = z.enum(['adapter', 'analyzer', 'probe', 'internal', 'custom']);
export const Runner = z.strictObject({ kind: RunnerKind, ids: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)) });
export type Runner = z.infer<typeof Runner>;

export const RESOURCE_CLASSES = ['light', 'medium', 'heavy', 'very_heavy'] as const;
export const ResourceClass = z.enum(RESOURCE_CLASSES);
export type ResourceClass = z.infer<typeof ResourceClass>;

/** 12.10: every check and action carries one cost tag. */
export const CostTag = z.enum(['local', 'network', 'model']);
export type CostTag = z.infer<typeof CostTag>;

/** 12.7: the next step for each outcome. */
export const NEXT_STEP_CLASSES = ['direct', 'model', 'review', 'none'] as const;
export const NextStepClass = z.enum(NEXT_STEP_CLASSES);
export type NextStepClass = z.infer<typeof NextStepClass>;

/** Outcome keys of 7.2-c, with the display forms that change the next step (missing configuration or tests). */
export const OUTCOME_KEYS = [
  'passed',
  'passed_reviewed',
  'failed',
  'failed_reviewed',
  'warning',
  'needs_review',
  'flaky',
  'missing',
  'missing_configuration',
  'missing_tests',
  'error',
  'timeout',
  'cancelled',
  'interrupted',
  'skipped',
  'not_applicable',
] as const;
export const OutcomeKey = z.enum(OUTCOME_KEYS);
export type OutcomeKey = z.infer<typeof OutcomeKey>;
export const NextStepTable = z.partialRecord(OutcomeKey, NextStepClass);

const CheckIdPattern = /^(design|sec|code|beh|perf|integ|custom)\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$|^custom\.\*$/;
export const CheckId = z.string().regex(CheckIdPattern, 'invalid check id');
const SourceId = z.string().regex(/^S-\d{2,3}$/);
const IsoDate = z.iso.date();
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);
const TextKey = z.string().regex(/^catalog\.[A-Za-z0-9._-]+$/);

export const CheckDefinition = z.strictObject({
  id: CheckId,
  version: SemVer,
  section: SectionId,
  /** The purity/1 criterion (11.6), or null for checks outside the index (code.complexity, integ.*). */
  criterion: z.string().regex(/^[a-z][a-z0-9-]*$/).nullable(),
  inIndex: z.boolean(),
  /** project: one instance (`@.`); component: one instance per component (D-45). */
  scope: z.enum(['project', 'component']),
  text: z.strictObject({ title: TextKey, why: TextKey, limits: TextKey }),
  applies: Condition,
  default: DefaultPolicy,
  requirements: z.array(Requirement),
  runner: Runner,
  resourceClass: ResourceClass,
  sideEffects: z.strictObject({ runsProjectCode: z.boolean(), writesRepo: z.enum(['no', 'maybe']) }),
  network: z.enum(['none', 'optional', 'required']),
  cost: CostTag,
  nextStep: NextStepTable,
  relations: z.strictObject({
    includes: z.array(CheckId),
    dependsOn: z.array(z.strictObject({ check: CheckId, when: Condition.optional() })),
    sharesExecutionWith: z.array(CheckId),
    alternativeTo: z.array(CheckId),
  }),
  sources: z.array(SourceId),
  verifiedAt: IsoDate,
});
export type CheckDefinition = z.infer<typeof CheckDefinition>;

export const CheckFile = z.strictObject({ section: SectionId, checks: z.array(CheckDefinition).min(1) });

export const Criterion = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  section: SectionId,
  name: TextKey,
  checks: z.array(CheckId).min(1),
});
export type Criterion = z.infer<typeof Criterion>;

export const Section = z.strictObject({ id: SectionId, name: TextKey, inIndex: z.boolean(), fullScan: z.boolean() });

export const AiTemplate = z.strictObject({
  id: z.string().regex(/^ai\.[a-z][a-z0-9-]*$/),
  version: SemVer,
  text: z.strictObject({ title: TextKey, role: TextKey }),
  cost: z.literal('model'),
  sources: z.array(SourceId),
  verifiedAt: IsoDate,
});

export const Source = z.strictObject({ id: SourceId, url: z.url({ protocol: /^https$/ }), verifiedAt: IsoDate });

/** C-18 data (G-32: the patterns are catalog data; their logic and authority live in C-18 alone). */
export const RegexSpec = z.strictObject({ pattern: z.string().min(1).max(512), flags: z.string().regex(/^[imsu]*$/) });
export const HighConfidencePattern = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: SemVer,
  regex: RegexSpec,
  /** When set, only this capture group is replaced and it must reach the entropy threshold (bits per char). */
  group: z.int().positive().optional(),
  minEntropy: z.number().positive().optional(),
});
export const RedactionData = z.strictObject({
  version: SemVer,
  verifiedAt: IsoDate,
  sensitiveNames: z.strictObject({
    words: z.array(z.string().regex(/^[A-Z0-9]+$/)).min(1),
    prefixes: z.array(z.string().regex(/^[A-Z0-9_]+$/)),
    names: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)),
    exceptions: z.array(z.strictObject({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), reason: TextKey })),
  }),
  internalNames: z.strictObject({ prefixes: z.array(z.string().regex(/^[A-Z0-9_]+$/)), names: z.array(z.string()) }),
  minValueLength: z.int().min(4),
  highConfidence: z.array(HighConfidencePattern).min(1),
  multiline: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), version: SemVer, begin: RegexSpec, end: RegexSpec })),
  toolRedaction: z.array(z.strictObject({ tool: z.string(), flag: z.string() })),
});
export type RedactionData = z.infer<typeof RedactionData>;

/** FR-56: refused commands (sudo) and dangerous categories that need their own approval. */
export const CommandPolicy = z.strictObject({
  version: SemVer,
  verifiedAt: IsoDate,
  refused: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), regex: RegexSpec, label: TextKey })),
  dangerous: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), regexes: z.array(RegexSpec).min(1), label: TextKey })),
});
export type CommandPolicy = z.infer<typeof CommandPolicy>;

export const CatalogManifest = z.strictObject({
  schema: z.literal('ayar-catalog/1'),
  version: SemVer,
  purityFormula: z.literal('purity/1'),
  staleAfterDays: z.int().positive(),
  /** 7.4: timeout per resource class, in minutes. */
  timeouts: z.strictObject({ light: z.int().positive(), medium: z.int().positive(), heavy: z.int().positive(), very_heavy: z.int().positive() }),
  /** 12.7: the default next step per outcome; checks override some outcomes. */
  nextSteps: z.record(OutcomeKey, NextStepClass),
});
export type CatalogManifest = z.infer<typeof CatalogManifest>;

export const CatalogData = z.strictObject({
  manifest: CatalogManifest,
  sections: z.array(Section).min(1),
  criteria: z.array(Criterion).min(1),
  checkFiles: z.array(CheckFile).min(1),
  aiTemplates: z.array(AiTemplate),
  sources: z.array(Source),
  redaction: RedactionData,
  commandPolicy: CommandPolicy,
});
export type CatalogData = z.infer<typeof CatalogData>;
