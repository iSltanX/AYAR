// The project registry contract (C-05, FR-01 to FR-03, FR-59, protocol 1.1).
import { Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { DiscoverySummary } from './discovery.ts';

/** E-05: locations where macOS asks for a privacy permission when reached without the open panel. */
export const ProtectedLocation = z.enum(['documents', 'desktop', 'downloads', 'icloud', 'removable', 'network']);
export type ProtectedLocation = z.infer<typeof ProtectedLocation>;

export const Project = z.strictObject({
  id: Id,
  displayName: z.string().min(1).max(200),
  /** The real path (links resolved), shown isolated left-to-right; the UI never edits it (9.1). */
  rootPath: z.string().min(1),
  /** The real path on disk exactly as stored: compared after Unicode normalization, never rewritten (FR-03). */
  createdAt: IsoTimestamp,
  lastOpenedAt: IsoTimestamp.nullable(),
  pathStatus: z.enum(['ok', 'missing', 'permission_denied']),
  protectedLocation: ProtectedLocation.nullable(),
  /** FR-55: the «مشروع غير موثوق» mode (the flag lives in the profile, C-09; G-20). */
  untrusted: z.boolean(),
  discovery: z.strictObject({ running: z.boolean(), last: DiscoverySummary.nullable() }),
  pendingApprovals: z.int().nonnegative(),
});
export type Project = z.infer<typeof Project>;

/** project.add / project.relocate may stop for a confirmation the engine keeps for 5 minutes (C-05, 9.1 step 3). */
export const PendingConfirmation = z.strictObject({
  pendingId: Id,
  reason: z.enum(['home_folder', 'disk_root', 'identity_mismatch']),
  /** For identity_mismatch: what the project was, and what the new folder holds (names or content hashes). */
  expected: z.string().nullable(),
  found: z.string().nullable(),
  expiresAt: IsoTimestamp,
});
export type PendingConfirmation = z.infer<typeof PendingConfirmation>;

export const ProjectAddResult = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('added'), project: Project, discoveryId: Id }),
  /** The same real path is already registered: the existing project opens (C-05 «يمنع التكرار»). */
  z.strictObject({ status: z.literal('existing'), project: Project }),
  z.strictObject({ status: z.literal('needs_confirmation'), confirmation: PendingConfirmation }),
]);
export type ProjectAddResult = z.infer<typeof ProjectAddResult>;

export const ProjectRelocateResult = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('relocated'), project: Project, discoveryId: Id }),
  z.strictObject({ status: z.literal('needs_confirmation'), confirmation: PendingConfirmation }),
]);
export type ProjectRelocateResult = z.infer<typeof ProjectRelocateResult>;
