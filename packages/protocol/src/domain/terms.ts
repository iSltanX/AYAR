// The shared terms of verdicts: the outcomes of 7.2-ج (fixed in protocol 1.2, DEV-5) and, from protocol 1.3 (DEV-6),
// severity, proof, origin and the status across runs (7.2-د). A module of its own, imported by runs.ts, findings.ts
// and purity.ts alike, so none of them imports another in a cycle.
import { z } from '../zod.ts';

/**
 * 7.5 and 7.2-ج: the outcomes. DEV-5 produces missing, unavailable, timed_out, cancelled, interrupted, skipped,
 * not_applicable, and the raw exit; passed/failed/warning/needs_review/flaky come from the classifier (DEV-6).
 */
export const CHECK_OUTCOMES = ['passed', 'failed', 'warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped', 'not_applicable'] as const;
export const CheckOutcome = z.enum(CHECK_OUTCOMES);
export type CheckOutcome = z.infer<typeof CheckOutcome>;

/** 7.2-د «الشدة». */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const Severity = z.enum(SEVERITIES);
export type Severity = z.infer<typeof Severity>;

/** 7.2-د «حالة الثبوت». A model's claim is «اشتباه (من النموذج)» and lives in model_claims (12.9), not here. */
export const PROOFS = ['proven', 'suspected', 'suggestion'] as const;
export const Proof = z.enum(PROOFS);
export type Proof = z.infer<typeof Proof>;

/** 7.2-د «المنشأ». */
export const ORIGINS = ['project', 'tool', 'environment', 'model'] as const;
export const Origin = z.enum(ORIGINS);
export type Origin = z.infer<typeof Origin>;

/** 7.2-د «الحالة عبر التشغيلات»: «زال» is computed against the previous comparable execution, never stored as a row. */
export const CROSS_RUN_STATUSES = ['new', 'persisting', 'resolved', 'reappeared'] as const;
export const CrossRunStatus = z.enum(CROSS_RUN_STATUSES);
export type CrossRunStatus = z.infer<typeof CrossRunStatus>;
