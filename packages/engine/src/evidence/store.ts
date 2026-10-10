// C-17 «الأدلة»: evidence/<project>/<run>/<check-run>/ holds a check's logs, its raw reports after redaction, its
// side effects and its metadata. A file is written, then hashed, then made read-only (0400), then indexed in the
// evidence table; nothing reaches this folder before C-18 redacted it (D-46). The UI reads evidence only through
// short-lived, single-use tokens (evidence.token → ayar-evidence://), and a file whose hash no longer matches its
// index is «دليل تالف»: never served.
import type { EvidenceRef } from '@ayar/protocol';
import { posix } from 'node:path';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { Clock, FileSystem, Logger, Random } from '../ports/index.ts';
import type { Db } from '../storage/db.ts';

export const EVIDENCE_FILE_MODE = 0o400;
export const EVIDENCE_TOKEN_TTL_MS = 60_000;
const MAX_LIVE_TOKENS = 256;

interface EvidenceRow {
  id: string;
  check_run_id: string;
  kind: string;
  rel_path: string;
  sha256: string;
  size: number;
  redacted: number;
  redaction_counts_json: string | null;
  truncated: number;
  created_at: string;
}

const toRef = (r: EvidenceRow): EvidenceRef => ({ id: r.id, kind: r.kind, relPath: r.rel_path, sha256: r.sha256, size: r.size, redacted: r.redacted === 1, truncated: r.truncated === 1 });

export interface AddEvidence {
  projectId: string;
  runId: string;
  checkRunId: string;
  /** A file name inside the check run's folder (`stdout.log`, `reports/junit.xml`, `side-effects.json`). */
  name: string;
  kind: string;
  /** The content to write; or `path`: a file already written in the folder (a streamed log). */
  data?: Uint8Array;
  redacted: boolean;
  counts?: Record<string, number>;
  truncated?: boolean;
}

export class EvidenceStore {
  readonly #fs: FileSystem;
  readonly #db: Db;
  readonly #root: string;
  readonly #random: Random;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #tokens = new Map<string, { evidenceId: string; expiresWall: number; expiresMono: number }>();

  constructor(o: { fs: FileSystem; db: Db; root: string; random: Random; clock: Clock; logger: Logger }) {
    this.#fs = o.fs;
    this.#db = o.db;
    this.#root = o.root;
    this.#random = o.random;
    this.#clock = o.clock;
    this.#logger = o.logger;
  }

  get root(): string {
    return this.#root;
  }

  relDir(projectId: string, runId: string, checkRunId: string): string {
    return posix.join(projectId, runId, checkRunId);
  }

