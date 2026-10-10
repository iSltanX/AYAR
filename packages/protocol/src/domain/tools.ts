// Managed tools, data assets, readiness and setup actions (C-11, C-10; FR-15 to FR-17, FR-49, FR-50; protocol
// 1.2, DEV-5). A setup action is explicit (D-07): it is previewed (what runs, which host, how much, what is written
// where, whether install scripts run), confirmed with a single-use token, executed alone with its own log, and
// readiness is then recomputed from the tool itself, never from the installer's exit code (9.4 point 4).
import { CheckInstanceKey, Id, IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';
import { Argv, Reason } from './profile.ts';
import { RelPath } from './discovery.ts';
import { Readiness } from './runs.ts';

/** How a managed tool's download is verified (D-13, E-20, D-DEV2-04): the pinned SHA-256 always, then a signature where one exists. */
export const ToolVerification = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('sha256') }),
  /** A sigstore bundle over the release checksums (Betterleaks, E-08); the identity is pinned in the catalog. */
  z.strictObject({ kind: z.literal('sigstore'), identity: z.string(), issuer: z.string() }),
  /** A Developer ID signature with the team identifier pinned in the catalog (mise, uv; E-20). */
  z.strictObject({ kind: z.literal('developer_id'), teamId: z.string().regex(/^[A-Z0-9]{10}$/) }),
]);
export type ToolVerification = z.infer<typeof ToolVerification>;

export const TOOL_STATUSES = ['not_installed', 'installed', 'rejected', 'quarantined', 'damaged'] as const;
export const ToolStatus = z.enum(TOOL_STATUSES);
export type ToolStatus = z.infer<typeof ToolStatus>;

/** FR-49: the tool register as shown. */
export const ToolView = z.strictObject({
  key: z.string(),
  /** The pinned version of the catalog (never «latest», FR-50). */
  version: z.string(),
  license: z.string(),
  homepage: z.string(),
  /** Where the engine would take it from: a managed install, the system PATH, or the project (C-11 point 1). */
  source: z.enum(['managed', 'system', 'project']).nullable(),
  status: ToolStatus,
  path: z.string().nullable(),
  installedVersion: z.string().nullable(),
  sha256: z.string().nullable(),
  sizeBytes: z.int().nonnegative().nullable(),
  installedAt: IsoTimestamp.nullable(),
  verifiedAt: IsoTimestamp.nullable(),
  /** The last re-verification of the installed files against the pinned hash (tools.verify). */
  verifiedOk: z.boolean().nullable(),
  verification: ToolVerification,
  /** The catalog entry's own verification date, and whether it is older than the staleness limit (NFR-06). */
  catalogVerifiedAt: z.iso.date(),
  stale: z.boolean(),
});
export type ToolView = z.infer<typeof ToolView>;

export const ToolInstallPreview = z.strictObject({
  tool: z.string(),
  version: z.string(),
  url: z.string(),
  host: z.string(),
  sizeBytes: z.int().nonnegative().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  verification: ToolVerification,
  /** Inside AYAR's data folder (`tools/<key>/<version>/`): never inside the project, never system-wide. */
  writes: z.string(),
  license: z.string(),
});
export type ToolInstallPreview = z.infer<typeof ToolInstallPreview>;

export const ToolInstallResult = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('installed'), tool: ToolView, downloadedBytes: z.int().nonnegative(), durationMs: z.int().nonnegative() }),
  /** C-11 «الأخطاء»: a hash or signature mismatch stops the install, deletes the file, raises a security alert and writes an audit record. */
  z.strictObject({ status: z.literal('rejected'), reason: z.enum(['hash_mismatch', 'signature_invalid', 'size_mismatch']), tool: ToolView, auditId: Id }),
  z.strictObject({ status: z.literal('failed'), reason: z.enum(['network', 'disk_full', 'extract', 'permission']), tool: ToolView, detail: z.string().nullable() }),
]);
export type ToolInstallResult = z.infer<typeof ToolInstallResult>;

