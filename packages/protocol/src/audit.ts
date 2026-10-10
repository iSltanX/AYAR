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
] as const;
export const AuditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditAction>;
