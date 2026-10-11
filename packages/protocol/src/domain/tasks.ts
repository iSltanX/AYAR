// Task cards (C-20, 12.8, FR-45, protocol 1.2): the template, the name `{النوع}: {السلوك} — {الموضع}`, the
// sixteen types, and the sources a card is generated from. The lifecycle and its verification are DEV-9's
// (`task.update`, `tasks.verify`); this contract carries the statuses so the list can show them.
import { Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { AdvisorContext } from './advisor.ts';

/** 12.8 «الأنواع»: sixteen, plus the general card of C-20 «بند معرفة بلا مقابل ← بطاقة عامة». */
export const CARD_TYPES = [
  'unit_test',
  'integration_test',
  'journey_test',
  'property_test',
  'characterization_test',
  'bug_repro_test',
  'ui_state_review',
  'ui_states_definition',
  'check_setup',
  'permission_review',
  'human_a11y_review',
  'exploratory_session',
  'refactor_review',
  'strengthen_assertions',
  'model_check',
  'fix_verification',
  'generic',
] as const;
export const CardType = z.enum(CARD_TYPES);
export type CardType = z.infer<typeof CardType>;

/** 12.8 «دورة البطاقة»: مفتوحة ← نُسخت ← بانتظار التحقق ← متحققة، أو مغلقة بقرار مع سبب. */
export const TASK_STATUSES = ['open', 'copied', 'awaiting_verification', 'verified', 'closed'] as const;
export const TaskStatus = z.enum(TASK_STATUSES);

/** A short user-supplied phrase (the behavior or the location): one line, bounded, kept literally. */
export const CardText = z
  .string()
  .min(1)
  .max(500)
  .refine((s) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(s), 'control or bidi character');

/**
 * What a card is generated from (C-20 «مصادر البطاقات»). DEV-8 builds two: an advisor item for a change context
 * (source 6) and a check that cannot run for want of configuration or tests (source 1). The sources that read
 * findings (missing tests, surviving mutants, UI states, maintenance indicators) come with their results.
 */
export const TaskSource = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('advisorItem'),
    itemId: z.string().regex(/^[a-z][a-z0-9_]*$/),
    context: AdvisorContext,
    /** What to prove and where, when the user knows them; otherwise the card leaves them to the owner. */
    behavior: CardText.optional(),
    location: CardText.optional(),
  }),
  z.strictObject({
    kind: z.literal('check'),
    checkId: z.string().min(1).max(200),
    outcome: z.enum(['missing', 'missing_configuration', 'missing_tests']),
    location: CardText.optional(),
  }),
  /** C-20 source 2 (DEV-9, G-DEV8-03): a unit of logic with no test file, from the test inventory's gaps. */
  z.strictObject({ kind: z.literal('testGap'), checkId: z.string().min(1).max(200), file: CardText, symbol: CardText.optional() }),
  /** C-20 source 3: a surviving mutant (beh.mutation): a card to strengthen the assertions. */
  z.strictObject({ kind: z.literal('survivingMutant'), findingId: Id }),
  /** C-20 source 4: a UI state with no expectation or no story (design.states). */
  z.strictObject({ kind: z.literal('uiState'), findingId: Id }),
  /** C-20 source 5: a maintenance indicator over the threshold (code.complexity): a suggestion, never a change. */
  z.strictObject({ kind: z.literal('maintenance'), findingId: Id }),
  /** 12.6 «وأنشئ بطاقة تحقق»: a fix-verification card for one finding, closed by its disappearance alone (12.8). */
  z.strictObject({ kind: z.literal('fixVerification'), findingId: Id, reportId: Id.optional() }),
  /** 12.7: a model claim the owner turned into a card («حوّل إلى بطاقة»). */
  z.strictObject({ kind: z.literal('modelClaim'), claimId: Id }),
]);
export type TaskSource = z.infer<typeof TaskSource>;
export const TASK_SOURCE_KINDS = ['advisorItem', 'check', 'testGap', 'survivingMutant', 'uiState', 'maintenance', 'fixVerification', 'modelClaim'] as const;

