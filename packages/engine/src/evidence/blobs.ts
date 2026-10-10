// C-17 «snapshots/blobs/»: content addressed by its SHA-256, compressed (gzip), stored once whatever refers to it.
// A blob's row (snapshot_blobs) is written with it; its reference count is the number of state snapshots that
// name it (snapshot_refs), recomputed by the collector, so a snapshot deleted by any path (a run, retention, a
// project) frees what only it used. Blobs written by a snapshot still being taken are pinned, so the collector
// never takes them from under it.
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { FileSystem } from '../ports/index.ts';
import type { Db } from '../storage/db.ts';

export const BLOB_FILE_MODE = 0o400;

export class BlobStore {
  readonly #fs: FileSystem;
  readonly #dir: string;
  readonly #pinned = new Map<string, number>();

  constructor(fs: FileSystem, dir: string) {
    this.#fs = fs;
    this.#dir = dir;
  }

  path(sha256: string): string {
    return posix.join(this.#dir, sha256.slice(0, 2), `${sha256}.gz`);
  }

  /** Stores a content and returns its address. Pinned until unpin(): a collection does not see it as unused. */
  async put(db: Db, data: Uint8Array): Promise<{ sha256: string; size: number; compressedSize: number }> {
    const sha256 = createHash('sha256').update(data).digest('hex');
    this.pin(sha256);
    const existing = db.get<{ compressed_size: number }>('SELECT compressed_size FROM snapshot_blobs WHERE sha256 = ?', sha256);
    const file = this.path(sha256);
    if (existing && (await this.#fs.lstat(file))?.isFile) return { sha256, size: data.length, compressedSize: existing.compressed_size };
    const packed = gzipSync(data, { level: 6 });
    await this.#fs.mkdir(posix.dirname(file), 0o700);
    if (!(await this.#fs.lstat(file))) {
      await this.#fs.writeFileAtomic(file, packed, 0o600);
      await this.#fs.chmod(file, BLOB_FILE_MODE);
    }
    db.run('INSERT INTO snapshot_blobs (sha256, size, compressed_size, refcount) VALUES (?, ?, ?, 0) ON CONFLICT (sha256) DO NOTHING', sha256, data.length, packed.length);
    return { sha256, size: data.length, compressedSize: packed.length };
  }

  /** Reads a content back and checks its address (a damaged blob is an error, never wrong data). */
  async get(sha256: string): Promise<Uint8Array> {
    const data = new Uint8Array(gunzipSync(await this.#fs.readFile(this.path(sha256))));
    if (createHash('sha256').update(data).digest('hex') !== sha256) throw Object.assign(new Error('blob damaged'), { code: 'EBLOB' });
    return data;
  }

  /** Keeps a blob from the collector until unpin(). Returns the address. */
  pin(sha256: string): string {
    this.#pinned.set(sha256, (this.#pinned.get(sha256) ?? 0) + 1);
    return sha256;
  }

  /** Releases the pins a finished (or abandoned) snapshot took. */
  unpin(shas: Iterable<string>): void {
    for (const s of shas) {
      const n = (this.#pinned.get(s) ?? 0) - 1;
      if (n > 0) this.#pinned.set(s, n);
      else this.#pinned.delete(s);
    }
  }

  /**
   * The collector: recount the references, then delete every blob no snapshot names and no snapshot in progress
   * pinned. Returns what it freed (compressed bytes on disk).
   */
  async collect(db: Db): Promise<{ blobs: number; freedBytes: number }> {
    db.run('UPDATE snapshot_blobs SET refcount = (SELECT count(*) FROM snapshot_refs r WHERE r.sha256 = snapshot_blobs.sha256)');
    const unused = db.all<{ sha256: string; compressed_size: number }>('SELECT sha256, compressed_size FROM snapshot_blobs WHERE refcount = 0').filter((b) => !this.#pinned.has(b.sha256));
    let freedBytes = 0;
    for (const b of unused) {
      await this.#fs.remove(this.path(b.sha256));
      db.run('DELETE FROM snapshot_blobs WHERE sha256 = ? AND refcount = 0', b.sha256);
      freedBytes += b.compressed_size;
    }
    return { blobs: unused.length, freedBytes };
  }
}
