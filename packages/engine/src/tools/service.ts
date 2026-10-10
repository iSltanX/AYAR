// C-11 the tool manager [D-13, FR-49, FR-50, E-20, D-DEV2-04]. It knows where each tool a check needs comes from —
// a managed install in AYAR's own folder, a system tool inside the supported range (C-11 point 1), or the
// project's own — and installs a managed tool only through an explicit action: a preview, a confirmation bound to
// that preview's digest, an HTTPS download into a temporary folder, the pinned SHA-256, the signature where one
// exists (sigstore through a managed cosign, or a Developer ID team), the extraction, the permissions, then the
// register and the audit log. A hash or signature that does not match stops everything: the file is deleted, a
// security alert is raised, and an audit record says what came and what was expected (AT-35, T6). Readiness is
// then read from the tool itself (its version), never from the installer having succeeded (9.4 point 4).
import { canonicalJson } from '@ayar/catalog';
import type { DataAssetView, SetupPhase, ToolInstallPreview, ToolInstallResult, ToolView } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { CommandError } from '../host/errors.ts';
import type { EventBus } from '../host/event-bus.ts';
import { newId } from '../host/ids.ts';
import { DownloadError, type EnginePorts, type Logger } from '../ports/index.ts';
import { recordAudit } from '../storage/audit.ts';
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';
import { compare, parseVersion } from '../environment/semver.ts';
import { PROBE_ENV, PROBE_TIMEOUT_MS } from '../environment/resolve.ts';
import { isStale, machineArch, type ManagedToolDef } from './registry.ts';

export interface ToolLocation {
  key: string;
  source: 'managed' | 'system';
  path: string;
  version: string;
}

interface ToolRow {
  id: string;
  tool_key: string;
  version: string;
  source: string;
  path: string | null;
  sha256: string | null;
  license: string | null;
  installed_at: string | null;
  verified_at: string | null;
  status: string;
  signature_checked: number | null;
}

export interface ToolsServiceOptions {
  db: Db;
  ports: EnginePorts;
  layout: DataLayout;
  logger: Logger;
  events: EventBus;
  registry: ReadonlyMap<string, ManagedToolDef>;
  staleAfterDays: number;
  /** The PATH of the login environment (C-07), where system tools are looked for. */
  path: () => Promise<readonly string[]>;
}

/** A hash or signature failure: what was expected, what came. */
export class ToolRejected extends Error {
  readonly reason: 'hash_mismatch' | 'signature_invalid' | 'size_mismatch';
  readonly details: Record<string, string | number>;
  constructor(reason: ToolRejected['reason'], details: Record<string, string | number>) {
    super(reason);
    this.name = 'ToolRejected';
    this.reason = reason;
    this.details = details;
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export class ToolsService {
  readonly #o: ToolsServiceOptions;
  readonly #installing = new Map<string, Promise<ToolInstallResult>>();
  /** Version probes of system tools, by real path and file identity (a session cache). */
  readonly #probed = new Map<string, string | null>();

  constructor(o: ToolsServiceOptions) {
    this.#o = o;
  }

  get registry(): ReadonlyMap<string, ManagedToolDef> {
    return this.#o.registry;
  }

  def(key: string): ManagedToolDef {
    const d = this.#o.registry.get(key);
    if (!d) throw new CommandError('not_found', { reason: 'tool', tool: key });
    return d;
  }

  #file(def: ManagedToolDef) {
    const f = def.files.find((x) => x.arch === machineArch());
    if (!f) throw new CommandError('not_found', { reason: 'tool_arch', tool: def.key, arch: machineArch() });
    return f;
  }

  #row(key: string): ToolRow | undefined {
    return this.#o.db.get<ToolRow>("SELECT * FROM tools WHERE tool_key = ? AND source = 'managed' ORDER BY installed_at DESC LIMIT 1", key);
  }

  #installDir(def: ManagedToolDef): string {
    return posix.join(this.#o.layout.tools, def.key, def.version);
  }

