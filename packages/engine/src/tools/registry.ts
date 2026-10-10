// C-11 «المدخلات»: the managed tools AYAR may install, each pinned (never «latest», D-13, FR-50): its version, the
// file per architecture with its official URL, size and SHA-256 (taken from the release and checked against what
// DEV-2 downloaded and verified: spikes/DEV-2-downloads.md, E-08, E-09, E-20), how its origin is verified beyond
// the hash (a sigstore bundle, or a Developer ID team), its licence, how to read its version, and the system
// versions it accepts instead (C-11 point 1). A tool updates with an AYAR release, never from the network.
//
// The definitions live in the engine, as data checked by a schema at load, and not in packages/catalog: that
// package is outside DEV-5's scope and DEV-8 edits it in the same wave [G-DEV5-01]. Every entry carries the date
// it was verified; one older than the catalog's staleness limit (180 days) is shown stale (NFR-06, AT-35).
import { z } from '@ayar/protocol';
import { ToolVerification } from '@ayar/protocol';

export const ToolFile = z.strictObject({
  arch: z.enum(['arm64', 'x64']),
  url: z.url({ protocol: /^https?$/ }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.int().positive(),
  archive: z.enum(['tar.gz', 'zip', 'binary']),
  /** The executable inside the archive (or the file name for a binary). */
  bin: z.string().regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/),
});

export const ManagedToolDef = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  license: z.string().min(1),
  homepage: z.url({ protocol: /^https$/ }),
  verifiedAt: z.iso.date(),
  files: z.array(ToolFile).min(1),
  verification: ToolVerification,
  /** For a sigstore check: the signed checksums file and its bundle, next to the release. */
  signature: z.strictObject({ checksumsUrl: z.url({ protocol: /^https$/ }), bundleUrl: z.url({ protocol: /^https$/ }) }).nullable(),
  versionArgs: z.array(z.string()).min(1).max(4),
  /** A pattern whose first group is the version in the tool's output. */
  versionPattern: z.string(),
  /** C-11 point 1: a system tool of these names inside this range is used instead («النظام»); null: managed only. */
  system: z.strictObject({ names: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).min(1), min: z.string(), belowMajor: z.int().positive() }).nullable(),
  /** Test entries (tools/cli's AT-35 server) are only ever added by the host, never shipped. */
  test: z.boolean().optional(),
});
export type ManagedToolDef = z.infer<typeof ManagedToolDef>;

