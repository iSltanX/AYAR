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

/** `outputs` (protocol 1.2, DEV-5): paths the project's checks are allowed to write (FR-36: declared outputs are set apart). */
export const REFERENCE_KINDS = ['tokens', 'fonts', 'renderTarget', 'states', 'budgets', 'permissionsPolicy', 'baselines', 'recoveryCommand', 'reviewScope', 'outputs'] as const;
export const ReferenceKindSchema = z.enum(REFERENCE_KINDS);
export type ReferenceKindName = (typeof REFERENCE_KINDS)[number];
/** References the user writes (paths inside the project, lists, budgets); each check reads its own (DEV-6, DEV-7). */
export const ProfileReferences = z.partialRecord(ReferenceKindSchema, JsonValue);
export type ProfileReferences = z.infer<typeof ProfileReferences>;

/** An argument vector: no shell, no empty program name (FR-22). */
export const Argv = z.array(z.string().max(4096).refine((a) => !a.includes('\0'), 'NUL in an argument')).min(1).max(256);
/** Explicit, non-secret variables of a check (C-07 point 5): a sensitive name is refused at validation. */
export const EnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(128);

/** A companion service's name in the profile (FR-21). */
export const ServiceName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
/** Only this machine: a readiness request never leaves it (15.3, C-14). */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/|$)/;

/**
 * FR-21, C-12 point 10 (protocol 1.2, DEV-5): a companion service the profile declares (a development server, a
 * test database). It is a project command: approved with every instance that uses it (its argv is part of their
 * spec), refused in «مشروع غير موثوق». It is started before its dependants, ready when its URL on this machine
 * answers or its log matches the pattern within the timeout, and stopped after them.
 */
export const ServiceDecl = z
  .strictObject({
    argv: Argv,
    cwd: RelPath,
    readyUrl: z.string().max(2048).regex(LOOPBACK, 'a readiness URL on this machine').nullable(),
    readyPattern: z.string().min(1).max(512).nullable(),
    readyTimeoutSec: z.int().min(1).max(600),
    /** Ports it listens on: a lock each (C-10 point 7, `port:<n>`). */
    ports: z.array(z.int().min(1).max(65535)).max(8),
  })
  .refine((s) => s.readyUrl !== null || s.readyPattern !== null, 'a service needs a readiness URL or a log pattern');
export type ServiceDecl = z.infer<typeof ServiceDecl>;

/** A service as an instance's spec carries it: the declaration with its name. */
export const CompanionService = z.strictObject({
  id: ServiceName,
  argv: Argv,
  cwd: RelPath,
  readyUrl: z.string().nullable(),
  readyPattern: z.string().nullable(),
  readyTimeoutSec: z.int().min(1).max(600),
  ports: z.array(z.int().min(1).max(65535)),
});
export type CompanionService = z.infer<typeof CompanionService>;

export const CheckOverride = z.strictObject({
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
  blocking: z.boolean().optional(),
  included: z.boolean().optional(),
  argv: Argv.optional(),
  cwd: RelPath.optional(),
  timeoutMin: z.int().min(1).max(24 * 60).optional(),
  /** FR-24: the optional idle timeout, in seconds (no output and no processor activity); protocol 1.2. */
  idleTimeoutSec: z.int().min(10).max(24 * 3600).nullable().optional(),
  warningsPolicy: z.enum(['ignore', 'warn', 'fail']).optional(),
  flakyPolicy: z.enum(['flaky', 'fail']).optional(),
  thresholds: JsonObject.optional(),
  /** Sensitive variables passed to this check anyway, by name, with a warning (D-47). */
  allowSensitive: z.array(EnvName).max(50).optional(),
  explicitEnv: z.record(EnvName, z.string().max(4096)).optional(),
  /** An explicit tool path (a matching version from a version manager, C-07 point 3): enters the approval. */
  toolPath: AbsolutePath.nullable().optional(),
  /** FR-21 (protocol 1.2): the profile's companion services this instance needs, by name. */
  services: z.array(ServiceName).max(8).optional(),
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
  /**
   * Protocol 1.7 (DEV-12, screen 9.2 «الاسم»): the name the user gives it, shown in place of its id. One line, no
   * control or direction character; it names the check and is not part of its spec (no new approval).
   */
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((s) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(s), 'control or bidi character')
    .optional(),
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
  /** FR-21 (protocol 1.2): companion services; null removes one. */
  services: z.record(ServiceName, ServiceDecl.nullable()).optional(),
});
export type ProfilePatch = z.infer<typeof ProfilePatch>;

/**
 * A reason, as message keys: `key` is the sentence, `refs` names its subjects (signals, references). An underscore is
 * allowed (protocol 1.4): the setup results name their causes by value (`setup.rejected.hash_mismatch`).
 */
