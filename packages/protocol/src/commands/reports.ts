// Reports, copying, tasks and the advisor (C-21, C-01, C-20, C-23). Implemented in DEV-8 and DEV-9; protocol 1.5
// (DEV-9) gives report.build, report.export, task.update and the comparison their contracts.
import { Id, Lang } from '../common.ts';
import { AdvisorContext, AdvisorResult } from '../domain/advisor.ts';
import { ReportBuilt, ReportExported, ReportOptions, ReportRecord, RunComparison } from '../domain/reports.ts';
import { TaskPatch, TaskRecord, TaskSource, TaskVerification } from '../domain/tasks.ts';
import { DestinationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

export const ReportTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('run'), runId: Id }),
  z.strictObject({ kind: z.literal('findings'), findingIds: z.array(Id).min(1).max(5000) }),
  z.strictObject({ kind: z.literal('card'), taskId: Id }),
]);

export const CopyKind = z.enum(['report', 'card', 'instructions']);

const renderer = { handler: 'engine', audience: 'renderer', since: '1.0' } as const;

export const reportCommands = {
  /** C-21: builds `report/1` for the target, derives both formats, checks their parity, and keeps the row (12.1). */
  'report.build': defineCommand({
    ...renderer,
    owner: 'C-21',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ target: ReportTarget, options: ReportOptions }),
    result: ReportBuilt,
  }),
  /** The reports kept for a project (14.1 `reports`), newest first. */
  'reports.list': defineCommand({ ...renderer, owner: 'C-21', since: '1.5', implementedIn: 'DEV-9', payload: z.strictObject({ projectId: Id }), result: z.strictObject({ reports: z.array(ReportRecord) }) }),
  /** C-22 «المقارنة» (FR-39, AT-22): two runs of one project, with the comparability notes of 11.5. */
  'compare.runs': defineCommand({ ...renderer, owner: 'C-22', implementedIn: 'DEV-9', payload: z.strictObject({ fromRunId: Id, toRunId: Id }), result: RunComparison }),
  // The main process fetches the model-format text from the engine, writes the clipboard, then the engine
  // records the copy in audit_log as `report.copied` (G-21: an audit record, not an event).
  'clipboard.copy': defineCommand({
    owner: 'C-01',
    handler: 'main',
    audience: 'renderer',
    since: '1.0',
    implementedIn: 'DEV-9',
    payload: z.strictObject({ kind: CopyKind, id: Id }),
    result: z.strictObject({ copied: z.literal(true), chars: z.int().nonnegative() }),
  }),
  'tasks.list': defineCommand({
    ...renderer,
    owner: 'C-20',
    implementedIn: 'DEV-8',
    payload: z.strictObject({ projectId: Id }),
    result: z.strictObject({ tasks: z.array(TaskRecord) }),
  }),
  // C-20 «مصادر البطاقات» and 12.8: generates the card from its source and keeps it (status «مفتوحة»).
  'task.create': defineCommand({
    ...renderer,
    owner: 'C-20',
    implementedIn: 'DEV-8',
    payload: z.strictObject({ projectId: Id, source: TaskSource }),
    result: z.strictObject({ task: TaskRecord }),
  }),
  // The card's lifecycle (12.8, C-20; DEV-9, D-DEV8-11): the user's transitions; «متحققة» comes from a run alone.
  'task.update': defineCommand({ ...renderer, owner: 'C-20', implementedIn: 'DEV-9', payload: z.strictObject({ taskId: Id, patch: TaskPatch }), result: z.strictObject({ task: TaskRecord }) }),
  /** 12.8 «ما يثبته عِيَار عند الإغلاق»: verifies the open cards of a project against a finished run (the engine does it after every run too). */
  'tasks.verify': defineCommand({ ...renderer, owner: 'C-20', since: '1.5', implementedIn: 'DEV-9', payload: z.strictObject({ projectId: Id, runId: Id.optional() }), result: z.strictObject({ verified: z.array(z.strictObject({ task: TaskRecord, verification: TaskVerification })) }) }),
  // FR-46 and FR-18: recommendations for a change context, from the knowledge base (kb/1) and the project's facts.
  'advisor.suggest': defineCommand({
    ...renderer,
    owner: 'C-20',
    implementedIn: 'DEV-8',
    payload: z.strictObject({ projectId: Id, context: AdvisorContext }),
    result: AdvisorResult,
  }),
  'report.export': defineCommand({
    ...renderer,
    owner: 'C-23',
    implementedIn: 'DEV-9',
    // includeScreenshots: the explicit "ضمّن اللقطات" choice of D-46 for the evidence bundle.
    payload: z.strictObject({
      target: ReportTarget,
      format: z.enum(['markdown', 'html', 'json', 'evidence-bundle']),
      lang: Lang,
      destinationToken: DestinationToken,
      includeScreenshots: z.boolean().optional(),
      /** C-23 «المحتوى»: both formats by default, or one of them. */
      content: z.enum(['both', 'human', 'model']).optional(),
    }),
    result: ReportExported,
    grants: [{ field: 'destinationToken', kind: 'destination' }],
  }),
};