  absolute(rel: string): string {
    return posix.join(this.#root, rel);
  }

  /** Creates the check run's folder (0700). */
  async open(projectId: string, runId: string, checkRunId: string): Promise<string> {
    const dir = this.absolute(this.relDir(projectId, runId, checkRunId));
    await this.#fs.mkdir(dir, 0o700);
    await this.#fs.chmod(dir, 0o700);
    return dir;
  }

  /** Writes (or adopts) one evidence file, hashes it, makes it read-only, and indexes it. */
  async add(e: AddEvidence): Promise<EvidenceRef> {
    if (e.name.split('/').some((s) => s === '..' || s === '') || e.name.startsWith('/')) throw new Error(`bad evidence name ${e.name}`);
    const rel = posix.join(this.relDir(e.projectId, e.runId, e.checkRunId), e.name);
    const path = this.absolute(rel);
    if (e.data) {
      await this.#fs.mkdir(posix.dirname(path), 0o700);
      if (!(await this.#fs.writeFileExclusive(path, e.data, 0o600))) throw new Error(`evidence exists: ${rel}`);
    }
    const st = await this.#fs.lstat(path);
    if (!st?.isFile) throw new Error(`evidence is not a regular file: ${rel}`);
    const { sha256, size } = await this.#fs.hashFile(path);
    await this.#fs.chmod(path, EVIDENCE_FILE_MODE);
    const row: EvidenceRow = {
      id: newId(this.#random, 'evd'),
      check_run_id: e.checkRunId,
      kind: e.kind,
      rel_path: rel,
      sha256,
      size,
      redacted: e.redacted ? 1 : 0,
      redaction_counts_json: e.counts && Object.keys(e.counts).length ? JSON.stringify(e.counts) : null,
      truncated: e.truncated ? 1 : 0,
      created_at: this.#clock.now().toISOString(),
    };
    this.#db.run(
      'INSERT INTO evidence (id, check_run_id, kind, rel_path, sha256, size, redacted, redaction_counts_json, truncated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id,
      row.check_run_id,
      row.kind,
      row.rel_path,
      row.sha256,
      row.size,
      row.redacted,
      row.redaction_counts_json,
      row.truncated,
      row.created_at,
    );
    return toRef(row);
  }

  refsOf(checkRunId: string): EvidenceRef[] {
    return this.#db.all<EvidenceRow>('SELECT * FROM evidence WHERE check_run_id = ? ORDER BY created_at, rel_path', checkRunId).map(toRef);
  }

  /** evidence.token: a single-use token for one evidence file, valid for a minute. */
  token(evidenceId: string): { token: string; expiresAt: string; kind: string; size: number; sha256: string } {
    const row = this.#db.get<EvidenceRow>('SELECT * FROM evidence WHERE id = ?', evidenceId);
    if (!row) throw new CommandError('not_found', { reason: 'evidence' });
    this.#prune();
    while (this.#tokens.size >= MAX_LIVE_TOKENS) this.#tokens.delete(this.#tokens.keys().next().value!);
    const token = `evt_${Buffer.from(this.#random.bytes(32)).toString('base64url')}`;
    const wall = this.#clock.now().getTime();
    this.#tokens.set(token, { evidenceId, expiresWall: wall + EVIDENCE_TOKEN_TTL_MS, expiresMono: this.#clock.monotonicMs() + EVIDENCE_TOKEN_TTL_MS });
    return { token, expiresAt: new Date(wall + EVIDENCE_TOKEN_TTL_MS).toISOString(), kind: row.kind, size: row.size, sha256: row.sha256 };
  }

  #prune(): void {
    const wall = this.#clock.now().getTime();
    const mono = this.#clock.monotonicMs();
    for (const [t, e] of this.#tokens) if (wall > e.expiresWall || mono > e.expiresMono) this.#tokens.delete(t);
  }

  /**
   * internal.evidencePath: the file behind a token, once. The file must still be a regular file inside the
   * evidence folder, with the hash it was indexed with (T7: no link, no other path; C-17: «دليل تالف»).
   */
  async resolve(token: string): Promise<{ path: string; kind: string; size: number; sha256: string }> {
    this.#prune();
    const entry = this.#tokens.get(token);
    this.#tokens.delete(token);
    if (!entry) throw new CommandError('not_found', { reason: 'token' });
    const row = this.#db.get<EvidenceRow>('SELECT * FROM evidence WHERE id = ?', entry.evidenceId);
    if (!row) throw new CommandError('not_found', { reason: 'evidence' });
    const path = this.absolute(row.rel_path);
    const real = await this.#fs.realpath(path);
    const realRoot = await this.#fs.realpath(this.#root);
    const st = await this.#fs.lstat(path);
    // No link anywhere below the evidence folder: the real path is the evidence folder's own, plus the indexed name.
    if (!real || !realRoot || real !== posix.join(realRoot, row.rel_path) || !st?.isFile) throw new CommandError('not_found', { reason: 'evidence' });
    const h = await this.#fs.hashFile(path);
    if (h.sha256 !== row.sha256) {
      this.#logger.log('error', 'evidence damaged: its hash no longer matches', { evidenceId: row.id });
      throw new CommandError('not_found', { reason: 'damaged' });
    }
    return { path, kind: row.kind, size: h.size, sha256: h.sha256 };
  }

  /** Bytes of evidence of a project (its runs' files). */
  bytesOf(projectId: string): number {
    return this.#db.get<{ n: number | null }>('SELECT sum(e.size) AS n FROM evidence e JOIN check_runs c ON c.id = e.check_run_id JOIN runs r ON r.id = c.run_id WHERE r.project_id = ?', projectId)?.n ?? 0;
  }

  async removeRun(projectId: string, runId: string): Promise<void> {
    await this.#fs.remove(this.absolute(posix.join(projectId, runId)));
  }

  async removeProject(projectId: string): Promise<void> {
    await this.#fs.remove(this.absolute(projectId));
  }
}
