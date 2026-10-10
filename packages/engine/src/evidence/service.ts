// C-17 part two as one service: the content store, the state snapshots, the evidence files and their tokens,
// retention and the collector, and the space each project uses.
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import type { RedactionService } from '../redaction/service.ts';
import { readSettings } from '../storage/settings.ts';
import type { HmacKey } from '../storage/hmac-key.ts';
import { BlobStore } from './blobs.ts';
import { applyRetention, deleteRuns, projectSpace, purgeLedger, removeProjectData, type RetentionDeps } from './retention.ts';
import { SnapshotService } from './snapshot.ts';
import { EvidenceStore } from './store.ts';

export class EvidenceService {
  readonly blobs: BlobStore;
  readonly snapshots: SnapshotService;
  readonly store: EvidenceStore;
  readonly #db: Db;
  readonly #logger: Logger;

  constructor(o: { db: Db; layout: DataLayout; ports: EnginePorts; logger: Logger; hmacKey: HmacKey; redaction: RedactionService }) {
    this.#db = o.db;
    this.#logger = o.logger;
    this.blobs = new BlobStore(o.ports.fs, o.layout.blobs);
    this.store = new EvidenceStore({ fs: o.ports.fs, db: o.db, root: o.layout.evidence, random: o.ports.random, clock: o.ports.clock, logger: o.logger });
    this.snapshots = new SnapshotService({
      fs: o.ports.fs,
      db: o.db,
      blobs: this.blobs,
      hmacKey: o.hmacKey.key,
      redactor: () => o.redaction.redactor(),
      newId: () => newId(o.ports.random, 'snp'),
      now: () => o.ports.clock.now(),
    });
  }

  #deps(): RetentionDeps {
    return { db: this.#db, evidence: this.store, blobs: this.blobs };
  }

  settings(): { retainRuns: number; storeContent: boolean; maxEntries: number; maxDepth: number } {
    const s = readSettings(this.#db, ['evidence.retainRuns', 'evidence.storeContent', 'discovery.maxEntries', 'discovery.maxDepth']);
    return { retainRuns: s['evidence.retainRuns'] ?? 20, storeContent: s['evidence.storeContent'] ?? true, maxEntries: s['discovery.maxEntries'] ?? 100_000, maxDepth: s['discovery.maxDepth'] ?? 12 };
  }

  async retain(projectId: string): Promise<{ deleted: number; freedBytes: number }> {
    const r = await applyRetention(this.#deps(), projectId, this.settings().retainRuns);
    if (r.deleted) this.#logger.log('info', 'retention applied', { projectId, deleted: r.deleted, freedBytes: r.freedBytes });
    return r;
  }

  /** Retention for every project (a lower setting, the daily maintenance). */
  async retainAll(): Promise<number> {
    let deleted = 0;
    for (const p of this.#db.all<{ id: string }>('SELECT id FROM projects')) deleted += (await this.retain(p.id)).deleted;
    return deleted;
  }

  deleteRuns(projectId: string, runIds: readonly string[]): Promise<{ deleted: number; freedBytes: number }> {
    return deleteRuns(this.#deps(), projectId, runIds);
  }

  space(projectId: string): number {
    return projectSpace(this.#deps(), projectId);
  }

  /**
   * After a project's rows were deleted (FR-02: its runs, snapshots and the rest went by cascade): its evidence
   * folder, then the contents no snapshot references any more. The repository is never touched.
   */
  async afterProjectRemoved(projectId: string): Promise<void> {
    await removeProjectData(this.#deps(), projectId);
    purgeLedger(this.#db);
    await this.blobs.collect(this.#db);
  }
}
