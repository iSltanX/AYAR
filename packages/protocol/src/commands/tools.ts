// Managed tools (C-11). Implemented in DEV-5 (protocol 1.2 gives the tool commands their contracts: the register of
// FR-49, the install preview and its outcome, FR-50). compare.runs (C-22) moved to reports.ts with its contract (DEV-9).
import { DataAssetView, ToolInstallResult, ToolView } from '../domain/tools.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';
import { ConfirmablePreview, ConfirmablePreviewWithToken } from './previews.ts';

const tools = { owner: 'C-11', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-5' } as const;

/** A tool is addressed by its catalog key; the pinned version is the catalog's. */
export const ToolKey = z.string().regex(/^[a-z][a-z0-9-]*$/).max(64);

export const toolCommands = {
  'tools.list': defineCommand({ ...tools, payload: z.strictObject({}), result: z.strictObject({ tools: z.array(ToolView), dataAssets: z.array(DataAssetView) }) }),
  'tools.preview': defineCommand({
    ...tools,
    payload: z.strictObject({ toolId: ToolKey }),
    result: ConfirmablePreview,
    rendererResult: ConfirmablePreviewWithToken,
    confirms: 'tools.install',
  }),
  'tools.install': defineCommand({
    ...tools,
    payload: z.strictObject({ toolId: ToolKey, confirmationToken: ConfirmationToken }),
    result: ToolInstallResult,
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'toolId' }],
  }),
  /** Re-hashes the installed files against the pinned hash; all tools when no id is given. */
  'tools.verify': defineCommand({ ...tools, payload: z.strictObject({ toolId: ToolKey.optional() }), result: z.strictObject({ tools: z.array(ToolView) }) }),
  'tools.remove': defineCommand({
    ...tools,
    payload: z.strictObject({ toolId: ToolKey, confirmationToken: ConfirmationToken }),
    result: z.strictObject({ removed: z.boolean(), tool: ToolView }),
    grants: [{ field: 'confirmationToken', kind: 'confirmation', targetField: 'toolId' }],
  }),
};
