// C-06 points 1–6: the tree walk. Read-only by construction: it receives a narrow file-system view (list,
// stat, real path, read a prefix) and nothing that runs a program (D-05, FR-04). It respects nested .gitignore
// files, skips the default folders, records output folders by size only, never follows a folder link, reads a
// file link only when its target is inside the root, records .env* and key files by name without opening
// them (FR-08), and stops at the limits with a declared partial scan. It checks the cancel signal between
// folders and reports progress through a callback (the manager throttles it to 200 ms).
import ignore from 'ignore';
import { posix } from 'node:path';
import type { DirEntry, FileStat } from '../ports/index.ts';

/** What discovery may do with the file system: read, never write, never execute. */
export interface DiscoveryFs {
  readdirEntries(path: string): Promise<DirEntry[]>;
  lstat(path: string): Promise<FileStat | null>;
  stat(path: string): Promise<FileStat | null>;
  realpath(path: string): Promise<string | null>;
  readFilePrefix(path: string, maxBytes: number): Promise<{ data: Uint8Array; size: number }>;
}

export interface DiscoveryLimits {
  maxDepth: number;
  maxEntries: number;
  maxConfigBytes: number;
}

/** C-06 point 1: skipped by default (recorded as skipped, never read). */
export const DEFAULT_SKIP = new Set([
  'node_modules', '.git', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', 'coverage', 'target', 'Pods', 'DerivedData', '.gradle',
]);
/** C-06 point 2: output folders, recorded with their total size, not inventoried. */
export const OUTPUT_DIRS = new Set(['dist', 'build', 'out', '.output']);
/** FR-08: sensitive files, by name only. */
const SENSITIVE_ENV = /^\.env(\..*)?$/i;
const SENSITIVE_KEY = /\.(pem|key|p12|pfx|jks|keystore|keychain|ppk|asc)$|^id_(rsa|dsa|ecdsa|ed25519)$/i;
const SENSITIVE_CREDENTIALS = /^(\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials\.json|\.dockercfg)$/i;
const GITIGNORE_MAX_BYTES = 256 * 1024;
const OUTPUT_SIZE_BUDGET = 50_000;
const CONCURRENCY = 16;

export interface WalkedFile {
  size: number;
  mtimeMs: number;
  /** Set for a file reached through a link whose target is inside the root: read through this path. */
  target?: string;
}

export interface Warning {
  code: string;
  path?: string;
  values?: Record<string, string | number>;
}

export interface WalkResult {
  files: Map<string, WalkedFile>;
  dirs: Set<string>;
  skipped: { path: string; reason: 'default' | 'gitignore' | 'depth' | 'unreadable' }[];
  outputDirs: { path: string; sizeBytes: number; entries: number; approximate: boolean }[];
  symlinks: { path: string; kind: 'directory' | 'file' | 'broken'; inside: boolean }[];
  sensitive: { path: string; kind: 'env' | 'key' | 'credentials'; ignored: boolean }[];
  entries: number;
  partial: boolean;
  partialReasons: ('depth' | 'entries')[];
  warnings: Warning[];
}

export interface WalkOptions {
  root: string;
  fs: DiscoveryFs;
  limits: DiscoveryLimits;
  signal: AbortSignal;
  /** Extra output folders, relative to the root, learned from build configuration (E-15 point 9). */
  extraOutputDirs?: ReadonlySet<string>;
  /** Folders (relative) that are component roots: their output folders are recorded too. */
  isComponentRoot?: (rel: string) => boolean;
  onProgress?: (p: { filesSeen: number; dirsSeen: number; currentDir: string; markers: ReadonlySet<string> }) => void;
}

export class DiscoveryCancelled extends Error {
  constructor() {
    super('discovery cancelled');
    this.name = 'DiscoveryCancelled';
  }
}

/** Marker files that name an ecosystem as soon as they are seen (the live «الأنواع المكتشفة حتى الآن»). */
const MARKERS: Record<string, string> = {
  'package.json': 'node',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  'manifest.json': 'manifest',
  'Cargo.toml': 'rust',
  'go.mod': 'go',
  'Package.swift': 'swift',
  'tsconfig.json': 'typescript',
};