export const Reason = z.strictObject({
  key: z.string().regex(/^[a-z][A-Za-z0-9._-]*$/),
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

/**
 * C-15 (protocol 1.3, DEV-6): the final command an adapter runs, as the approval shows it literally — the project's
 * approved command with the adapter's report flags appended (after `--` for npm), or a managed tool's own
 * invocation — with AYAR's placeholders for what exists only at run time: `{reports}` and `{tmp}` (the instance's
 * folders), `{root}` (the project), `{tool}` (the managed tool's path), `{rules}` (AYAR's Semgrep rules, written
 * into {tmp}), `{osvdb}` (the offline database), `{nogit}` (a folder whose `git` fails at once, D-DEV2-01),
 * `{path}` (the computed PATH), `{shadow}` (the Git shadow repository, E-24) and `{targets}` (the target files
 * from AYAR's own inventory, split in batches of 512 KB, each batch one step). Part of the spec hash: an adapter
 * that changes its flags asks for the approval again.
 */
export const InvocationTemplate = z.strictObject({
  adapter: z.string().regex(/^[a-z][a-z0-9-]*$/),
  adapterVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  argv: z.array(z.string().max(4096).refine((a) => !a.includes('\0'), 'NUL in an argument')).min(1).max(512),
  /** `{root}` or `{root}/<component>`, or `{tmp}` (a neutral folder: Semgrep, OSV, the history scan). */
  cwd: z.string().max(4096),
  env: z.record(EnvName, z.string().max(8192)),
  /** Runs in turn as one execution: beh.stability's repetitions (its threshold `repeats`, 5 by default). */
  repeat: z.int().min(1).max(50),
  /** Prepared by AYAR in the instance's folder before the launch. */
  prepare: z.array(z.enum(['semgrep-rules', 'git-shadow', 'nogit'])),
  /** What `{targets}` expands to: the inventory's files with these extensions, absolute, in batches of at most `batchBytes`. */
  targets: z.strictObject({ extensions: z.array(z.string().regex(/^\.[a-z0-9]+$/)).min(1), batchBytes: z.int().min(4096).max(1024 * 1024) }).nullable(),
  /** The reports it asks the tool for, by name inside {reports}; empty when none can be asked for. */
  reports: z.array(z.string().regex(/^[A-Za-z0-9._-]+$/)),
  /** Where the adapter reads its findings from when a tool writes them to its output (Biome, Knip, pyright, tsc). */
  stdoutReport: z.boolean(),
  /**
   * A composite project script (C-15): it runs as approved, with the report flags appended when they reach the
   * tool (its last command); the direct call to the tool, with the script's options kept, is suggested here.
   */
  suggestion: z.strictObject({ argv: z.array(z.string().max(4096)).min(1).max(512), reason: z.string() }).nullable(),
});
export type InvocationTemplate = z.infer<typeof InvocationTemplate>;

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
  /** Protocol 1.3 (DEV-6): what the adapter will run (C-15); null for an analyzer, the probe, an internal check. */
  invocation: InvocationTemplate.nullable(),
  env: z.strictObject({ explicit: z.record(z.string(), z.string()), allowSensitive: z.array(z.string()) }),
  references: z.array(ReferenceKindSchema),
  /** The value each used reference has for this spec: declared in the profile, or found by discovery. */
  referenceValues: z.record(z.string(), JsonValue),
  /** custom.<name>: its success criterion, part of the spec. */
  customSuccess: JsonValue.nullable(),
  timeoutMin: z.int().positive(),
  /** FR-24: the idle timeout in seconds, or null (none); protocol 1.2. */
  idleTimeoutSec: z.int().positive().nullable(),
  /** FR-21 (protocol 1.2): the companion services it needs, resolved from the profile (part of the spec). */
  services: z.array(CompanionService),
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
  /** FR-21 (protocol 1.2): the declared companion services. */
  services: z.record(z.string(), ServiceDecl),
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
  /** FR-21 (protocol 1.2): optional, so a file exported before 1.2 still imports. */
  services: z.record(ServiceName, ServiceDecl).optional(),
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

/**
 * profile.versions (protocol 1.7, DEV-12): one saved version of the profile and what it changed from the version
 * before it, instance by instance (an added, changed or removed check spec), with the instances approved in it.
 */
export const ProfileVersion = z.strictObject({
  version: z.int().positive(),
  createdAt: IsoTimestamp,
  source: z.enum(['proposed', 'edited', 'imported']),
  changes: z.strictObject({ added: z.array(InstanceKey), changed: z.array(InstanceKey), removed: z.array(InstanceKey) }),
  approved: z.array(InstanceKey),
});
export type ProfileVersion = z.infer<typeof ProfileVersion>;
