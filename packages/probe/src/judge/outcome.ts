// What one probe execution leaves for its checks to be judged by (kept in the evidence as `probe.json`, redacted on
// its way in): the cells as they were asked for, the states as the profile declared them, what each cell gave, the
// end of the job (or why it could not run), and — for design.visual — how each capture compared with the approved
// reference of its key (G-28: the engine compares, the judges decide).
import { CaptureComparison, CaptureKey, z } from '@ayar/protocol';
import { CellResult, ProbeSummary } from '../contract.ts';

export const CellMeta = z.strictObject({
  index: z.int().nonnegative(),
  state: z.string(),
  path: z.string(),
  viewport: z.string(),
  theme: z.string(),
  lang: z.string(),
  sensitive: z.boolean(),
});
export type CellMeta = z.infer<typeof CellMeta>;

export const DeclaredState = z.strictObject({ id: z.string(), sensitive: z.boolean(), reason: z.string().nullable(), expectations: z.int().nonnegative() });

/** A source line that changed since the reference was approved (C-17's snapshots), the likely cause of a difference. */
export const ChangedPlace = z.strictObject({ path: z.string(), line: z.int().positive().nullable(), text: z.string() });

export const VisualComparison = z.strictObject({
  index: z.int().nonnegative(),
  captureId: z.string(),
  key: CaptureKey,
  comparison: CaptureComparison,
  diffRatio: z.number().nullable(),
  diffId: z.string().nullable(),
  baselineId: z.string().nullable(),
  changed: z.array(ChangedPlace).max(20),
});
export type VisualComparison = z.infer<typeof VisualComparison>;

export const ProbeOutcome = z.strictObject({
  mode: z.enum(['pages', 'extension', 'perf']),
  targetKind: z.enum(['url', 'static', 'storybook', 'extension']),
  /** The served or loaded folder, relative to the root (a build output is never a source), or null. */
  targetDir: z.string().nullable(),
  cells: z.array(CellMeta),
  states: z.array(DeclaredState),
  results: z.array(CellResult),
  summary: ProbeSummary.nullable(),
  failure: z.strictObject({ code: z.string(), detail: z.string() }).nullable(),
  comparisons: z.array(VisualComparison),
  /** E-11's mode and the fixed render conditions, for the evidence (AT-20: «وضع التشغيل مسجل»). */
  conditions: z.strictObject({ locale: z.string(), timezone: z.string(), reducedMotion: z.boolean(), density: z.number() }),
});
export type ProbeOutcome = z.infer<typeof ProbeOutcome>;