export const BUILTIN_TOOLS: readonly ManagedToolDef[] = [
  {
    key: 'betterleaks',
    version: '1.9.0',
    license: 'MIT',
    homepage: 'https://github.com/betterleaks/betterleaks',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/betterleaks/betterleaks/releases/download/v1.9.0/betterleaks_1.9.0_darwin_arm64.tar.gz',
        sha256: '83dd7eaab13d44a1e8e347a17064cdef153a1478db473276d41b38d55613d3f2',
        size: 9389819,
        archive: 'tar.gz',
        bin: 'betterleaks',
      },
    ],
    // E-08: the release's checksums.txt is signed with sigstore by the release workflow.
    verification: { kind: 'sigstore', identity: 'https://github.com/betterleaks/betterleaks/.github/workflows/release.yml@refs/tags/v1.9.0', issuer: 'https://token.actions.githubusercontent.com' },
    signature: {
      checksumsUrl: 'https://github.com/betterleaks/betterleaks/releases/download/v1.9.0/checksums.txt',
      bundleUrl: 'https://github.com/betterleaks/betterleaks/releases/download/v1.9.0/checksums.txt.sigstore.json',
    },
    versionArgs: ['version'],
    versionPattern: '(\\d+\\.\\d+\\.\\d+)',
    system: { names: ['betterleaks'], min: '1.9.0', belowMajor: 2 },
  },
  {
    key: 'gitleaks',
    version: '8.30.1',
    license: 'MIT',
    homepage: 'https://github.com/gitleaks/gitleaks',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_arm64.tar.gz',
        sha256: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
        size: 7897593,
        archive: 'tar.gz',
        bin: 'gitleaks',
      },
    ],
    verification: { kind: 'sha256' },
    signature: null,
    versionArgs: ['version'],
    versionPattern: '(\\d+\\.\\d+\\.\\d+)',
    system: { names: ['gitleaks'], min: '8.30.0', belowMajor: 9 },
  },
  {
    key: 'osv-scanner',
    version: '2.6.0',
    license: 'Apache-2.0',
    homepage: 'https://github.com/google/osv-scanner',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/google/osv-scanner/releases/download/v2.6.0/osv-scanner_darwin_arm64',
        sha256: '98c460dcd37de25819babd757d04542045b6243113e209edcd4d89fedb0256b4',
        size: 55130242,
        archive: 'binary',
        bin: 'osv-scanner',
      },
    ],
    verification: { kind: 'sha256' },
    signature: null,
    versionArgs: ['--version'],
    versionPattern: 'version:\\s*(\\d+\\.\\d+\\.\\d+)',
    system: { names: ['osv-scanner'], min: '2.6.0', belowMajor: 3 },
  },
  {
    key: 'lychee',
    version: '0.24.2',
    license: 'MIT OR Apache-2.0',
    homepage: 'https://github.com/lycheeverse/lychee',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-aarch64-apple-darwin.tar.gz',
        sha256: 'c9d3740ea2d891854d37116c9fba840f37b6e7c89d330e7db84ac333631c4977',
        size: 6992530,
        archive: 'tar.gz',
        bin: 'lychee-aarch64-apple-darwin/lychee',
      },
    ],
    verification: { kind: 'sha256' },
    signature: null,
    versionArgs: ['--version'],
    versionPattern: '(\\d+\\.\\d+\\.\\d+)',
    system: { names: ['lychee'], min: '0.24.0', belowMajor: 1 },
  },
  {
    key: 'uv',
    version: '0.13.0',
    license: 'MIT OR Apache-2.0',
    homepage: 'https://github.com/astral-sh/uv',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-aarch64-apple-darwin.tar.gz',
        sha256: 'a9c1b29002cf3c83f07fa9cd8a887a3be0107d90e23189721221e7257db8e3d6',
        size: 14692549,
        archive: 'tar.gz',
        bin: 'uv-aarch64-apple-darwin/uv',
      },
    ],
    // E-20: signed with Developer ID, team 2DC432GLL2.
    verification: { kind: 'developer_id', teamId: '2DC432GLL2' },
    signature: null,
    versionArgs: ['--version'],
    versionPattern: 'uv (\\d+\\.\\d+\\.\\d+)',
    system: { names: ['uv'], min: '0.13.0', belowMajor: 1 },
  },
  {
    key: 'mise',
    version: '2026.10.7',
    license: 'MIT',
    homepage: 'https://github.com/jdx/mise',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/jdx/mise/releases/download/v2026.10.7/mise-v2026.10.7-macos-arm64.tar.gz',
        sha256: '5841e5ab5009b4c4dd2b641ddbfc6777cc1b9c9c0ffd375001e294540e9e9cc8',
        size: 43325620,
        archive: 'tar.gz',
        bin: 'mise/bin/mise',
      },
    ],
    // E-20: signed with Developer ID, team 4993Y37DX6.
    verification: { kind: 'developer_id', teamId: '4993Y37DX6' },
    signature: null,
    versionArgs: ['--version'],
    versionPattern: '^(\\d+\\.\\d+\\.\\d+)',
    system: null,
  },
  {
    key: 'cosign',
    version: '3.1.3',
    license: 'Apache-2.0',
    homepage: 'https://github.com/sigstore/cosign',
    verifiedAt: '2026-10-10',
    files: [
      {
        arch: 'arm64',
        url: 'https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-darwin-arm64',
        sha256: '5cf948c2f4dfe59687bdd0b8523709067383e03982cc543475c8a7dc70e92a76',
        size: 139618946,
        archive: 'binary',
        bin: 'cosign',
      },
    ],
    verification: { kind: 'sha256' },
    signature: null,
    versionArgs: ['version'],
    versionPattern: 'v?(\\d+\\.\\d+\\.\\d+)',
    system: { names: ['cosign'], min: '3.0.0', belowMajor: 4 },
  },
];

export class ToolRegistryError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`invalid tool registry: ${issues.slice(0, 3).join('; ')}`);
    this.name = 'ToolRegistryError';
    this.issues = issues;
  }
}

/** Validates the built-in entries and the host's test entries (tools/cli only), keyed by tool. */
export function loadToolRegistry(extra: readonly unknown[] = []): Map<string, ManagedToolDef> {
  const out = new Map<string, ManagedToolDef>();
  const issues: string[] = [];
  for (const raw of [...BUILTIN_TOOLS, ...extra]) {
    const r = ManagedToolDef.safeParse(raw);
    if (!r.success) {
      issues.push(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '));
      continue;
    }
    // A host's test entry may stand in for a shipped one (AT-06 without the network); never two shipped ones.
    if (out.has(r.data.key) && !r.data.test) issues.push(`duplicate tool ${r.data.key}`);
    // An http URL is a test entry's alone (the host's loopback server); a shipped entry is https.
    if (!r.data.test && r.data.files.some((f) => !f.url.startsWith('https://'))) issues.push(`${r.data.key}: not https`);
    out.set(r.data.key, r.data);
  }
  if (issues.length) throw new ToolRegistryError(issues);
  return out;
}

export function isStale(def: ManagedToolDef, now: Date, staleAfterDays: number): boolean {
  return now.getTime() - Date.parse(`${def.verifiedAt}T00:00:00Z`) > staleAfterDays * 86_400_000;
}

/** The tools each check may use, by catalog runner id (the adapters of DEV-6 invoke them). */
export function machineArch(): 'arm64' | 'x64' {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}
