// Model checks (C-25, 12.9, D-41, FR-66 to FR-68, FR-71; protocol 1.5, DEV-9). AYAR calls no model: it finds what the
// project needs (a template whose condition the facts and the results satisfy, with its inputs at hand), generates
// an instruction file (`ai-check/1`), and reads the model's result file (`ai-result/1`) as claims — «ادعاء نموذج»
// with proof «اشتباه (من النموذج)» — that never change a result, never enter the index, never close a card. A result
// file that carries a «passed» or «fixed» field is refused as a whole.
import { Id, IsoTimestamp, Lang } from '../common.ts';
import { z } from '../zod.ts';
import { FindingLocation } from './findings.ts';
import { Reason } from './profile.ts';
import { Severity } from './terms.ts';

export const AI_CHECK_SCHEMA = 'ai-check/1' as const;
export const AI_RESULT_SCHEMA = 'ai-result/1' as const;
/** C-25 point 3: a result file over this is refused unread. */
export const AI_RESULT_MAX_BYTES = 1024 * 1024;

/** 12.9 «الحالات الظاهرة للمستخدم»: the lifecycle of one model check. */
export const AI_CHECK_STATUSES = ['generated', 'awaiting_result', 'result_received', 'matched_partially', 'matched', 'rejected', 'stale'] as const;
export const AiCheckStatus = z.enum(AI_CHECK_STATUSES);
export type AiCheckStatus = z.infer<typeof AiCheckStatus>;

/** An input a template needs (12.9 «المدخلات اللازمة»): found in the facts, or asked of the user («ناقص: {المعلومة}»). */
export const AiNeedInput = z.strictObject({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  /** `catalog.ai.<template>.input.<key>`. */
  labelKey: z.string(),
  /** From discovery, from a result, or from the user; null when still missing. */
  source: z.enum(['discovery', 'results', 'user']).nullable(),
  /** The value as text (file names joined, a count…), bounded; null when missing. */
  value: z.string().max(10_000).nullable(),
});
export type AiNeedInput = z.infer<typeof AiNeedInput>;

/**
 * One need (C-25 point 1): a template whose condition holds for this project, with the facts that made it hold
 * («14 ملف منطق بلا اختبارات»), its inputs, and whether it can be generated now.
 */
export const AiNeed = z.strictObject({
  needId: Id,
  template: z.string(),
  /** The template's code, as its instructions are numbered (`AI-{code}-NNN`, D-36); protocol 1.7 (DEV-12: 16.1). */
  code: z.string().regex(/^[A-Z]{3,8}$/),
  templateVersion: z.string(),
  titleKey: z.string(),
  roleKey: z.string(),
  cost: z.literal('model'),
  /** Why it applies, from the facts and the results; empty when the condition does not hold. */
  reasons: z.array(Reason),
  applies: z.boolean(),
  /** Why it does not apply (shown folded, 12.9), or null. */
  notApplicableReason: Reason.nullable(),
  inputs: z.array(AiNeedInput),
  missingInputs: z.array(z.string()),
  canGenerate: z.boolean(),
  /** The files the instruction names (bounded). */
  files: z.array(z.string()),
  /** Checks that passed and what they proved, so the model does not redo them (12.9 point 2). */
  passed: z.array(z.strictObject({ checkId: z.string(), instance: z.string(), reason: Reason.nullable() })),
  /** Open findings of related checks (12.9 point 2). */
  openFindings: z.array(z.strictObject({ displayId: z.string(), checkId: z.string(), titleKey: z.string(), location: FindingLocation.nullable() })),
  /** An instruction already generated for this template, if any. */
  aiCheckId: Id.nullable(),
  status: AiCheckStatus.nullable(),
});
export type AiNeed = z.infer<typeof AiNeed>;

export const AiNeeds = z.strictObject({ projectId: Id, needs: z.array(AiNeed), computedAt: IsoTimestamp });
export type AiNeeds = z.infer<typeof AiNeeds>;

/** The six parts of an instruction file (12.9), kept with the text for the UI's sections. */
export const AiInstruction = z.strictObject({
  schema: z.literal(AI_CHECK_SCHEMA),
  aiCheckId: Id,
  /** `AI-{رمز القالب}-NNN` (D-36). */
  displayId: z.string().regex(/^AI-[A-Z]{3,8}-\d{3,}$/),
  template: z.string(),
  templateVersion: z.string(),
  lang: Lang,
  /** 12.9: `.ayar/ai-checks/{check}.md` and `.ayar/ai-results/{check}.json`, relative to the project root. */
  suggestedPath: z.string(),
  resultPath: z.string(),
  text: z.string(),
  chars: z.int().nonnegative(),
  token: z.string().regex(/^[0-9a-f]{6}$/),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  redactions: z.strictObject({ total: z.int().nonnegative(), byRule: z.record(z.string(), z.int().nonnegative()) }),
  status: AiCheckStatus,
  generatedAt: IsoTimestamp,
  /** FR-71: shown with the text, always. */
  badges: z.strictObject({ generated: z.literal(true), notExecuted: z.literal(true), cost: z.literal('model') }),
});
export type AiInstruction = z.infer<typeof AiInstruction>;

