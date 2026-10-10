// The DiscoverySnapshot contract (C-06, 7.1, protocol 1.1): facts with their source and proof, the inventory,
// warnings, Git information read from files, and the spec hashes of the candidate check instances (C-09).
import { Id, IsoTimestamp, JsonValue } from '../common.ts';
import { z } from '../zod.ts';

/** A path relative to the project root, POSIX separators, never absolute and never climbing out. */
export const RelPath = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => p === '.' || (!p.startsWith('/') && !p.split('/').includes('..') && !p.includes('\0')), 'not a relative path inside the project');
export type RelPath = z.infer<typeof RelPath>;

/** A component id is its path relative to the root; the root itself is `.` (7.1). */
export const ComponentPath = RelPath;

export const FactSource = z.strictObject({
  file: RelPath,
  /** JSON pointer, TOML table path or YAML path inside the file; empty for the file as a whole. */
  pointer: z.string().max(1024),
  line: z.int().positive().nullable(),
});
export type FactSource = z.infer<typeof FactSource>;

/** 7.1: a fact has a kind, a value, a source (file and position) and a proof: declared or inferred. */
export const Fact = z.strictObject({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/),
  component: ComponentPath,
  value: JsonValue,
  source: FactSource.nullable(),
  proof: z.enum(['declared', 'inferred']),
  /** The detector and its version (C-06 point 7: independent, versioned detectors). */
  detector: z.string().regex(/^[a-z][a-z0-9-]*@\d+$/),
});
export type Fact = z.infer<typeof Fact>;

export const DiscoveryWarning = z.strictObject({
  code: z.string().regex(/^[a-zA-Z]+$/),
  path: RelPath.optional(),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type DiscoveryWarning = z.infer<typeof DiscoveryWarning>;

export const DiscoveryComponent = z.strictObject({
  id: ComponentPath,
  kind: z.enum(['root', 'workspace']),
  name: z.string().nullable(),
  /** Where the component was declared (a workspace pattern), or null for the root. */
  declaredBy: FactSource.nullable(),
});
export type DiscoveryComponent = z.infer<typeof DiscoveryComponent>;

export const Inventory = z.strictObject({
  entries: z.int().nonnegative(),
  files: z.int().nonnegative(),
  dirs: z.int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  byExtension: z.record(z.string(), z.int().nonnegative()),
  /** Test files by kind of pattern, paths capped per kind (`truncated` says so). */
  testFiles: z.record(z.string(), z.strictObject({ count: z.int().nonnegative(), paths: z.array(RelPath), truncated: z.boolean() })),
  skipped: z.array(z.strictObject({ path: RelPath, reason: z.enum(['default', 'gitignore', 'depth', 'unreadable']) })),
  outputDirs: z.array(z.strictObject({ path: RelPath, sizeBytes: z.number().nonnegative(), entries: z.int().nonnegative(), approximate: z.boolean() })),
  symlinks: z.array(z.strictObject({ path: RelPath, kind: z.enum(['directory', 'file', 'broken']), inside: z.boolean() })),
  /** FR-08: names only, never values. */
  sensitiveFiles: z.array(z.strictObject({ path: RelPath, kind: z.enum(['env', 'key', 'credentials']), ignored: z.boolean() })),
});
export type Inventory = z.infer<typeof Inventory>;

export const DiscoverySnapshot = z.strictObject({
  id: Id,
  projectId: Id,
  createdAt: IsoTimestamp,
  scannerVersion: z.string(),
  durationMs: z.int().nonnegative(),
  partial: z.boolean(),
  partialReasons: z.array(z.enum(['depth', 'entries'])),
  components: z.array(DiscoveryComponent).min(1),
  facts: z.array(Fact),
  inventory: Inventory,
  warnings: z.array(DiscoveryWarning),
  /** `checkId@component` → specHash, computed at the end of discovery (C-09, D-08). */
  specFingerprints: z.record(z.string(), z.string()),
  /** How many spans C-18 redacted in the facts before they were saved, per rule. */
  redactions: z.record(z.string(), z.int().nonnegative()),
});
export type DiscoverySnapshot = z.infer<typeof DiscoverySnapshot>;

/** The short form the project list and the events carry. */
export const DiscoverySummary = z.strictObject({
  snapshotId: Id,
  createdAt: IsoTimestamp,
  partial: z.boolean(),
  facts: z.int().nonnegative(),
  warnings: z.int().nonnegative(),
  components: z.int().positive(),
});
export type DiscoverySummary = z.infer<typeof DiscoverySummary>;
