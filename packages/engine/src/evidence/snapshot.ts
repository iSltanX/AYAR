// C-17 «لقطة الحالة» [D-22, D-37, E-25]: the inventory of the project's files (path, size, mtime, ctime, inode, and
// a content hash), without git. Text files up to 1 MB keep their content in the content store, once, for the diffs
// of the integrity guard; sensitive files (.env*, keys, credentials, and any file a high-confidence secret pattern
// matches) never keep content and are fingerprinted by HMAC, not by a bare SHA-256, so a short secret cannot be
// guessed from its hash. The shortcut (E-25) reuses the hash of a file whose four-part key has not changed since
// the previous inventory, on APFS and HFS+ only; the decisive snapshots (the start and end of a full scan, the
// completion of a round, the guard's comparison) always hash everything.
//
// Its scope is the project's own files: .gitignore is respected, dependency and tool-cache folders are skipped
// (node_modules, .git, virtual environments…), links are recorded but never followed. Output folders are kept,
// so a check that writes into dist/ shows it (as a declared output).
import ignore from 'ignore';
import { createHash, createHmac } from 'node:crypto';
import { posix } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { SideEffects } from '@ayar/protocol';
import { sensitiveKind } from '../discovery/walker.ts';
import type { DirEntry, FileStat, FileSystem } from '../ports/index.ts';
import type { Redactor } from '../redaction/redactor.ts';
import type { Db } from '../storage/db.ts';
import type { BlobStore } from './blobs.ts';

/** Never part of the state: version control, dependencies, virtual environments, and tool caches. */
export const SNAPSHOT_SKIP = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', 'Pods', 'DerivedData', '.gradle']);
/** E-25: the shortcut is allowed where a write always moves ctime. */
export const FAST_PATH_FS = new Set(['apfs', 'hfs']);
export const MAX_STORED_BYTES = 1024 * 1024;
const MAX_SENSITIVE_BYTES = 16 * 1024 * 1024;
const GITIGNORE_MAX_BYTES = 256 * 1024;
const CONCURRENCY = 8;

export type EntryKind = 'text' | 'binary' | 'large' | 'sensitive' | 'secret' | 'link';

/** One file: path, size, mtime, ctime, inode, content hash (`sha256:` or `hmac:`), kind, content kept or not. */
export type ManifestEntry = [path: string, size: number, mtimeMs: number, ctimeMs: number, ino: number, hash: string, kind: EntryKind, stored: boolean];

export interface Manifest {
  schema: 'ayar-snapshot/1';
  fsType: string | null;
  /** The shortcut was allowed on this volume, and how many files it served. */
  fastPath: { allowed: boolean; reused: number };
  /** Every file was hashed (the decisive snapshots). */
  full: boolean;
  contentStored: boolean;
  files: ManifestEntry[];
  skipped: { path: string; reason: 'gitignore' | 'default' | 'depth' | 'unreadable' }[];
  /** The limit on entries was reached: the inventory is partial. */
  truncated: boolean;
  totalSize: number;
  /** The state hash: SHA-256 over every path and content hash, in order. */
  hash: string;
}

export interface TakeOptions {
  root: string;
  previous?: Manifest | null;
  /** Hash everything (the decisive snapshots), never the shortcut. */
  full: boolean;
  /** Keep text contents in the content store (evidence.storeContent; never for per-check snapshots). */
  storeContent: boolean;
  maxEntries: number;
  maxDepth: number;
  signal?: AbortSignal;
}

export class SnapshotCancelled extends Error {
  constructor() {
    super('snapshot cancelled');
    this.name = 'SnapshotCancelled';
  }
}

export interface SnapshotDeps {
  fs: FileSystem;
  db: Db;
  blobs: BlobStore;
  hmacKey: Uint8Array;
  redactor: () => Redactor;
  newId: () => string;
  now: () => Date;
}

const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

