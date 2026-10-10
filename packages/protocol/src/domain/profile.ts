// The standards profile contract (C-09, D-08, FR-10 to FR-13, protocol 1.1): context declarations, declared
// references, the user's overrides and custom checks, the effective spec of every check instance with its
// reasons and specHash, the change set awaiting approval, and the exported file `ayar-profile/1` (14.2).
import { AbsolutePath, Id, IsoTimestamp, JsonObject, JsonValue } from '../common.ts';
import { z } from '../zod.ts';
import { RelPath } from './discovery.ts';

export const AUDIENCE_VALUES = ['solo', 'small_group', 'public'] as const;
export const AudienceValue = z.enum(AUDIENCE_VALUES);

/** FR-13: optional context declarations. An undeclared audience is treated as «جمهور عام». */
export const ProfileContext = z.strictObject({
  audience: AudienceValue.nullable(),
  worstConsequence: z.enum(['minor', 'moderate', 'severe']).nullable(),
  persistentData: z.boolean().nullable(),
  permissions: z.boolean().nullable(),
  stage: z.enum(['prototype', 'active', 'maintenance']).nullable(),
  uiLanguages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)).max(20).nullable(),
});
export type ProfileContext = z.infer<typeof ProfileContext>;

export const REFERENCE_KINDS = ['tokens', 'fonts', 'renderTarget', 'states', 'budgets', 'permissionsPolicy', 'baselines', 'recoveryCommand', 'reviewScope'] as const;
export const ReferenceKindSchema = z.enum(REFERENCE_KINDS);
export type ReferenceKindName = (typeof REFERENCE_KINDS)[number];
/** References the user writes (paths inside the project, lists, budgets); each check reads its own (DEV-6, DEV-7). */
export const ProfileReferences = z.partialRecord(ReferenceKindSchema, JsonValue);
export type ProfileReferences = z.infer<typeof ProfileReferences>;

/** An argument vector: no shell, no empty program name (FR-22). */
export const Argv = z.array(z.string().max(4096).refine((a) => !a.includes('\0'), 'NUL in an argument')).min(1).max(256);
/** Explicit, non-secret variables of a check (C-07 point 5): a sensitive name is refused at validation. */
export const EnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(128);

export const CheckOverride = z.strictObject({
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
  blocking: z.boolean().optional(),
  included: z.boolean().optional(),
  argv: Argv.optional(),
  cwd: RelPath.optional(),
  timeoutMin: z.int().min(1).max(24 * 60).optional(),
  warningsPolicy: z.enum(['ignore', 'warn', 'fail']).optional(),
  flakyPolicy: z.enum(['flaky', 'fail']).optional(),
  thresholds: JsonObject.optional(),
  /** Sensitive variables passed to this check anyway, by name, with a warning (D-47). */
  allowSensitive: z.array(EnvName).max(50).optional(),
  explicitEnv: z.record(EnvName, z.string().max(4096)).optional(),
  /** An explicit tool path (a matching version from a version manager, C-07 point 3): enters the approval. */
  toolPath: AbsolutePath.nullable().optional(),
});
export type CheckOverride = z.infer<typeof CheckOverride>;

/** custom.<name> (10.3): a user command with a mandatory success criterion. */
export const CustomCheck = z.strictObject({
  argv: Argv,
  cwd: RelPath,
  timeoutMin: z.int().min(1).max(24 * 60),
  success: z.strictObject({
    exitCode: z.int().min(0).max(255),
    outputContains: z.string().min(1).max(1024).optional(),
    report: RelPath.optional(),
  }),
  network: z.boolean().optional(),
  writesRepo: z.boolean().optional(),
});
export type CustomCheck = z.infer<typeof CustomCheck>;
export const CustomName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);

/** `checkId@component` (D-45): the check id has no `@`; the component is a relative path and may (`@scope/x`). */
export const InstanceKey = z.string().min(3).max(4200).regex(/^[^@\s]+@.+$/);

/** What the user changes; profile.update validates it (C-09 point 7) before anything is saved. */
export const ProfilePatch = z.strictObject({
  context: ProfileContext.partial().optional(),
  references: z.partialRecord(ReferenceKindSchema, JsonValue.nullable()).optional(),
  checks: z.record(InstanceKey, CheckOverride.nullable()).optional(),
  custom: z.record(CustomName, CustomCheck.nullable()).optional(),
});
export type ProfilePatch = z.infer<typeof ProfilePatch>;

/** A reason, as message keys: `key` is the sentence, `refs` names its subjects (signals, references). */
export const Reason = z.strictObject({
  key: z.string().regex(/^[a-z][A-Za-z0-9.-]*$/),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  refs: z.array(z.string()).optional(),
});
export type Reason = z.infer<typeof Reason>;

export const MissingRequirement = z.strictObject({
  kind: z.enum(['configuration', 'tests', 'lockfile']),
  /** For configuration: the reference that is missing (G-39 «ناقص إعداد»). */
  ref: ReferenceKindSchema.optional(),
});
export type MissingRequirement = z.infer<typeof MissingRequirement>;

export const CommandSpec = z.strictObject({
  argv: Argv,
  cwd: RelPath,
  /**
   * For a project script: its literal text, with the pre/post scripts the manager runs automatically and the
   * scripts it runs in turn (C-09). For another command that makes the manager run project scripts (`npm ci`
   * runs postinstall), the command itself with those scripts in `referenced`.
   */
  script: z
    .strictObject({
      name: z.string(),
      text: z.string(),
      pre: z.string().nullable(),
      post: z.string().nullable(),
      composite: z.boolean(),
      /** The project scripts this one runs in turn (`npm run clean && …`): their texts are part of the spec too. */
      referenced: z.array(z.strictObject({ name: z.string(), text: z.string() })),
    })
    .nullable(),
  from: z.enum(['script', 'tool', 'user', 'custom']),
});
export type CommandSpec = z.infer<typeof CommandSpec>;