export const TaskCard = z.strictObject({
  template: z.literal('card/1'),
  type: CardType,
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** 12.7: تعالجها مباشرة (direct)، تحتاج نموذجًا (model)، تحتاج مراجعتك (review). */
  nextStep: z.enum(['direct', 'model', 'review']),
  source: z.strictObject({ kind: z.enum(TASK_SOURCE_KINDS), ref: z.string() }),
  /** `{النوع}: {السلوك} — {الموضع}`. */
  name: z.string(),
  /** The «السلوك أو الفعل المطلوب» part of the name. */
  subject: z.string(),
  why: z.string(),
  /** «بمعطى… عند… يجب…»: null parts are the owner's to fill. */
  behavior: z.strictObject({ given: z.string().nullable(), when: z.string().nullable(), must: z.string().nullable() }),
  /** Null: «يحدده المالك قبل كتابة الاختبار». AYAR never invents the oracle (12.8). */
  expected: z.string().nullable(),
  location: z.string().nullable(),
  /** C-06: the project's test framework and a few existing tests to imitate. */
  context: z.strictObject({ framework: z.string().nullable(), examples: z.array(z.string()).max(5) }),
  /** Which parts are the user's own words: they stay literal in the text (28.14 `malicious-text`). */
  userSupplied: z.strictObject({ subject: z.boolean(), location: z.boolean() }),
  steps: z.array(z.string()),
  verify: z.array(z.string()),
  /** C-20: a knowledge item with no AYAR check behind it. */
  noAutomatedCheck: z.boolean(),
  /** The card as text, in the 12.8 template (Arabic: the template and the knowledge base are Arabic, D-DEV8-10). */
  text: z.string(),
});
export type TaskCard = z.infer<typeof TaskCard>;

/** 12.8 «ما يثبته عِيَار عند الإغلاق»: what the verifying run proved, condition by condition (DEV-9). */
export const TaskVerification = z.strictObject({
  runId: Id,
  checkedAt: IsoTimestamp,
  /** The count of executed tests rose since the card was made (null: not a test card). */
  testsIncreased: z.boolean().nullable(),
  /** The related check passed (a setup card: its gap is gone). */
  checkPassed: z.boolean().nullable(),
  /** A new or changed test file names the target symbol or file (null: not a test card). */
  targetMentioned: z.boolean().nullable(),
  /** No integrity finding of the run touches the card's checks. */
  noIntegrityFinding: z.boolean().nullable(),
  /** A fix-verification card: the linked finding is gone («زال») without an integrity finding on its check. */
  findingResolved: z.boolean().nullable(),
  /** «قوة الاختبار غير مثبتة» until a new test kills a mutant in beh.mutation (per-test coverage, no bail, S-30). */
  strength: z.enum(['unproven', 'proven', 'not_applicable']),
  /** Why the card stayed «بانتظار التحقق»: message keys (`tasks.verify.*`). */
  reasons: z.array(z.string()),
});
export type TaskVerification = z.infer<typeof TaskVerification>;

export const TaskRecord = z.strictObject({
  id: Id,
  /** D-36: TASK-NNNN, unique within the project. */
  displayId: z.string().regex(/^TASK-\d{4,}$/),
  projectId: Id,
  status: TaskStatus,
  card: TaskCard,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  /** DEV-9: the last verification attempt, when the card went through one. */
  verification: TaskVerification.nullable(),
  /** DEV-9: a card closed by decision carries its reason (12.8). */
  closeReason: z.string().nullable(),
  /** DEV-9: the finding a fix-verification card follows (by display id), or the claim a model-claim card came from. */
  follows: z.string().nullable(),
});
export type TaskRecord = z.infer<typeof TaskRecord>;

/** task.update's patch (12.8 «دورة البطاقة»): the user's own transitions; «متحققة» is the engine's alone. */
export const TaskPatch = z.strictObject({
  /** `copied` (copied by hand), `awaiting_verification`, `closed` with a reason, or back to `open`. Never `verified`. */
  status: z.enum(['copied', 'awaiting_verification', 'closed', 'open']).optional(),
  closeReason: z.string().max(2000).optional(),
});
export type TaskPatch = z.infer<typeof TaskPatch>;