/** A NUL byte in the first 8 KB, or invalid UTF-8, makes a file binary. */
function textOf(data: Uint8Array): string | null {
  if (data.subarray(0, 8192).includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

export function stateHash(files: readonly ManifestEntry[]): string {
  const h = createHash('sha256');
  for (const f of files) h.update(`${f[0]}\0${f[5]}\n`);
  return h.digest('hex');
}

export class SnapshotService {
  readonly #d: SnapshotDeps;

  constructor(d: SnapshotDeps) {
    this.#d = d;
  }

  #hmac(data: Uint8Array): string {
    return `hmac:${createHmac('sha256', this.#d.hmacKey).update(data).digest('hex')}`;
  }

  /** Takes an inventory. Contents it stored are pinned until persist() or discard(). */
  async take(o: TakeOptions): Promise<Manifest & { pinned: string[] }> {
    const { fs } = this.#d;
    const fsType = await fs.fsType(o.root);
    const allowed = !o.full && fsType !== null && FAST_PATH_FS.has(fsType);
    const previous = allowed && o.previous ? new Map(o.previous.files.map((f) => [f[0], f])) : null;
    const files: ManifestEntry[] = [];
    const skipped: Manifest['skipped'] = [];
    const pinned: string[] = [];
    let entries = 0;
    let truncated = false;
    let reused = 0;
    const full = (rel: string) => (rel === '.' ? o.root : posix.join(o.root, rel));
    const childRel = (dir: string, name: string) => (dir === '.' ? name : `${dir}/${name}`);
    type Scope = { base: string; ig: ReturnType<typeof ignore> };
    const ignored = (scopes: readonly Scope[], rel: string, isDir: boolean) =>
      scopes.some((s) => {
        const sub = s.base === '.' ? rel : rel.startsWith(`${s.base}/`) ? rel.slice(s.base.length + 1) : null;
        return sub !== null && s.ig.ignores(isDir ? `${sub}/` : sub);
      });

    const work: { rel: string; st: FileStat }[] = [];
    const frontier: { rel: string; depth: number; scopes: readonly Scope[] }[] = [{ rel: '.', depth: 0, scopes: [] }];
    while (frontier.length && !truncated) {
      if (o.signal?.aborted) throw new SnapshotCancelled();
      const { rel, depth, scopes } = frontier.shift()!;
      let list: DirEntry[];
      try {
        list = await fs.readdirEntries(full(rel));
      } catch (e) {
        if (rel === '.') throw e;
        skipped.push({ path: rel, reason: 'unreadable' });
        continue;
      }
      list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      let here = scopes;
      if (list.some((e) => e.name === '.gitignore' && e.kind === 'file')) {
        try {
          const { data } = await fs.readFilePrefix(full(childRel(rel, '.gitignore')), GITIGNORE_MAX_BYTES);
          const rules = new TextDecoder().decode(data).split('\n').filter((l) => l.trim() && !l.trimStart().startsWith('#'));
          here = [...scopes, { base: rel, ig: ignore().add(rules.slice(0, 1000)) }];
        } catch {
          /* an unreadable .gitignore ignores nothing */
        }
      }
      for (const e of list) {
        if (++entries > o.maxEntries) {
          truncated = true;
          break;
        }
        const crel = childRel(rel, e.name);
        if (e.kind === 'directory') {
          if (SNAPSHOT_SKIP.has(e.name)) skipped.push({ path: crel, reason: 'default' });
          else if (ignored(here, crel, true)) skipped.push({ path: crel, reason: 'gitignore' });
          else if (depth + 1 > o.maxDepth) skipped.push({ path: crel, reason: 'depth' });
          else frontier.push({ rel: crel, depth: depth + 1, scopes: here });
          continue;
        }
        if (e.kind !== 'file' && e.kind !== 'symlink') continue;
        if (ignored(here, crel, false)) continue;
        const st = await fs.lstat(full(crel)).catch(() => null);
        if (st && (st.isFile || st.isSymbolicLink)) work.push({ rel: crel, st });
      }
    }

    // Hash, a few files at a time.
    let next = 0;
    const one = async (rel: string, st: FileStat): Promise<ManifestEntry | null> => {
      const key = [st.size, st.mtimeMs, st.ctimeMs, st.ino] as const;
      const prev = previous?.get(rel);
      if (prev && prev[1] === key[0] && prev[2] === key[1] && prev[3] === key[2] && prev[4] === key[3]) {
        const stored = o.storeContent && prev[7];
        // A content reused from the previous inventory is pinned like a new one until this snapshot is saved; one a
        // collection took since (its snapshot was deleted) is read again below.
        const sha256 = prev[5].slice('sha256:'.length);
        if (!stored || (await this.#d.blobs.hold(this.#d.db, sha256))) {
          if (stored) pinned.push(sha256);
          reused++;
          return [rel, ...key, prev[5], prev[6], stored];
        }
      }
      if (st.isSymbolicLink) return [rel, ...key, `link:${st.size}:${st.mtimeMs}`, 'link', false];
      const path = full(rel);
      try {
        if (sensitiveKind(posix.basename(rel))) {
          const { data } = await fs.readFilePrefix(path, MAX_SENSITIVE_BYTES);
          return [rel, ...key, this.#hmac(data), 'sensitive', false];
        }
        if (st.size > MAX_STORED_BYTES) {
          const h = await fs.hashFile(path);
          return [rel, h.size, key[1], key[2], key[3], `sha256:${h.sha256}`, 'large', false];
        }
        const { data } = await fs.readFilePrefix(path, MAX_STORED_BYTES + 1);
        const text = textOf(data);
        if (text === null) return [rel, data.length, key[1], key[2], key[3], `sha256:${sha(data)}`, 'binary', false];
        // D-37: a file a high-confidence pattern matches is treated like a sensitive file.
        if (!this.#d.redactor().secondPass(text).ok) return [rel, data.length, key[1], key[2], key[3], this.#hmac(data), 'secret', false];
        if (o.storeContent) {
          const b = await this.#d.blobs.put(this.#d.db, data);
          pinned.push(b.sha256);
          return [rel, data.length, key[1], key[2], key[3], `sha256:${b.sha256}`, 'text', true];
        }
        return [rel, data.length, key[1], key[2], key[3], `sha256:${sha(data)}`, 'text', false];
      } catch {
        return null; // vanished or unreadable between the listing and the read: not part of this state
      }
    };
    try {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (next < work.length) {
            if (o.signal?.aborted) throw new SnapshotCancelled();
            const w = work[next++]!;
            const entry = await one(w.rel, w.st);
            if (entry) files.push(entry);
          }
        }),
      );
    } catch (e) {
      this.#d.blobs.unpin(pinned); // an abandoned inventory keeps nothing from the collector
      throw e;
    }
    files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return {
      schema: 'ayar-snapshot/1',
      fsType,
      fastPath: { allowed, reused },
      full: o.full,
      contentStored: o.storeContent,
      files,
      skipped,
      truncated,
      totalSize: files.reduce((a, f) => a + f[1], 0),
      hash: stateHash(files),
      pinned,
    };
  }

  /** Saves a snapshot: its manifest as a blob, its row, and the references of everything it names. */
  async persist(projectId: string, m: Manifest & { pinned?: string[] }, purpose: string): Promise<string> {
    const { pinned, ...manifest } = m;
    const { db, blobs } = this.#d;
    const data = new TextEncoder().encode(JSON.stringify(manifest));
    let blob: Awaited<ReturnType<BlobStore['put']>>;
    try {
      blob = await blobs.put(db, data);
    } catch (e) {
      blobs.unpin(pinned ?? []);
      throw e;
    }
    const id = this.#d.newId();
    const refs = new Set([blob.sha256, ...manifest.files.filter((f) => f[7]).map((f) => f[5].slice('sha256:'.length))]);
    try {
      db.transaction(() => {
        db.run(
          'INSERT INTO snapshots (id, project_id, manifest_blob_sha, file_count, total_size, hash, created_at, purpose, fs_type, fast_path, content_stored) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id,
          projectId,
          blob.sha256,
          manifest.files.length,
          manifest.totalSize,
          manifest.hash,
          this.#d.now().toISOString(),
          purpose,
          manifest.fsType,
          manifest.fastPath.reused > 0 ? 1 : 0,
          manifest.contentStored ? 1 : 0,
        );
        for (const s of refs) db.run('INSERT INTO snapshot_refs (snapshot_id, sha256) VALUES (?, ?) ON CONFLICT DO NOTHING', id, s);
        db.run(`UPDATE snapshot_blobs SET refcount = (SELECT count(*) FROM snapshot_refs r WHERE r.sha256 = snapshot_blobs.sha256) WHERE sha256 IN (${[...refs].map(() => '?').join(',')})`, ...refs);
      });
    } finally {
      blobs.unpin([blob.sha256, ...(pinned ?? [])]);
    }
    return id;
  }

  /** A snapshot that will not be saved: its stored contents are no longer pinned (the collector may take them). */
  discard(m: { pinned?: string[] }): void {
    this.#d.blobs.unpin(m.pinned ?? []);
  }

  async load(snapshotId: string): Promise<Manifest | null> {
    const row = this.#d.db.get<{ manifest_blob_sha: string }>('SELECT manifest_blob_sha FROM snapshots WHERE id = ?', snapshotId);
    if (!row) return null;
    return JSON.parse(new TextDecoder().decode(await this.#d.blobs.get(row.manifest_blob_sha))) as Manifest;
  }

  /** The stored text of a file in a snapshot (for diffs), or null when its content was not kept. */
  async content(entry: ManifestEntry): Promise<string | null> {
    if (!entry[7] || !entry[5].startsWith('sha256:')) return null;
    return new TextDecoder().decode(await this.#d.blobs.get(entry[5].slice('sha256:'.length)));
  }
}

/** Compressed JSON for an in-memory manifest kept between two per-check snapshots. */
export function packManifest(m: Manifest): Uint8Array {
  return gzipSync(JSON.stringify(m));
}
export function unpackManifest(data: Uint8Array): Manifest {
  return JSON.parse(gunzipSync(data).toString('utf8')) as Manifest;
}

export interface DiffOptions {
  /** Paths the run may write: declared outputs (the profile's `outputs`, output folders found by discovery). */
  declared: (path: string) => boolean;
  /** Paths Git tracks (null: unknown). */
  tracked: ReadonlySet<string> | null;
  /** At most this many paths per list (the evidence keeps counts beyond). */
  limit?: number;
}

/** FR-36: what a check (or a run) created, modified and deleted, from two inventories. */
export function diffManifests(before: Manifest, after: Manifest, o: DiffOptions): SideEffects {
  const limit = o.limit ?? 5000;
  const a = new Map(before.files.map((f) => [f[0], f]));
  const b = new Map(after.files.map((f) => [f[0], f]));
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [p, f] of b) {
    const prev = a.get(p);
    if (!prev) created.push(p);
    else if (prev[5] !== f[5] || prev[6] !== f[6]) modified.push(p);
  }
  for (const p of a.keys()) if (!b.has(p)) deleted.push(p);
  const all = [...created, ...modified, ...deleted];
  const declared = all.filter((p) => o.declared(p)).sort();
  const trackedModified = modified.filter((p) => !o.declared(p) && (o.tracked ? o.tracked.has(p) : true)).sort();
  const cut = (x: string[]) => x.sort().slice(0, limit);
  return {
    created: cut(created),
    modified: cut(modified),
    deleted: cut(deleted),
    trackedModified: trackedModified.slice(0, limit),
    declared: declared.slice(0, limit),
    fastPath: after.fastPath.reused > 0,
    truncated: before.truncated || after.truncated || created.length > limit || modified.length > limit || deleted.length > limit,
  };
}

/** True when a path is inside one of the given relative folders or equal to one of the given files. */
export function underAny(prefixes: readonly string[]): (path: string) => boolean {
  const clean = prefixes.map((p) => p.replace(/^\.\//, '').replace(/\/+$/, '')).filter((p) => p && p !== '.');
  return (path) => clean.some((p) => path === p || path.startsWith(`${p}/`));
}