export const ToolSpec = z.strictObject({
  key: z.string(),
  source: z.enum(['project', 'managed', 'system', 'project-venv', 'uv', 'poetry-env']),
  /** The runtime version the project asks for (`.nvmrc`, `requires-python`…): part of the spec (C-09 point 1). */
  runtime: z.strictObject({ name: z.enum(['node', 'python']), spec: z.string(), from: z.string() }).nullable(),
  path: AbsolutePath.nullable(),
});

export const CheckSpec = z.strictObject({
  instance: InstanceKey,
  checkId: z.string(),
  checkVersion: z.string(),
  component: RelPath,
  section: z.string(),
  criterion: z.string().nullable(),
  applicable: z.boolean(),
  enabled: z.boolean(),
  required: z.boolean(),
  blocking: z.boolean(),
  included: z.boolean(),
  inIndex: z.boolean(),
  reasons: z.array(Reason),
  runner: z.strictObject({ kind: z.string(), ids: z.array(z.string()) }),
  command: CommandSpec.nullable(),
  tool: ToolSpec.nullable(),
  env: z.strictObject({ explicit: z.record(z.string(), z.string()), allowSensitive: z.array(z.string()) }),
  references: z.array(ReferenceKindSchema),
  /** The value each used reference has for this spec: declared in the profile, or found by discovery. */
  referenceValues: z.record(z.string(), JsonValue),
  /** custom.<name>: its success criterion, part of the spec. */
  customSuccess: JsonValue.nullable(),
  timeoutMin: z.int().positive(),
  resourceClass: z.string(),
  warningsPolicy: z.enum(['ignore', 'warn', 'fail']),
  flakyPolicy: z.enum(['flaky', 'fail']),
  thresholds: JsonObject.nullable(),
  sideEffects: z.strictObject({ runsProjectCode: z.boolean(), writesRepo: z.enum(['no', 'maybe']) }),
  network: z.enum(['none', 'optional', 'required']),
  cost: z.enum(['local', 'network', 'model']),
  missing: z.array(MissingRequirement),
  /** FR-56: dangerous categories found in the command or its script; such an instance is approved alone. */
  danger: z.array(z.string()),
  /** FR-56: refused (sudo): the instance cannot be approved at all. */
  refused: z.array(z.string()),
  /** D-08: computed from discovery and profile data only, so it exists at the end of discovery. */
  specHash: z.string(),
});
export type CheckSpec = z.infer<typeof CheckSpec>;

export const FieldChange = z.strictObject({ field: z.string(), before: JsonValue.nullable(), after: JsonValue.nullable() });
export const ChangeItem = z.strictObject({
  instance: InstanceKey,
  change: z.enum(['added', 'changed', 'removed']),
  fields: z.array(FieldChange),
  danger: z.array(z.string()),
  refused: z.array(z.string()),
  /** A dangerous command is approved on its own, never in «اعتمد الكل» (FR-56, AT-05). */
  approveAlone: z.boolean(),
  approvable: z.boolean(),
  specHash: z.string().nullable(),
});
export type ChangeItem = z.infer<typeof ChangeItem>;
export const ChangeSet = z.strictObject({ id: Id, items: z.array(ChangeItem) });
export type ChangeSet = z.infer<typeof ChangeSet>;

export const ProfileView = z.strictObject({
  projectId: Id,
  version: z.int().positive(),
  contentHash: z.string(),
  source: z.enum(['proposed', 'edited', 'imported']),
  createdAt: IsoTimestamp,
  snapshotId: Id.nullable(),
  untrusted: z.boolean(),
  context: ProfileContext,
  references: ProfileReferences,
  custom: z.record(z.string(), CustomCheck),
  checks: z.array(CheckSpec),
  pending: ChangeSet,
  approvals: z.array(z.strictObject({ instance: InstanceKey, specHash: z.string(), approvedAt: IsoTimestamp, profileVersion: z.int().positive() })),
});
export type ProfileView = z.infer<typeof ProfileView>;

/** The exported file `.ayar/profile.json` (14.2): checks, policies and commands, context, references. No secrets. */
export const ExportedCheck = CheckOverride.omit({ toolPath: true });
export const ExportedProfile = z.strictObject({
  schema: z.literal('ayar-profile/1'),
  /** When this profile version was saved (the export of one version is always the same text). */
  savedAt: IsoTimestamp,
  catalogVersion: z.string(),
  profileVersion: z.int().positive(),
  context: ProfileContext,
  references: ProfileReferences,
  checks: z.record(InstanceKey, ExportedCheck),
  custom: z.record(CustomName, CustomCheck),
});
export type ExportedProfile = z.infer<typeof ExportedProfile>;

export const ExportPreview = z.strictObject({
  projectId: Id,
  /** Ties export to this preview: profile.export refuses a different digest (FR-12 «بعد معاينة الفرق»). */
  previewDigest: z.string().regex(/^[0-9a-f]{64}$/),
  text: z.string(),
  existing: z.boolean(),
  diff: z.array(z.strictObject({ op: z.enum(['=', '+', '-']), line: z.string() })),
});
export type ExportPreview = z.infer<typeof ExportPreview>;