export function sensitiveKind(name: string): 'env' | 'key' | 'credentials' | null {
  if (SENSITIVE_ENV.test(name)) return 'env';
  if (SENSITIVE_CREDENTIALS.test(name)) return 'credentials';
  if (SENSITIVE_KEY.test(name)) return 'key';
  return null;
}

interface Scope {
  base: string;
  ig: ReturnType<typeof ignore>;
}

function errCode(e: unknown): string {
  return (e as { code?: string } | null)?.code ?? 'unknown';
}

export async function walk(o: WalkOptions): Promise<WalkResult> {
  const { fs, root, limits, signal } = o;
  const r: WalkResult = { files: new Map(), dirs: new Set(), skipped: [], outputDirs: [], symlinks: [], sensitive: [], entries: 0, partial: false, partialReasons: [], warnings: [] };
  const markers = new Set<string>();
  const full = (rel: string) => (rel === '.' ? root : posix.join(root, rel));
  const childRel = (dir: string, name: string) => (dir === '.' ? name : `${dir}/${name}`);
  const inside = (real: string) => real === root || real.startsWith(`${root}/`);
  const partial = (reason: 'depth' | 'entries') => {
    r.partial = true;
    if (!r.partialReasons.includes(reason)) r.partialReasons.push(reason);
  };
  const ignored = (scopes: readonly Scope[], rel: string, isDir: boolean): boolean => {
    // AYAR's own folder in the repository is always read (C-06 point 9), even when Git ignores its results (Q-02).
    if (rel === '.ayar' || rel.startsWith('.ayar/')) return false;
    for (const s of scopes) {
      const sub = s.base === '.' ? rel : rel.startsWith(`${s.base}/`) ? rel.slice(s.base.length + 1) : null;
      if (sub && s.ig.ignores(isDir ? `${sub}/` : sub)) return true;
    }
    return false;
  };

  let lastDir = '.';
  const progress = () => o.onProgress?.({ filesSeen: r.files.size, dirsSeen: r.dirs.size, currentDir: lastDir, markers });

  async function outputSize(rel: string): Promise<{ sizeBytes: number; entries: number; approximate: boolean }> {
    let size = 0;
    let entries = 0;
    const stack = [full(rel)];
    while (stack.length) {
      if (signal.aborted) throw new DiscoveryCancelled();
      const dir = stack.pop()!;
      let list: DirEntry[];
      try {
        list = await fs.readdirEntries(dir);
      } catch {
        continue;
      }
      for (const e of list) {
        if (++entries > OUTPUT_SIZE_BUDGET) return { sizeBytes: size, entries, approximate: true };
        const p = posix.join(dir, e.name);
        if (e.kind === 'directory') stack.push(p);
        else if (e.kind === 'file') size += (await fs.lstat(p))?.size ?? 0;
      }
    }
    return { sizeBytes: size, entries, approximate: false };
  }

  async function visit(rel: string, depth: number, scopes: readonly Scope[]): Promise<{ rel: string; depth: number; scopes: readonly Scope[] }[]> {
    if (signal.aborted) throw new DiscoveryCancelled();
    lastDir = rel;
    let list: DirEntry[];
    try {
      list = await fs.readdirEntries(full(rel));
    } catch (e) {
      if (rel === '.') throw e; // the root itself: C-05 turns EPERM/EACCES into the permission guidance
      r.skipped.push({ path: rel, reason: 'unreadable' });
      r.warnings.push({ code: 'unreadable', path: rel, values: { error: errCode(e) } });
      return [];
    }
    r.dirs.add(rel);
    list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    // This folder's own .gitignore applies to what is below it.
    let here = scopes;
    if (list.some((e) => e.name === '.gitignore' && e.kind === 'file')) {
      try {
        const { data } = await fs.readFilePrefix(full(childRel(rel, '.gitignore')), GITIGNORE_MAX_BYTES);
        here = [...scopes, { base: rel, ig: ignore().add(new TextDecoder().decode(data)) }];
      } catch (e) {
        r.warnings.push({ code: 'unreadable', path: childRel(rel, '.gitignore'), values: { error: errCode(e) } });
      }
    }
    const next: { rel: string; depth: number; scopes: readonly Scope[] }[] = [];
    for (const e of list) {
      if (r.entries >= limits.maxEntries) {
        partial('entries');
        return next;
      }
      r.entries++;
      const crel = childRel(rel, e.name);
      if (MARKERS[e.name]) markers.add(MARKERS[e.name]!);

      if (e.kind === 'symlink') {
        const real = await fs.realpath(full(crel));
        const target = real ? await fs.stat(real) : null;
        if (!real || !target) {
          r.symlinks.push({ path: crel, kind: 'broken', inside: false });
          continue;
        }
        const isInside = inside(real);
        if (target.isDirectory) {
          r.symlinks.push({ path: crel, kind: 'directory', inside: isInside });
          r.warnings.push({ code: isInside ? 'symlinkDirNotFollowed' : 'symlinkOutside', path: crel });
          continue;
        }
        r.symlinks.push({ path: crel, kind: 'file', inside: isInside });
        if (!isInside) {
          r.warnings.push({ code: 'symlinkOutside', path: crel });
          continue;
        }
        const kind = sensitiveKind(e.name);
        if (kind) r.sensitive.push({ path: crel, kind, ignored: ignored(here, crel, false) });
        else if (!ignored(here, crel, false)) r.files.set(crel, { size: target.size, mtimeMs: target.mtimeMs, target: real });
        continue;
      }

      if (e.kind === 'directory') {
        if (DEFAULT_SKIP.has(e.name)) {
          r.skipped.push({ path: crel, reason: 'default' });
          continue;
        }
        const isOutput = o.extraOutputDirs?.has(crel) || (OUTPUT_DIRS.has(e.name) && (rel === '.' || (o.isComponentRoot?.(rel) ?? false)));
        if (isOutput) {
          r.outputDirs.push({ path: crel, ...(await outputSize(crel)) });
          continue;
        }
        if (ignored(here, crel, true)) {
          r.skipped.push({ path: crel, reason: 'gitignore' });
          continue;
        }
        if (depth + 1 > limits.maxDepth) {
          r.skipped.push({ path: crel, reason: 'depth' });
          partial('depth');
          continue;
        }
        next.push({ rel: crel, depth: depth + 1, scopes: here });
        continue;
      }

      if (e.kind !== 'file') continue;
      const kind = sensitiveKind(e.name);
      if (kind) {
        // Name only: the file is never opened, not even to measure it (FR-08).
        r.sensitive.push({ path: crel, kind, ignored: ignored(here, crel, false) });
        continue;
      }
      if (ignored(here, crel, false)) continue;
      const st = await fs.lstat(full(crel));
      if (st) r.files.set(crel, { size: st.size, mtimeMs: st.mtimeMs });
    }
    return next;
  }

  // Breadth-first, a bounded number of folders at a time.
  let frontier: { rel: string; depth: number; scopes: readonly Scope[] }[] = [{ rel: '.', depth: 0, scopes: [] }];
  const timer = setInterval(progress, 200);
  try {
    while (frontier.length) {
      const batch = frontier.splice(0, CONCURRENCY);
      const results = await Promise.all(batch.map((d) => visit(d.rel, d.depth, d.scopes)));
      frontier = [...frontier, ...results.flat()];
      if (r.partialReasons.includes('entries')) break;
    }
  } finally {
    clearInterval(timer);
  }
  progress();
  if (r.partial) r.warnings.push({ code: 'partialScan', values: { reasons: r.partialReasons.join(','), entries: r.entries } });
  r.skipped.sort((a, b) => (a.path < b.path ? -1 : 1));
  r.symlinks.sort((a, b) => (a.path < b.path ? -1 : 1));
  r.sensitive.sort((a, b) => (a.path < b.path ? -1 : 1));
  r.outputDirs.sort((a, b) => (a.path < b.path ? -1 : 1));
  return r;
}
