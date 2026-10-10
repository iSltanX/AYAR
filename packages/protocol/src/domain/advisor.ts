// The advisor contract (C-20, 28.1, 28.2, FR-46, protocol 1.2): the change context as a strict schema (C-20
// «التحقق من المدخلات»: values outside the lists are a visible error, never a silent conversion; an absent value
// is «مجهول»), and the advice it returns: recommendations with reasons and priorities, never a verdict (D-28).
import { Id } from '../common.ts';
import { z } from '../zod.ts';

// 28.1: the sixteen inputs and their values, verbatim.
export const ADVISOR_SITUATIONS = ['new_feature', 'change_behavior', 'bugfix', 'refactor', 'shared_change', 'deps_upgrade', 'cosmetic', 'release', 'new_project', 'legacy_assess'] as const;
export const ADVISOR_AREAS = ['logic', 'ui', 'data', 'external', 'auth', 'input', 'arabic', 'perf', 'config', 'compat'] as const;
export const ADVISOR_EXPECTED = ['clear', 'vague'] as const;
export const ADVISOR_IMPACTS = [1, 2, 3, 4] as const;
export const ADVISOR_AUDIENCES = ['me', 'small', 'public'] as const;
export const ADVISOR_REVERSIBILITY = ['easy', 'hard'] as const;
export const ADVISOR_SCOPES = ['local', 'module', 'wide'] as const;
export const ADVISOR_FACTORS = ['complex', 'unfamiliar', 'defect_history', 'ai_generated', 'async'] as const;
export const ADVISOR_EVIDENCE = ['none', 'weak', 'good'] as const;
export const ADVISOR_AUTOMATION = ['auto', 'manual', 'none'] as const;
export const ADVISOR_PLATFORMS = ['web', 'api', 'mobile', 'desktop', 'plugin', 'theme', 'library', 'text'] as const;
export const ADVISOR_STAGES = ['proto', 'active', 'released', 'maintenance'] as const;
export const ADVISOR_FREQUENCY = ['rare', 'frequent'] as const;
export const ADVISOR_TIME = ['minutes', 'hours', 'days'] as const;

export const AdvisorSituation = z.enum(ADVISOR_SITUATIONS);
export type AdvisorSituation = z.infer<typeof AdvisorSituation>;
export const AdvisorArea = z.enum(ADVISOR_AREAS);
export type AdvisorArea = z.infer<typeof AdvisorArea>;
export const AdvisorFactor = z.enum(ADVISOR_FACTORS);
export const AdvisorPlatform = z.enum(ADVISOR_PLATFORMS);
export const AdvisorImpact = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type AdvisorImpact = z.infer<typeof AdvisorImpact>;

/** A multi-choice answer: each value once. */
const multi = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .refine((a) => new Set(a).size === a.length, 'duplicate value');

/** The free-text `stack`: bounded, one line, no control characters. It names the technology and nothing else. */
export const AdvisorStack = z
  .string()
  .max(300)
  .refine((s) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(s), 'control or bidi character');

/**
 * The change context (28.1). Only `situation` is required (28.1: «إلزامي»). Every other key may be absent, which
 * means «مجهول» (unknown): the advisor shows its assumption and the range it opens, never a silent default.
 * `migrations` is the declaration of C-20 rule 5 («ترحيل … معلن»), the only key beyond the sixteen of 28.1
 * (D-DEV8-04).
 */
export const AdvisorContext = z.strictObject({
  situation: AdvisorSituation,
  areas: multi(AdvisorArea, ADVISOR_AREAS.length).optional(),
  expected: z.enum(ADVISOR_EXPECTED).optional(),
  impact: AdvisorImpact.optional(),
  audience: z.enum(ADVISOR_AUDIENCES).optional(),
  reversibility: z.enum(ADVISOR_REVERSIBILITY).optional(),
  scope: z.enum(ADVISOR_SCOPES).optional(),
  factors: multi(AdvisorFactor, ADVISOR_FACTORS.length).optional(),
  evidence: z.enum(ADVISOR_EVIDENCE).optional(),
  automation: z.enum(ADVISOR_AUTOMATION).optional(),
  flaky: z.boolean().optional(),
  platform: multi(AdvisorPlatform, ADVISOR_PLATFORMS.length).optional(),
  stack: AdvisorStack.optional(),
  stage: z.enum(ADVISOR_STAGES).optional(),
  frequency: z.enum(ADVISOR_FREQUENCY).optional(),
  time: z.enum(ADVISOR_TIME).optional(),
  migrations: z.boolean().optional(),
});
export type AdvisorContext = z.infer<typeof AdvisorContext>;
export type AdvisorKey = keyof AdvisorContext;

/** The inputs whose absence the advisor explores (28.2-ز). */
export const SENSITIVE_KEYS = ['impact', 'scope', 'evidence', 'reversibility', 'audience', 'expected'] as const;
export type SensitiveKey = (typeof SENSITIVE_KEYS)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export const RiskLevel = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const DEPTHS = ['none', 'focused', 'focused_reg', 'expanded', 'comprehensive'] as const;
export const Depth = z.enum(DEPTHS);
export type Depth = z.infer<typeof Depth>;