/** 12.9 point 5: the model's result file. The forbidden fields are checked separately, over the raw JSON. */
export const AiResultNote = z.strictObject({
  location: z.strictObject({ path: z.string().max(4096), line: z.int().positive().optional(), symbol: z.string().max(256).optional() }).nullable(),
  kind: z.enum(['suspicion', 'suggestion', 'question']),
  severity: Severity.nullable(),
  summary: z.string().min(1).max(2000),
  /** Quoted from the project's files. */
  evidence: z.string().max(4000).nullable(),
  /** The local check that could prove it, if any (a check id of the catalog). */
  localCheck: z.string().max(128).nullable(),
});
export type AiResultNote = z.infer<typeof AiResultNote>;

export const AiResult = z.strictObject({
  schema: z.literal(AI_RESULT_SCHEMA),
  /** The instruction's display id (`AI-LOGIC-001`). */
  id: z.string().regex(/^AI-[A-Z]{3,8}-\d{3,}$/),
  template: z.string(),
  templateVersion: z.string(),
  /** The model, as the user names it (never asked, never verified). */
  model: z.string().max(200).nullable(),
  createdAt: IsoTimestamp,
  notes: z.array(AiResultNote).max(2000),
});
export type AiResult = z.infer<typeof AiResult>;

/** 12.9: fields whose presence anywhere in a result file refuses it («اجتاز» و«تم الإصلاح»). */
export const AI_RESULT_FORBIDDEN_KEYS = ['passed', 'fixed', 'pass', 'fix_applied', 'resolved', 'اجتاز', 'تم الإصلاح', 'أُصلح'] as const;

/** A model claim (12.9 «الاستيراد والمطابقة»): `{AI id}.{N}` (D-36). */
export const MODEL_CLAIM_STATUSES = ['open', 'proven', 'decided_card', 'decided_not_issue'] as const;
export const ModelClaimStatus = z.enum(MODEL_CLAIM_STATUSES);

export const ModelClaim = z.strictObject({
  id: Id,
  displayId: z.string().regex(/^AI-[A-Z]{3,8}-\d{3,}\.\d+$/),
  aiCheckId: Id,
  aiCheckDisplayId: z.string(),
  template: z.string(),
  kind: z.enum(['suspicion', 'suggestion', 'question']),
  severitySuggested: Severity.nullable(),
  location: FindingLocation.nullable(),
  summary: z.string(),
  evidenceQuote: z.string().nullable(),
  /** Always «اشتباه (من النموذج)» with origin «النموذج» (FR-68). */
  proof: z.literal('suspected'),
  origin: z.literal('model'),
  matchedCheckId: z.string().nullable(),
  status: ModelClaimStatus,
  /** The finding a local check proved from it, when `proven`. */
  provenFindingId: Id.nullable(),
  reviewId: Id.nullable(),
  nextStep: z.enum(['direct', 'review']),
});
export type ModelClaim = z.infer<typeof ModelClaim>;

/** One imported (or refused) result file. */
export const AiImportItem = z.strictObject({
  path: z.string(),
  aiCheckId: Id.nullable(),
  aiCheckDisplayId: z.string().nullable(),
  status: z.enum(['imported', 'rejected', 'unchanged']),
  /** 12.9: the reason of a refusal (`aiChecks.rejected.*`), or null. */
  rejectReason: Reason.nullable(),
  claims: z.int().nonnegative(),
});

export const AiImportResult = z.strictObject({ projectId: Id, items: z.array(AiImportItem), claims: z.array(ModelClaim) });
export type AiImportResult = z.infer<typeof AiImportResult>;

/**
 * An instruction as aiChecks.list shows it, without its text; and (protocol 1.7, DEV-12: 16.1–16.3) where the owner
 * saved it, when the model's result file was last read, and why it was refused («مرفوض» with its field and line).
 */
export const AiInstructionSummary = AiInstruction.omit({ text: true }).extend({
  savedPath: z.string().nullable(),
  importedAt: IsoTimestamp.nullable(),
  rejectReason: Reason.nullable(),
});
export type AiInstructionSummary = z.infer<typeof AiInstructionSummary>;

/** aiChecks.list: everything of a project in three groups that never mix (AT-44). */
export const AiChecksView = z.strictObject({
  projectId: Id,
  instructions: z.array(AiInstructionSummary),
  claims: z.array(ModelClaim),
  proven: z.array(z.strictObject({ claimDisplayId: z.string(), findingId: Id, findingDisplayId: z.string(), checkId: z.string() })),
});
export type AiChecksView = z.infer<typeof AiChecksView>;