  /** Runs `<tool> <versionArgs>` the way C-07 probes versions: 5 s, auto-installers off, a neutral folder. */
  async probe(def: ManagedToolDef, path: string): Promise<string | null> {
    const r = await this.#o.ports.processes.spawn(path, def.versionArgs, { cwd: this.#o.layout.tmp, env: { PATH: '/usr/bin:/bin', HOME: this.#o.layout.tmp, ...PROBE_ENV }, timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: 64 * 1024 });
    if (r.error || r.timedOut || r.code !== 0) return null;
    const text = new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr);
    return new RegExp(def.versionPattern, 'm').exec(text)?.[1] ?? null;
  }

  /** Is a system version inside the range this AYAR supports for the tool? */
  #inRange(def: ManagedToolDef, version: string): boolean {
    const v = parseVersion(version);
    const min = parseVersion(def.system?.min ?? '');
    if (!v || !min || !def.system) return false;
    return compare(v, min) >= 0 && v[0] < def.system.belowMajor;
  }

  /**
   * Where a tool comes from now (C-11 point 1): the managed install, else a system tool inside the supported
   * range (its version read from the tool itself). Null: not available — the check needs setup.
   */
  async locate(key: string): Promise<ToolLocation | null> {
    const def = this.#o.registry.get(key);
    if (!def) return null;
    const row = this.#row(key);
    if (row && row.status === 'installed' && row.version === def.version && row.path && (await this.#o.ports.fs.lstat(row.path))?.isFile) {
      return { key, source: 'managed', path: row.path, version: row.version };
    }
    if (!def.system) return null;
    for (const dir of await this.#o.path()) {
      if (!dir.startsWith('/')) continue; // a relative PATH entry would resolve inside whatever folder is current
      for (const name of def.system.names) {
        const p = posix.join(dir, name);
        const st = await this.#o.ports.fs.stat(p).catch(() => null);
        if (!st?.isFile || (st.mode & 0o111) === 0) continue;
        const real = (await this.#o.ports.fs.realpath(p).catch(() => null)) ?? p;
        const cacheKey = `${real}\0${st.size}\0${st.mtimeMs}\0${st.ino}`;
        if (!this.#probed.has(cacheKey)) this.#probed.set(cacheKey, await this.probe(def, p));
        const version = this.#probed.get(cacheKey) ?? null;
        if (version && this.#inRange(def, version)) return { key, source: 'system', path: p, version };
      }
    }
    return null;
  }

  async view(key: string): Promise<ToolView> {
    const def = this.def(key);
    const row = this.#row(key);
    const loc = await this.locate(key).catch(() => null);
    const f = def.files.find((x) => x.arch === machineArch());
    return {
      key,
      version: def.version,
      license: def.license,
      homepage: def.homepage,
      source: loc?.source ?? null,
      status: row ? (row.status as ToolView['status']) : 'not_installed',
      path: loc?.path ?? row?.path ?? null,
      installedVersion: row?.status === 'installed' ? row.version : (loc?.version ?? null),
      sha256: row?.sha256 ?? null,
      sizeBytes: f?.size ?? null,
      installedAt: row?.installed_at ?? null,
      verifiedAt: row?.verified_at ?? null,
      verifiedOk: row ? row.status === 'installed' : null,
      verification: def.verification,
      signatureChecked: row?.status === 'installed' && row.signature_checked !== null ? row.signature_checked === 1 : null,
      catalogVerifiedAt: def.verifiedAt,
      stale: isStale(def, this.#o.ports.clock.now(), this.#o.staleAfterDays),
    };
  }

  async list(): Promise<{ tools: ToolView[]; dataAssets: DataAssetView[] }> {
    const tools: ToolView[] = [];
    for (const key of [...this.#o.registry.keys()].sort()) tools.push(await this.view(key));
    const dataAssets = this.#o.db
      .all<{ kind: 'osv-db' | 'browser'; key: string; version_or_date: string; path: string; size: number | null; updated_at: string }>('SELECT kind, key, version_or_date, path, size, updated_at FROM data_assets ORDER BY kind, key')
      .map((r) => ({ kind: r.kind, key: r.key, versionOrDate: r.version_or_date, path: r.path, sizeBytes: r.size, updatedAt: r.updated_at }));
    return { tools, dataAssets };
  }

  /** FR-17 / 9.4 point 3: what an install will do, exactly; its digest binds the confirmation (D-DEV3-05). */
  preview(key: string): { target: string; digest: string; preview: ToolInstallPreview } {
    const def = this.def(key);
    const f = this.#file(def);
    const preview: ToolInstallPreview = {
      tool: key,
      version: def.version,
      url: f.url,
      host: new URL(f.url).hostname,
      sizeBytes: f.size,
      sha256: f.sha256,
      verification: def.verification,
      writes: `tools/${def.key}/${def.version}/`,
      license: def.license,
    };
    return { target: key, digest: sha(canonicalJson(preview)), preview };
  }

  /**
   * C-11 point 2. `digest` is the confirmation's: it must be the digest of the preview the user saw, recomputed
   * now (the DEV-3 condition on setup.execute and tools.install), or nothing is installed.
   */
  install(key: string, o: { digest: string | null; actionId?: string }): Promise<ToolInstallResult> {
    const p = this.preview(key);
    if (!o.digest || o.digest !== p.digest) throw new CommandError('confirmation_mismatch', { reason: 'preview_digest', tool: key });
    if (this.#installing.has(key)) throw new CommandError('busy', { reason: 'installing', tool: key });
    const job = this.#install(this.def(key), o.actionId ?? `tool:${key}`).finally(() => this.#installing.delete(key));
    this.#installing.set(key, job);
    return job;
  }

  #progress(actionId: string, phase: SetupPhase, extra: { bytes?: number | null; totalBytes?: number | null; securityAlert?: boolean; messageKey?: string } = {}): void {
    this.#o.events.emit('setup.progress', {
      actionId,
      phase,
      bytes: extra.bytes ?? null,
      totalBytes: extra.totalBytes ?? null,
      messageKey: extra.messageKey ?? `setup.phase.${phase}`,
      securityAlert: extra.securityAlert ?? false,
    });
  }

  async #install(def: ManagedToolDef, actionId: string): Promise<ToolInstallResult> {
    const { fs, network, clock, random } = this.#o.ports;
    const f = this.#file(def);
    const started = clock.monotonicMs();
    const free = await fs.freeBytes(this.#o.layout.tools);
    if (free !== null && free < f.size * 3) {
      return { status: 'failed', reason: 'disk_full', tool: await this.view(def.key), detail: null };
    }
    const work = posix.join(this.#o.layout.tmp, `install-${newId(random, 'tmp').slice(4)}`);
    await fs.mkdir(work, 0o700);
    await fs.chmod(work, 0o700);
    const download = posix.join(work, 'download');
    try {
      this.#progress(actionId, 'started');
      // 1. The download, at most the pinned size (a larger answer is cut short and fails the hash).
      try {
        await network.download(f.url, download, { maxBytes: f.size, onProgress: (bytes, total) => this.#progress(actionId, 'downloading', { bytes, totalBytes: total ?? f.size }) });
      } catch (e) {
        if (e instanceof DownloadError && e.code === 'too_large') throw new ToolRejected('size_mismatch', { expected: f.size });
        this.#o.logger.log('warn', 'tool download failed', { tool: def.key, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
        return { status: 'failed', reason: 'network', tool: await this.view(def.key), detail: e instanceof DownloadError ? e.code : 'network' };
      }
      // 2. The pinned hash (D-13): nothing else is trusted.
      this.#progress(actionId, 'verifying');
      const got = await fs.hashFile(download);
      if (got.sha256 !== f.sha256) throw new ToolRejected('hash_mismatch', { expected: f.sha256, actual: got.sha256, bytes: got.size });
      // 3. Unpack into the work folder; never outside it.
      this.#progress(actionId, 'extracting');
      const unpacked = posix.join(work, 'unpacked');
      await fs.mkdir(unpacked, 0o700);
      const binTarget = posix.join(unpacked, f.bin);
      if (f.archive === 'binary') {
        await fs.rename(download, binTarget);
      } else {
        const r = f.archive === 'tar.gz'
          ? await this.#o.ports.processes.spawn('/usr/bin/tar', ['-xzf', download, '-C', unpacked], { cwd: work, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 120_000, maxOutputBytes: 64 * 1024 })
          : await this.#o.ports.processes.spawn('/usr/bin/ditto', ['-x', '-k', download, unpacked], { cwd: work, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 120_000, maxOutputBytes: 64 * 1024 });
        if (r.code !== 0) return { status: 'failed', reason: 'extract', tool: await this.view(def.key), detail: new TextDecoder().decode(r.stderr).slice(0, 300) || null };
        await fs.remove(download);
      }
      const bin = await fs.lstat(binTarget);
      if (!bin?.isFile) return { status: 'failed', reason: 'extract', tool: await this.view(def.key), detail: 'executable missing' };
      await fs.chmod(binTarget, 0o755);
      // 4. The signature where one exists (D-DEV2-04): a Developer ID team, or sigstore through cosign.
      const signatureChecked = await this.#verifySignature(def, binTarget, work, f.sha256, f.url);
      // 5. AYAR downloaded and verified it: only now may a quarantine flag go (E-20). A programmatic download sets
      //    none; this only matters if the system added one.
      await this.#o.ports.processes.spawn('/usr/bin/xattr', ['-r', '-d', 'com.apple.quarantine', unpacked], { cwd: work, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 15_000, maxOutputBytes: 4096 });
      // 6. The version from the tool itself (9.4 point 4).
      this.#progress(actionId, 'probing');
      const version = await this.probe(def, binTarget);
      if (version !== def.version) return { status: 'failed', reason: 'extract', tool: await this.view(def.key), detail: `version ${version ?? 'unknown'}` };
      // 7. Into place, then the register and the audit log.
      const dest = this.#installDir(def);
      await fs.remove(dest);
      await fs.mkdir(posix.dirname(dest), 0o700);
      await fs.rename(unpacked, dest);
      const tree = await this.#treeHash(dest);
      const path = posix.join(dest, f.bin);
      const at = clock.now().toISOString();
      this.#o.db.transaction(() => {
        this.#o.db.run(
          `INSERT INTO tools (id, tool_key, version, source, path, sha256, license, installed_at, verified_at, status, signature_checked) VALUES (?, ?, ?, 'managed', ?, ?, ?, ?, ?, 'installed', ?)
           ON CONFLICT (tool_key, version) DO UPDATE SET source = 'managed', path = excluded.path, sha256 = excluded.sha256, license = excluded.license, installed_at = excluded.installed_at, verified_at = excluded.verified_at, status = 'installed', signature_checked = excluded.signature_checked`,
          newId(random, 'tol'),
          def.key,
          def.version,
          path,
          tree,
          def.license,
          at,
          at,
          signatureChecked === null ? null : signatureChecked ? 1 : 0,
        );
        recordAudit(this.#o.db, { id: newId(random, 'aud'), at: clock.now(), action: 'tool.installed', projectId: null, details: { tool: def.key, version: def.version, url: f.url, sha256: f.sha256, verification: def.verification.kind, signatureChecked: signatureChecked === null ? 'none' : signatureChecked ? 'yes' : 'no' } });
      });
      this.#progress(actionId, 'done');
      return { status: 'installed', tool: await this.view(def.key), downloadedBytes: got.size, durationMs: Math.round(clock.monotonicMs() - started) };
    } catch (e) {
      // The signature's own files (sigstore) could not be fetched: a network failure, not a rejection.
      if (e instanceof DownloadError) return { status: 'failed', reason: 'network', tool: await this.view(def.key), detail: e.code };
      if (!(e instanceof ToolRejected)) throw e;
      // C-11 «الأخطاء»: stop, delete, alert, audit.
      await fs.remove(work);
      const auditId = newId(random, 'aud');
      const at = clock.now().toISOString();
      this.#o.db.transaction(() => {
        this.#o.db.run(
          `INSERT INTO tools (id, tool_key, version, source, path, sha256, license, installed_at, verified_at, status) VALUES (?, ?, ?, 'managed', NULL, ?, ?, NULL, ?, 'rejected')
           ON CONFLICT (tool_key, version) DO UPDATE SET status = CASE WHEN tools.status = 'installed' THEN tools.status ELSE 'rejected' END, verified_at = excluded.verified_at`,
          newId(random, 'tol'),
          def.key,
          def.version,
          e.details.actual === undefined ? null : String(e.details.actual),
          def.license,
          at,
        );
        recordAudit(this.#o.db, { id: auditId, at: clock.now(), action: 'tool.installRejected', projectId: null, actor: 'engine', details: { tool: def.key, version: def.version, url: f.url, reason: e.reason, ...e.details } });
      });
      this.#o.logger.log('error', 'security alert: a downloaded tool did not match its pinned hash or signature, and was deleted', { tool: def.key, reason: e.reason });
      this.#progress(actionId, 'rejected', { securityAlert: true, messageKey: `setup.rejected.${e.reason}` });
      return { status: 'rejected', reason: e.reason, tool: await this.view(def.key), auditId };
    } finally {
      await fs.remove(work);
    }
  }

  /** true: the signature was checked; false: sigstore without cosign, the pinned hash alone; null: none to check. */
  async #verifySignature(def: ManagedToolDef, bin: string, work: string, archiveSha: string, archiveUrl: string): Promise<boolean | null> {
    const v = def.verification;
    const run = (cmd: string, args: string[]) => this.#o.ports.processes.spawn(cmd, args, { cwd: work, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
    if (v.kind === 'developer_id') {
      // The requirement itself, not only the signature's own claim: an Apple-anchored Developer ID chain (the
      // Developer ID CA and an application leaf) whose leaf names the pinned team. A self-signed certificate that
      // merely writes the team in its subject does not satisfy it. (teamId is [A-Z0-9]{10} by its schema.)
      const requirement = `anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${v.teamId}"`;
      const check = await run('/usr/bin/codesign', ['--verify', '--strict', `-R=${requirement}`, bin]);
      const info = await run('/usr/bin/codesign', ['-dv', bin]);
      const team = /TeamIdentifier=(\S+)/.exec(new TextDecoder().decode(info.stderr))?.[1] ?? null;
      if (check.code !== 0 || team !== v.teamId) throw new ToolRejected('signature_invalid', { expectedTeam: v.teamId, team: team ?? 'none' });
      return true;
    }
    if (v.kind !== 'sigstore' || !def.signature) return null;
    // sigstore «حيث يتاح»: with a cosign AYAR trusts (managed, or a system one in range); otherwise the pinned hash
    // alone stands, and the register says the signature was not checked.
    const cosign = await this.locate('cosign').catch(() => null);
    if (!cosign) {
      this.#o.logger.log('warn', 'sigstore signature not checked: cosign is not available (the pinned hash stands)', { tool: def.key });
      return false;
    }
    const checksums = posix.join(work, 'checksums.txt');
    const bundle = posix.join(work, 'checksums.sigstore.json');
    await this.#o.ports.network.download(def.signature.checksumsUrl, checksums, { maxBytes: 1024 * 1024 });
    await this.#o.ports.network.download(def.signature.bundleUrl, bundle, { maxBytes: 4 * 1024 * 1024 });
    const r = await run(cosign.path, ['verify-blob', '--bundle', bundle, '--certificate-identity', v.identity, '--certificate-oidc-issuer', v.issuer, checksums]);
    const listed = new TextDecoder().decode(await this.#o.ports.fs.readFile(checksums)).split('\n').some((l) => l.trim().startsWith(archiveSha) && l.trim().endsWith(posix.basename(new URL(archiveUrl).pathname)));
    if (r.code !== 0 || !listed) throw new ToolRejected('signature_invalid', { cosignExit: r.code ?? -1, listed: listed ? 1 : 0 });
    return true;
  }

  /** Whether an install of this tool would check a signature now (the preview says so before the confirmation). */
  async signatureCheckable(key: string): Promise<boolean | null> {
    const v = this.def(key).verification;
    if (v.kind === 'developer_id') return true;
    if (v.kind !== 'sigstore' || !this.def(key).signature) return null;
    return (await this.locate('cosign').catch(() => null)) !== null;
  }

  /** The installed files' own hash: what tools.verify recomputes later (a file changed after install shows). */
  async #treeHash(dir: string): Promise<string> {
    const { fs } = this.#o.ports;
    const lines: string[] = [];
    const walk = async (rel: string) => {
      for (const e of await fs.readdirEntries(rel ? posix.join(dir, rel) : dir)) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.kind === 'directory') await walk(r);
        else if (e.kind === 'file') lines.push(`${r}\0${(await fs.hashFile(posix.join(dir, r))).sha256}`);
        else lines.push(`${r}\0${e.kind}`);
      }
    };
    await walk('');
    return `tree:${sha(lines.sort().join('\n'))}`;
  }

  /** tools.verify: re-hash the installed files against the register; a change marks the tool damaged. */
  async verify(key?: string): Promise<ToolView[]> {
    const keys = key ? [key] : [...this.#o.registry.keys()];
    const out: ToolView[] = [];
    for (const k of keys.sort()) {
      const def = this.def(k);
      const row = this.#row(k);
      if (row?.status === 'installed' || row?.status === 'damaged') {
        const dest = this.#installDir(def);
        const exists = (await this.#o.ports.fs.lstat(dest))?.isDirectory ?? false;
        const tree = exists ? await this.#treeHash(dest) : null;
        const ok = tree !== null && tree === row.sha256;
        this.#o.db.transaction(() => {
          this.#o.db.run("UPDATE tools SET verified_at = ?, status = ? WHERE id = ?", this.#o.ports.clock.now().toISOString(), ok ? 'installed' : 'damaged', row.id);
          recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'tool.verified', projectId: null, actor: 'engine', details: { tool: k, ok } });
        });
      }
      out.push(await this.view(k));
    }
    return out;
  }

  /** tools.remove: the managed install and its register row go; a system tool is never touched. */
  async remove(key: string): Promise<{ removed: boolean; tool: ToolView }> {
    const def = this.def(key);
    const row = this.#row(key);
    await this.#o.ports.fs.remove(posix.join(this.#o.layout.tools, def.key));
    this.#o.db.transaction(() => {
      this.#o.db.run("DELETE FROM tools WHERE tool_key = ? AND source = 'managed'", key);
      recordAudit(this.#o.db, { id: newId(this.#o.ports.random, 'aud'), at: this.#o.ports.clock.now(), action: 'tool.removed', projectId: null, details: { tool: key, version: def.version, wasInstalled: row?.status === 'installed' } });
    });
    return { removed: row !== undefined, tool: await this.view(key) };
  }
}
