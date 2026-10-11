// Audit actions recorded in audit_log (14.1). G-21: `report.copied` is an audit record written after the
// clipboard write succeeded, not an event. Later phases add their actions here with a minor version.
import { z } from './zod.ts';

export const AUDIT_ACTIONS = [
  'report.copied',
  // DEV-4 (protocol 1.1): the project registry (C-05) and the profile (C-09).
  'project.added',
  'project.relocated',
  'project.removed',
  'project.renamed',
  'project.trustChanged',
  'profile.updated',
  'profile.approved',
  'profile.exported',
  'profile.imported',
  // DEV-5 (protocol 1.2): setup actions (FR-17 «يُسجَّل في التدقيق»), managed tools (FR-50), runs and groups.
  'setup.confirmed',
  'setup.executed',
  'setup.failed',
  'tool.installed',
  'tool.installRejected',
  'tool.verified',
  'tool.removed',
  'tool.versionAccepted',
  'run.started',
  'run.cancelled',
  'run.kept',
  'run.deleted',
  'group.saved',
  'group.deleted',
  // DEV-7 (protocol 1.4): the probe's browser (C-11) and the reference images approved (FR-35, D-27).
  'browser.installed',
  'browser.installRejected',
  'baseline.approved',
  // DEV-9 (protocol 1.5): reviews (FR-34), reports and exports (C-21, C-23), cards (12.8), model checks (C-25).
  'review.recorded',
  'report.built',
  'report.exported',
  'task.updated',
  'task.verified',
  'aiCheck.generated',
  'aiCheck.saved',
  'aiResult.imported',
  'aiResult.rejected',
] as const;
export const AuditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditAction>;