/** A sentence the UI renders from an `advisor.*` message with these values: built from the actual inputs (C-20 rule 4). */
export const Explanation = z.strictObject({
  code: z.string().regex(/^advisor\.[a-zA-Z0-9_.]+$/),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type Explanation = z.infer<typeof Explanation>;

const ItemId = z.string().regex(/^[a-z][a-z0-9_]*$/);
const RuleId = z.string().regex(/^(R|D)\d{2}$|^C-20\.\d$/);
const CheckRef = z.string().min(1).max(200);

export const AdvisorItem = z.strictObject({
  id: ItemId,
  /** 28.7: 1 «أولوية عليا»، 2 «أولوية متوسطة»، 3 «اختياري مفيد». */
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** The sum of the rule weights plus the level bonus (28.2-د). */
  total: z.int().nonnegative(),
  levelBonus: z.int().nonnegative(),
  /** Each rule that added the item, with its weight (28.2-ح «القاعدة والوزن»). */
  contributions: z.array(z.strictObject({ rule: RuleId, weight: z.int().positive() })).min(1),
  mode: z.enum(['auto', 'manual', 'mixed']),
  effort: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  stage: z.enum(['before', 'merge', 'release']),
  /** C-20's map to AYAR checks, and the card type when no check covers it. */
  checks: z.array(CheckRef),
  card: z.string().nullable(),
  /** C-20 rule 6: the other regression item, folded into this one («يشمل»). */
  includes: z.array(ItemId),
  /** The reasons of the included item, kept apart so `total` stays the sum of `contributions` plus the bonus. */
  includedContributions: z.array(z.strictObject({ rule: RuleId, weight: z.int().positive() })),
  /** Why the priority is what it is when a rule forced it (depth `none`, C-20 rule 7). */
  priorityNote: Explanation.nullable(),
  /** 28.9 tools for the ecosystems in play. Commands are for explanation only, never run (4.1). */
  tools: z.array(
    z.strictObject({ name: z.string(), ecosystem: z.string(), category: z.string(), exampleCommand: z.string().nullable(), version: z.string().nullable(), url: z.string() }),
  ),
});
export type AdvisorItem = z.infer<typeof AdvisorItem>;

export const AdvisorResult = z.strictObject({
  /** D-28 and C-20 rule 9: a recommendation, never a verdict; nothing was run on the project. */
  kind: z.literal('recommendation'),
  executed: z.literal(false),
  kb: z.strictObject({ schema: z.literal('ayar-kb/1'), version: z.string() }),
  input: z.strictObject({
    /** The context as received, untouched (malicious text included: shown literally, 28.14 `malicious-text`). */
    given: AdvisorContext,
    /** The values the computation used: given values plus the visible assumptions. */
    effective: z.record(z.string(), z.json()),
    assumed: z.array(z.strictObject({ key: z.string(), value: z.json(), why: Explanation })),
    /** Keys left unknown (28.2-أ): assumed ones and those recorded without an assumption. */
    missing: z.array(z.string()),
    migrations: z.strictObject({ declared: z.boolean().nullable(), detected: z.array(z.string()) }),
  }),
  risk: z.strictObject({
    level: RiskLevel,
    levelIdx: z.int().min(0).max(3),
    impact: z.int().min(1).max(4),
    likelihood: z.int().min(1).max(4),
    score: z.int().min(1).max(16),
    weakPoints: z.array(z.enum(['reversibility', 'evidence'])),
    floorApplied: z.boolean(),
    lines: z.strictObject({ impact: z.array(Explanation), likelihood: z.array(Explanation), detection: z.array(Explanation) }),
    /** C-20 rule 3: the level over every value of the unknown inputs; min = max when nothing is unknown. */
    range: z.strictObject({ min: RiskLevel, max: RiskLevel }),
  }),
  depth: z.strictObject({ id: Depth, rank: z.int().min(0).max(4), notes: z.array(Explanation), completion: z.string() }),
  items: z.array(AdvisorItem),
  /** 28.2-و: what was considered and left out, with reasons composed from the actual inputs. */
  omitted: z.array(z.strictObject({ id: ItemId, facts: z.array(Explanation).min(1), hint: z.string() })),
  budget: z
    .strictObject({
      time: z.enum(ADVISOR_TIME),
      capacity: z.int().positive(),
      used: z.int().nonnegative(),
      overflow: z.array(ItemId),
      warning: Explanation.nullable(),
    })
    .nullable(),
  sensitivity: z.array(
    z.strictObject({
      key: z.enum(SENSITIVE_KEYS),
      groups: z.array(z.strictObject({ values: z.array(z.union([z.string(), z.number()])).min(1), level: RiskLevel, depth: Depth })).min(2),
    }),
  ),
  /** The questions that narrow the unknown, in the order of 28.1. */
  questions: z.array(z.string()),
  /** C-20 rule 3: what every possible value of the unknowns recommends, as a shared base. Null when nothing is unknown. */
  commonBase: z.strictObject({ items: z.array(ItemId), checks: z.array(CheckRef) }).nullable(),
  /** FR-18 «اقترح لتغيير»: the AYAR checks of the recommended items, each with the items that call for it. */
  suggestedChecks: z.array(z.strictObject({ check: CheckRef, items: z.array(ItemId).min(1), priority: z.union([z.literal(1), z.literal(2), z.literal(3)]) })),
  /** 28.2-ز: a suggestion, never a skip (C-20 rule 7). */
  noNewTests: z.boolean(),
  /** C-20 rule 7: reuse is suggested only from an AYAR run with the same state, tools and scope, which passed. */
  evidenceReuse: z.strictObject({ runId: Id }).nullable(),
  ecosystems: z.strictObject({ ids: z.array(z.string()), from: z.enum(['discovery', 'stack', 'both', 'none']) }),
});
export type AdvisorResult = z.infer<typeof AdvisorResult>;