export const DATA_ASSET_KINDS = ['osv-db', 'browser'] as const;
export const DataAssetView = z.strictObject({
  kind: z.enum(DATA_ASSET_KINDS),
  key: z.string(),
  versionOrDate: z.string(),
  path: z.string(),
  sizeBytes: z.int().nonnegative().nullable(),
  updatedAt: IsoTimestamp,
});
export type DataAssetView = z.infer<typeof DataAssetView>;

export const SETUP_ACTION_KINDS = [
  /** Install a managed tool pinned in the catalog (C-11 point 2). */
  'install_tool',
  /** «ثبّت التبعيات» of the project (G-19): managed here as a setup action with the 9.4 preview. */
  'install_dependencies',
  /** G-25: accept, once, a tool version outside the range the project asks for. */
  'accept_tool_version',
  /** C-11 point 3: the offline OSV database of an ecosystem (E-09). */
  'download_osv_db',
] as const;
export const SetupActionKind = z.enum(SETUP_ACTION_KINDS);
export type SetupActionKind = z.infer<typeof SetupActionKind>;

/** 9.4 point 3: what the preview of a setup action shows before anything is executed. */
export const SetupPreview = z.strictObject({
  command: Argv.nullable(),
  cwd: RelPath.nullable(),
  network: z.strictObject({ host: z.string(), url: z.string() }).nullable(),
  sizeBytes: z.int().nonnegative().nullable(),
  writes: z.array(z.strictObject({ location: z.enum(['ayar', 'project']), path: z.string() })),
  /** Whether the action runs install scripts of the project's dependencies (npm does; pnpm 12 may block them, G-DEV1-02). */
  runsScripts: z.boolean().nullable(),
  warnings: z.array(Reason),
});
export type SetupPreview = z.infer<typeof SetupPreview>;

export const SETUP_ACTION_STATES = ['proposed', 'running', 'done', 'failed', 'rejected'] as const;
export const SetupActionState = z.enum(SETUP_ACTION_STATES);

export const SetupAction = z.strictObject({
  id: Id,
  projectId: Id.nullable(),
  kind: SetupActionKind,
  /** The check instances it would make ready. */
  instances: z.array(CheckInstanceKey),
  title: Reason,
  target: z.strictObject({
    tool: z.string().nullable(),
    version: z.string().nullable(),
    requiredSpec: z.string().nullable(),
    ecosystem: z.string().nullable(),
    component: RelPath.nullable(),
  }),
  preview: SetupPreview,
  state: SetupActionState,
  /** Message keys of what happened (for a failed or rejected action). */
  resultReasons: z.array(Reason),
  confirmedAt: IsoTimestamp.nullable(),
  finishedAt: IsoTimestamp.nullable(),
});
export type SetupAction = z.infer<typeof SetupAction>;

export const ReadinessItem = z.strictObject({
  instance: CheckInstanceKey,
  readiness: Readiness,
  reasons: z.array(Reason),
  actions: z.array(Id),
});
export type ReadinessItem = z.infer<typeof ReadinessItem>;

/** `readiness.evaluate`: every applicable instance with its readiness, and the setup actions (9.4 point 3). */
export const ReadinessReport = z.strictObject({
  projectId: Id,
  evaluatedAt: IsoTimestamp,
  env: z.strictObject({ source: z.enum(['login_shell', 'fallback']), fallbackReason: z.string().nullable(), probed: z.boolean() }),
  untrusted: z.boolean(),
  items: z.array(ReadinessItem),
  actions: z.array(SetupAction),
});
export type ReadinessReport = z.infer<typeof ReadinessReport>;

export const SetupExecuteResult = z.strictObject({
  action: SetupAction,
  /** The readiness of the instances the action targeted, recomputed after it (9.4 point 4). */
  readiness: z.array(ReadinessItem),
  /** The action's own log, in AYAR's logs folder, with its hash (setup_actions.result). */
  log: z.strictObject({ path: z.string(), sha256: z.string() }).nullable(),
  /** For a tool install: the install result. */
  install: ToolInstallResult.nullable(),
});
export type SetupExecuteResult = z.infer<typeof SetupExecuteResult>;
