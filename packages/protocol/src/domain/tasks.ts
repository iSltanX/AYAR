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
  .refine((s) => !/[\u0000-\u0008\u000a-\u001f\u007f]/.test(s), 'control character');

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
]);
export type TaskSource = z.infer<typeof TaskSource>;

export const TaskCard = z.strictObject({
  template: z.literal('card/1'),
  type: CardType,
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** 12.7: تعالجها مباشرة (direct)، تحتاج نموذجًا (model)، تحتاج مراجعتك (review). */
  nextStep: z.enum(['direct', 'model', 'review']),
  source: z.strictObject({ kind: z.enum(['advisorItem', 'check']), ref: z.string() }),
  name: z.string(),
  why: z.string(),
  /** «بمعطى… عند… يجب…»: null parts are the owner's to fill. */
  behavior: z.strictObject({ given: z.string().nullable(), when: z.string().nullable(), must: z.string().nullable() }),
  /** Null: «يحدده المالك قبل كتابة الاختبار». AYAR never invents the oracle (12.8). */
  expected: z.string().nullable(),
  location: z.string().nullable(),
  steps: z.array(z.string()),
  verify: z.array(z.string()),
  /** C-20: a knowledge item with no AYAR check behind it. */
  noAutomatedCheck: z.boolean(),
  /** The card as text, in the 12.8 template (Arabic: the template and the knowledge base are Arabic, D-DEV8-10). */
  text: z.string(),
});
export type TaskCard = z.infer<typeof TaskCard>;

export const TaskRecord = z.strictObject({
  id: Id,
  /** D-36: TASK-NNNN, unique within the project. */
  displayId: z.string().regex(/^TASK-\d{4,}$/),
  projectId: Id,
  status: TaskStatus,
  card: TaskCard,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type TaskRecord = z.infer<typeof TaskRecord>;
