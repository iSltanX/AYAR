// C-09: the standards profile. Implemented in DEV-4 (protocol 1.1 gives the results their contracts, narrows
// profile.update's patch to ProfilePatch, and adds profile.exportPreview and profile.importFromRepo [D-DEV4-02]).
import { Id } from '../common.ts';
import { ExportPreview, InstanceKey, ProfilePatch, ProfileVersion, ProfileView } from '../domain/profile.ts';
import { DestinationToken, SourceToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-09', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-4' } as const;
const added = { ...base, since: '1.1' } as const;

export const profileCommands = {
  'profile.propose': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: ProfileView }),
  'profile.get': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: ProfileView }),
  'profile.update': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, patch: ProfilePatch }),
    result: ProfileView,
  }),
  'profile.approve': defineCommand({
    ...base,
    payload: z.strictObject({
      projectId: Id,
      changeSetId: Id,
      /** All approvable items when absent; a dangerous command only alone (FR-56). */
      instances: z.array(InstanceKey).min(1).max(1000).optional(),
      note: z.string().max(1000).optional(),
    }),
    result: z.strictObject({ approved: z.array(InstanceKey), skipped: z.array(InstanceKey), profile: ProfileView }),
  }),
  'profile.export': defineCommand({
    ...base,
    payload: z.strictObject({
      projectId: Id,
      destinationToken: DestinationToken,
      /** Required by the handler (preview_required): the export writes only what the preview showed (FR-12). */
      previewDigest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    }),
    result: z.strictObject({ written: z.literal(true), bytes: z.int().nonnegative(), digest: z.string() }),
    grants: [{ field: 'destinationToken', kind: 'destination' }],
  }),
  'profile.import': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, sourceToken: SourceToken }),
    result: ProfileView,
    grants: [{ field: 'sourceToken', kind: 'source' }],
  }),
  /** FR-12: the differences between the repository's .ayar/profile.json and what an export would write. */
  'profile.exportPreview': defineCommand({ ...added, payload: z.strictObject({ projectId: Id }), result: ExportPreview }),
  /** Protocol 1.7 (DEV-12): the saved versions of the profile, newest first, with what each changed (screen 19 «الملف»). */
  'profile.versions': defineCommand({ ...base, since: '1.7', implementedIn: 'DEV-12', payload: z.strictObject({ projectId: Id }), result: z.strictObject({ versions: z.array(ProfileVersion) }) }),
  /** 9.2 point 4: «استخدام ملف المستودع» — the .ayar/profile.json discovery found; every command needs approval again. */
  'profile.importFromRepo': defineCommand({ ...added, payload: z.strictObject({ projectId: Id }), result: ProfileView }),
};
