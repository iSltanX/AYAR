// C-05: the project registry. Implemented in DEV-4 (protocol 1.1 gives the results their contracts, and adds
// project.confirm, project.cancelDiscovery and project.rename [D-DEV4-02]).
import { Id } from '../common.ts';
import { DiscoverySnapshot } from '../domain/discovery.ts';
import { Project, ProjectAddResult, ProjectRelocateResult } from '../domain/projects.ts';
import { ConfirmationToken, SelectionToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-05', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-4' } as const;
const added = { ...base, since: '1.1' } as const;

export const projectCommands = {
  'project.add': defineCommand({
    ...base,
    payload: z.strictObject({ selectionToken: SelectionToken }),
    result: ProjectAddResult,
    grants: [{ field: 'selectionToken', kind: 'selection' }],
  }),
  'project.list': defineCommand({ ...base, payload: z.strictObject({}), result: z.strictObject({ projects: z.array(Project) }) }),
  'project.get': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id }),
    result: z.strictObject({ project: Project, snapshot: DiscoverySnapshot.nullable() }),
  }),
  'project.rescan': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.strictObject({ discoveryId: Id }) }),
  'project.relocate': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, selectionToken: SelectionToken }),
    result: ProjectRelocateResult,
    grants: [{ field: 'selectionToken', kind: 'selection' }],
  }),
  // 14.3 removes a project "بتأكيد"; 6.5 lists no token. The stricter text wins [D-DEV3-04].
  'project.remove': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, confirmationToken: ConfirmationToken }),
    result: z.strictObject({ removed: z.literal(true) }),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'projectId' }],
  }),
  'project.setTrust': defineCommand({
    ...base,
    payload: z.strictObject({ projectId: Id, trusted: z.boolean() }),
    result: z.strictObject({ project: Project }),
  }),
  /** Continues an add or a relocation that stopped for a confirmation (a broad folder, another identity). */
  'project.confirm': defineCommand({
    ...added,
    payload: z.strictObject({ pendingId: Id }),
    result: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('added'), project: Project, discoveryId: Id }),
      z.strictObject({ status: z.literal('existing'), project: Project }),
      z.strictObject({ status: z.literal('relocated'), project: Project, discoveryId: Id }),
    ]),
  }),
  /** FR-09: a discovery can be cancelled; nothing of it is saved. */
  'project.cancelDiscovery': defineCommand({ ...added, payload: z.strictObject({ projectId: Id }), result: z.strictObject({ cancelled: z.boolean() }) }),
  /** FR-01: the display name is editable. */
  'project.rename': defineCommand({
    ...added,
    payload: z.strictObject({ projectId: Id, displayName: z.string().trim().min(1).max(200) }),
    result: z.strictObject({ project: Project }),
  }),
};

