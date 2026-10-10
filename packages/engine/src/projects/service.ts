// C-05: the project registry, and the discovery runs it starts (C-06). A path arrives only as a grant behind a
// selection token (D-29); it must be a readable folder; the disk root and the whole home folder need a
// confirmation; the same real path (compared after Unicode normalization, or by device and inode) opens the
// existing project; a permission refusal becomes guidance (E-05). A moved project is relinked only after its
// identity matches, or after a confirmation. Removing a project deletes AYAR's data about it, never the
// repository. Each discovery runs in the background: its facts pass through C-18 before they are saved with
// the spec hashes (C-09) and the new profile version, in one transaction, and only then is the event sent.
import type { Catalog } from '@ayar/catalog';
import {
  protocolError,
  type DiscoverySnapshot,
  type DiscoverySummary,
  type PendingConfirmation,
  type Project,
} from '@ayar/protocol';
import { homedir } from 'node:os';
import { posix } from 'node:path';
import { discover, DiscoveryCancelled, SCANNER_VERSION } from '../discovery/discover.ts';
import type { EventBus } from '../host/event-bus.ts';
import { CommandError, fsError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { latestSnapshot, type ProfileService } from '../profile/service.ts';
import { changeSet, latestProfile } from '../profile/store.ts';
import type { RedactionService } from '../redaction/service.ts';
import { recordAudit } from '../storage/audit.ts';
import type { Db } from '../storage/db.ts';
import { hmacHex, type HmacKey } from '../storage/hmac-key.ts';
import { readSettings } from '../storage/settings.ts';
import { readIdentity, sameIdentity, type ProjectIdentity } from './identity.ts';
import { broadPath, isPermissionError, pathKey, protectedLocation } from './locations.ts';

const PENDING_TTL_MS = 5 * 60_000;
const KEEP_SNAPSHOTS = 10;

interface ProjectRow {
  id: string;
  display_name: string;
  root_path: string;
  root_realpath: string;
  trusted: number;
  created_at: string;
  last_opened_at: string | null;
}

interface Pending {
  kind: 'add' | 'relocate';
  path: string;
  realPath: string;
  projectId: string | null;
  reason: PendingConfirmation['reason'];
  expiresAtMs: number;
}

interface Running {
  discoveryId: string;
  controller: AbortController;
  done: Promise<void>;
}

export interface ProjectsServiceOptions {
  db: Db;
  ports: EnginePorts;
  catalog: Catalog;
  events: EventBus;
  logger: Logger;
  hmacKey: HmacKey;
  redaction: RedactionService;
  profiles: ProfileService;
  home?: string;
}

export class ProjectsService {
  readonly #o: ProjectsServiceOptions;
  readonly #pending = new Map<string, Pending>();
  readonly #running = new Map<string, Running>();
  readonly #home: string;

  constructor(o: ProjectsServiceOptions) {
    this.#o = o;
    this.#home = o.home ?? process.env.HOME ?? homedir();
  }

  #now(): Date {
    return this.#o.ports.clock.now();
  }

  #row(projectId: string): ProjectRow {
    const r = this.#o.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', projectId);
    if (!r) throw new CommandError('not_found', { reason: 'project' });
    return r;
  }

  /** A granted path: it exists, it is a folder, and it can be read (EPERM/EACCES become guidance, FR-59). */
  async #inspect(path: string): Promise<string> {
    const { fs } = this.#o.ports;
    try {
      const real = await fs.realpath(path);
      if (!real) throw new CommandError('path_missing');
      const st = await fs.stat(real);
      if (!st) throw new CommandError('path_missing');
      if (!st.isDirectory) throw new CommandError('not_a_directory');
      await fs.readdirEntries(real);
      return real;
    } catch (e) {
      if (e instanceof CommandError) throw e;
      if (isPermissionError(e)) throw new CommandError('permission_denied', { location: protectedLocation(path, this.#home) });
      throw fsError(e);
    }
  }

  #pend(p: Omit<Pending, 'expiresAtMs'>, details: { expected: string | null; found: string | null }): PendingConfirmation {
    const pendingId = newId(this.#o.ports.random, 'pnd');
    const expiresAtMs = this.#now().getTime() + PENDING_TTL_MS;
    for (const [id, x] of this.#pending) if (x.expiresAtMs < this.#now().getTime()) this.#pending.delete(id);
    this.#pending.set(pendingId, { ...p, expiresAtMs });
    return { pendingId, reason: p.reason, expected: details.expected, found: details.found, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  /** The project already registered at this real path: same NFC spelling, or the same folder by inode. */
  async #duplicate(realPath: string, exceptId?: string): Promise<ProjectRow | null> {
    const rows = this.#o.db.all<ProjectRow>('SELECT * FROM projects');
    const st = await this.#o.ports.fs.stat(realPath);
    for (const r of rows) {
      if (r.id === exceptId) continue;
      if (pathKey(r.root_realpath) === pathKey(realPath)) return r;
      const other = await this.#o.ports.fs.stat(r.root_realpath).catch(() => null);
      if (st && other && other.dev === st.dev && other.ino === st.ino) return r;
    }
    return null;
  }

  async add(path: string): Promise<{ status: 'added'; project: Project; discoveryId: string } | { status: 'existing'; project: Project } | { status: 'needs_confirmation'; confirmation: PendingConfirmation }> {
    const real = await this.#inspect(path);
    const existing = await this.#duplicate(real);
    if (existing) {
      this.#o.db.run('UPDATE projects SET last_opened_at = ? WHERE id = ?', this.#now().toISOString(), existing.id);
      return { status: 'existing', project: await this.view(existing.id) };
    }
    const broad = broadPath(real, this.#home);
    if (broad) return { status: 'needs_confirmation', confirmation: this.#pend({ kind: 'add', path, realPath: real, projectId: null, reason: broad }, { expected: null, found: null }) };
    return this.#insert(path, real);
  }

  async #insert(path: string, real: string): Promise<{ status: 'added'; project: Project; discoveryId: string }> {
    const id = newId(this.#o.ports.random, 'prj');
    const now = this.#now().toISOString();
    const name = (posix.basename(real) || real).slice(0, 200);
    this.#o.db.transaction(() => {
      // Not in «مشروع غير موثوق» mode until the user says so (FR-55: the mode is switched on, AT-05 step 7).
      this.#o.db.run('INSERT INTO projects (id, display_name, root_path, root_realpath, trusted, created_at, last_opened_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, name, path, real, now, now);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#now(), action: 'project.added', projectId: id, details: {} });
    });
    const discoveryId = this.startDiscovery(id);
    return { status: 'added', project: await this.view(id), discoveryId };
  }

  async confirm(pendingId: string): Promise<{ status: 'added'; project: Project; discoveryId: string } | { status: 'existing'; project: Project } | { status: 'relocated'; project: Project; discoveryId: string }> {
    const p = this.#pending.get(pendingId);
    this.#pending.delete(pendingId);
    if (!p || p.expiresAtMs < this.#now().getTime()) throw new CommandError('token_invalid', { reason: 'pending_expired' });
    // The folder is checked again: it may have changed in the meantime.
    const real = await this.#inspect(p.path);
    if (pathKey(real) !== pathKey(p.realPath)) throw new CommandError('token_invalid', { reason: 'path_changed' });
    if (p.kind === 'add') {
      const existing = await this.#duplicate(real);
      if (existing) return { status: 'existing', project: await this.view(existing.id) };
      return this.#insert(p.path, real);
    }
    return this.#relink(p.projectId!, p.path, real);
  }

  async relocate(projectId: string, path: string): Promise<{ status: 'relocated'; project: Project; discoveryId: string } | { status: 'needs_confirmation'; confirmation: PendingConfirmation }> {
    this.#row(projectId);
    const real = await this.#inspect(path);
    const other = await this.#duplicate(real, projectId);
    if (other) throw new CommandError('busy', { reason: 'already_registered' });
    const before = this.#identityFromSnapshot(projectId);
    if (before) {
      const after = await this.#identityOf(real);
      if (!after || !sameIdentity(before, after)) {
        return { status: 'needs_confirmation', confirmation: this.#pend({ kind: 'relocate', path, realPath: real, projectId, reason: 'identity_mismatch' }, { expected: before.name ?? before.file, found: after ? (after.name ?? after.file) : null }) };
      }
    }
    return this.#relink(projectId, path, real);
  }

  async #relink(projectId: string, path: string, real: string): Promise<{ status: 'relocated'; project: Project; discoveryId: string }> {
    this.#o.db.transaction(() => {
      this.#o.db.run('UPDATE projects SET root_path = ?, root_realpath = ?, last_opened_at = ? WHERE id = ?', path, real, this.#now().toISOString(), projectId);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#now(), action: 'project.relocated', projectId, details: {} });
    });
    const discoveryId = this.startDiscovery(projectId);
    return { status: 'relocated', project: await this.view(projectId), discoveryId };
  }

  #identityFromSnapshot(projectId: string): ProjectIdentity | null {
    const s = latestSnapshot(this.#o.db, projectId);
    const f = s?.facts.find((x) => x.key === 'project.identity');
    return f ? (f.value as unknown as ProjectIdentity) : null;
  }

  async #identityOf(root: string): Promise<ProjectIdentity | null> {
    const { fs } = this.#o.ports;
    return readIdentity(
      async (file) => {
        try {
          const p = posix.join(root, file);
          const st = await fs.lstat(p);
          if (!st?.isFile || st.size > 2 * 1024 * 1024) return null;
          return new TextDecoder().decode((await fs.readFilePrefix(p, 2 * 1024 * 1024)).data);
        } catch {
          return null;
        }
      },
      (data) => hmacHex(this.#o.hmacKey, data),
    );
  }

  async remove(projectId: string): Promise<void> {
    this.#row(projectId);
    this.cancelDiscovery(projectId);
    await this.#running.get(projectId)?.done;
    this.#o.db.transaction(() => {
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#now(), action: 'project.removed', projectId, details: { projectId } });
      // ON DELETE CASCADE removes its snapshots, profiles, approvals, runs and the rest (14.3). The repository is not touched.
      this.#o.db.run('DELETE FROM projects WHERE id = ?', projectId);
    });
  }

  rename(projectId: string, displayName: string): void {
    this.#row(projectId);
    this.#o.db.transaction(() => {
      this.#o.db.run('UPDATE projects SET display_name = ? WHERE id = ?', displayName, projectId);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#now(), action: 'project.renamed', projectId, details: {} });
    });
  }

  setTrust(projectId: string, trusted: boolean): void {
    this.#row(projectId);
    this.#o.profiles.setUntrusted(projectId, !trusted);
  }

  list(): Promise<Project[]> {
    const ids = this.#o.db.all<{ id: string }>('SELECT id FROM projects ORDER BY coalesce(last_opened_at, created_at) DESC, id');
    return Promise.all(ids.map((r) => this.view(r.id)));
  }

  async view(projectId: string): Promise<Project> {
    const r = this.#row(projectId);
    let pathStatus: Project['pathStatus'] = 'ok';
    try {
      const st = await this.#o.ports.fs.stat(r.root_realpath);
      if (!st || !st.isDirectory) pathStatus = 'missing';
      else await this.#o.ports.fs.readdirEntries(r.root_realpath);
    } catch (e) {
      pathStatus = isPermissionError(e) ? 'permission_denied' : 'missing';
    }
    const snap = latestSnapshot(this.#o.db, projectId);
    const profile = latestProfile(this.#o.db, projectId);
    const pending = profile ? changeSet(this.#o.db, projectId, profile.content.checks).items.filter((i) => i.approvable).length : 0;
    return {
      id: r.id,
      displayName: r.display_name,
      rootPath: r.root_realpath,
      createdAt: r.created_at,
      lastOpenedAt: r.last_opened_at,
      pathStatus,
      protectedLocation: protectedLocation(r.root_realpath, this.#home),
      untrusted: this.#o.profiles.untrusted(projectId),
      discovery: { running: this.#running.has(projectId), last: snap ? summary(snap) : null },
      pendingApprovals: pending,
    };
  }

  snapshot(projectId: string): DiscoverySnapshot | null {
    this.#row(projectId);
    return latestSnapshot(this.#o.db, projectId);
  }

  // ── Discovery runs (C-06) ──────────────────────────────────────────────────────────────────────────────

  rescan(projectId: string): string {
    this.#row(projectId);
    return this.startDiscovery(projectId);
  }

  /** Starts a discovery in the background (one per project; a second request joins the running one). */
  startDiscovery(projectId: string): string {
    const running = this.#running.get(projectId);
    if (running) return running.discoveryId;
    const discoveryId = newId(this.#o.ports.random, 'dsc');
    const controller = new AbortController();
    const entry: Running = { discoveryId, controller, done: Promise.resolve() };
    this.#running.set(projectId, entry);
    entry.done = this.#run(projectId, discoveryId, controller.signal).finally(() => {
      if (this.#running.get(projectId) === entry) this.#running.delete(projectId);
    });
    return discoveryId;
  }

  /** FR-09: cancel; nothing of the cancelled discovery is saved (C-06 «الإلغاء»). */
  cancelDiscovery(projectId: string): boolean {
    const r = this.#running.get(projectId);
    if (!r) return false;
    r.controller.abort();
    return true;
  }

  /** Cancels every running discovery (the engine is stopping). */
  cancelAll(): void {
    for (const r of this.#running.values()) r.controller.abort();
  }

  /** Waits for a project's running discovery (tests and orderly shutdown). */
  async settled(projectId: string): Promise<void> {
    await this.#running.get(projectId)?.done;
  }

  async #run(projectId: string, discoveryId: string, signal: AbortSignal): Promise<void> {
    const { db, events, redaction, profiles } = this.#o;
    const started = this.#o.ports.clock.monotonicMs();
    try {
      const row = this.#row(projectId);
      const s = readSettings(db, ['discovery.maxDepth', 'discovery.maxEntries', 'discovery.maxConfigBytes']);
      const result = await discover({
        root: row.root_realpath,
        fs: this.#o.ports.fs,
        limits: { maxDepth: s['discovery.maxDepth']!, maxEntries: s['discovery.maxEntries']!, maxConfigBytes: s['discovery.maxConfigBytes']! },
        signal,
        fingerprint: (data) => hmacHex(this.#o.hmacKey, data),
        onProgress: (p) => {
          if (!signal.aborted) events.emit('discovery.progress', { projectId, discoveryId, filesSeen: p.filesSeen, dirsSeen: p.dirsSeen, currentDir: p.currentDir, kinds: [...p.markers].sort() });
        },
      });
      if (signal.aborted) throw new DiscoveryCancelled();
      // C-18 before any save: every string of the facts, the inventory and the warnings.
      const redactor = redaction.redactor();
      const counts: Record<string, number> = {};
      const facts = redactor.redactJson(result.facts, counts);
      const components = redactor.redactJson(result.components, counts);
      const inventory = redactor.redactJson(result.inventory, counts);
      const warnings = redactor.redactJson(result.warnings, counts);
      const snapshot: DiscoverySnapshot = {
        id: newId(this.#o.ports.random, 'snp'),
        projectId,
        createdAt: this.#now().toISOString(),
        scannerVersion: SCANNER_VERSION,
        durationMs: Math.round(this.#o.ports.clock.monotonicMs() - started),
        partial: result.partial,
        partialReasons: result.partialReasons,
        components,
        facts,
        inventory,
        warnings,
        specFingerprints: {},
        redactions: counts,
      };
      const settings = profiles.settingsOf(projectId);
      const specs = profiles.specs(snapshot, settings);
      snapshot.specFingerprints = Object.fromEntries(specs.filter((x) => x.applicable).map((x) => [x.instance, x.specHash]));
      if (signal.aborted) throw new DiscoveryCancelled();
      db.transaction(() => {
        db.run(
          'INSERT INTO discovery_snapshots (id, project_id, created_at, scanner_version, partial, facts_json, inventory_json, warnings_json, spec_fingerprints_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          snapshot.id,
          projectId,
          snapshot.createdAt,
          snapshot.scannerVersion,
          snapshot.partial ? 1 : 0,
          JSON.stringify({ components: snapshot.components, facts: snapshot.facts, redactions: snapshot.redactions }),
          JSON.stringify(snapshot.inventory),
          JSON.stringify({ warnings: snapshot.warnings, partialReasons: snapshot.partialReasons, durationMs: snapshot.durationMs }),
          JSON.stringify(snapshot.specFingerprints),
        );
        profiles.regenerate(projectId, snapshot, 'proposed', settings);
        // Older snapshots beyond the last ten are not needed: the profile versions keep their specs.
        db.run(
          'DELETE FROM discovery_snapshots WHERE project_id = ? AND id NOT IN (SELECT id FROM discovery_snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)',
          projectId,
          projectId,
          KEEP_SNAPSHOTS,
        );
      });
      events.emit('discovery.done', { projectId, snapshotId: snapshot.id, partial: snapshot.partial, discoveryId, summary: summary(snapshot) });
    } catch (e) {
      if (e instanceof DiscoveryCancelled || signal.aborted) {
        events.emit('discovery.cancelled', { projectId, discoveryId });
        return;
      }
      const code = (e as { code?: string } | null)?.code;
      const error =
        e instanceof CommandError
          ? e.error
          : isPermissionError(e)
            ? protocolError('permission_denied', { location: protectedLocation(this.#safeRoot(projectId), this.#home) })
            : code === 'ENOENT' || code === 'ENOTDIR'
              ? protocolError('path_missing')
              : protocolError('internal', { stage: 'discovery' });
      this.#o.logger.log('error', 'discovery failed', { projectId, code: error.code, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      events.emit('discovery.failed', { projectId, discoveryId, error });
    }
  }

  #safeRoot(projectId: string): string {
    return this.#o.db.get<{ root_realpath: string }>('SELECT root_realpath FROM projects WHERE id = ?', projectId)?.root_realpath ?? '';
  }
}

export function summary(s: DiscoverySnapshot): DiscoverySummary {
  return { snapshotId: s.id, createdAt: s.createdAt, partial: s.partial, facts: s.facts.length, warnings: s.warnings.length, components: s.components.length };
}
