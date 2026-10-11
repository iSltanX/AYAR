// C-11 and C-14 (DEV-7, task 6): the probe's browser — Chrome for Testing, the build playwright-core 1.64.0 drives
// (revision 1248) — installed only through an explicit setup action that shows its source and size first: an HTTPS
// download from Google's own storage, the pinned SHA-256 (Chrome for Testing carries no Developer ID signature, so
// the hash is the only proof, D-DEV7-07), the archive unpacked in a work folder, the version read from the browser
// itself, then moved into AYAR's `browsers/` and registered as a data asset. A hash that does not match stops
// everything: the file goes, a security alert is raised, an audit record keeps what came. Nothing here runs at a
// check's time: a missing browser is «ناقص» with this action, never an implicit download (9.4 point 5).
import { z } from '@ayar/protocol';
import { posix } from 'node:path';
import { newId } from '../host/ids.ts';
import type { EventBus } from '../host/event-bus.ts';
import { DownloadError, type EnginePorts, type Logger } from '../ports/index.ts';
import { recordAudit } from '../storage/audit.ts';
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';
import { PROBE_ENV } from '../environment/resolve.ts';

export const BrowserBuild = z.strictObject({
  /** The data asset's key and Playwright's own name for it. */
  key: z.literal('chromium'),
  revision: z.string().regex(/^\d+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/),
  url: z.url({ protocol: /^https?$/ }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.int().positive(),
  /** The executable inside the archive. */
  bin: z.string().min(1).max(512),
  verifiedAt: z.iso.date(),
  /** Only a host's test entry (tools/cli) may use http (its loopback server), never a shipped one. */
  test: z.boolean().optional(),
});
export type BrowserBuild = z.infer<typeof BrowserBuild>;

/**
 * The pinned build (verified 2026-10-11): the same file Playwright's CDN redirects to; its MD5 matched Google's own
 * `x-goog-hash` for the object, and `--version` said «Google Chrome for Testing 156.0.8078.4».
 */
export const BROWSER_BUILD: BrowserBuild = {
  key: 'chromium',
  revision: '1248',
  version: '156.0.8078.4',
  url: 'https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/mac-arm64/chrome-mac-arm64.zip',
  sha256: '987d2f8499c87d21676f78178550cfcbfb1bb53786821e2cff46c5a7e99b58be',
  size: 194_831_853,
  bin: 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  verifiedAt: '2026-10-11',
};

export interface LocatedBrowser {
  executablePath: string;
  version: string;
  dir: string;
}

export type BrowserInstallResult =
  | { status: 'installed'; browser: LocatedBrowser; downloadedBytes: number }
  | { status: 'rejected'; reason: 'hash_mismatch' | 'size_mismatch'; auditId: string }
  | { status: 'failed'; reason: 'network' | 'disk_full' | 'extract' | 'version'; detail: string | null };

export interface BrowserServiceOptions {
  db: Db;
  ports: EnginePorts;
  layout: DataLayout;
  logger: Logger;
  events: EventBus;
  build?: BrowserBuild;
}

export class BrowserService {
  readonly #o: BrowserServiceOptions;
  readonly build: BrowserBuild;

  constructor(o: BrowserServiceOptions) {
    this.#o = o;
    this.build = BrowserBuild.parse(o.build ?? BROWSER_BUILD);
    if (!this.build.test && !this.build.url.startsWith('https://')) throw new Error('the browser build must be fetched over https');
  }

  /** The installed browser, if its executable is there (the register alone is not trusted, 9.4 point 4). */
  async located(): Promise<LocatedBrowser | null> {
    const row = this.#o.db.get<{ path: string; version_or_date: string }>("SELECT path, version_or_date FROM data_assets WHERE kind = 'browser' AND key = ?", this.build.key);
    if (!row) return null;
    const st = await this.#o.ports.fs.stat(row.path).catch(() => null);
    if (!st?.isFile || (st.mode & 0o111) === 0) return null;
    return { executablePath: row.path, version: row.version_or_date, dir: posix.dirname(row.path) };
  }

  /** Where it goes inside AYAR's folder. */
  dir(): string {
    return posix.join(this.#o.layout.browsers, `${this.build.key}-${this.build.revision}`);
  }

  #progress(actionId: string, phase: 'started' | 'downloading' | 'verifying' | 'extracting' | 'probing' | 'done' | 'rejected', extra: { bytes?: number | null; totalBytes?: number | null; securityAlert?: boolean; messageKey?: string } = {}): void {
    this.#o.events.emit('setup.progress', { actionId, phase, bytes: extra.bytes ?? null, totalBytes: extra.totalBytes ?? null, messageKey: extra.messageKey ?? `setup.phase.${phase}`, securityAlert: extra.securityAlert ?? false });
  }

  async install(actionId: string): Promise<BrowserInstallResult> {
    const { fs, network, clock, random, processes } = this.#o.ports;
    const b = this.build;
    const free = await fs.freeBytes(this.#o.layout.browsers);
    if (free !== null && free < b.size * 3) return { status: 'failed', reason: 'disk_full', detail: null };
    const work = posix.join(this.#o.layout.tmp, `browser-${newId(random, 'tmp').slice(4)}`);
    await fs.mkdir(work, 0o700);
    await fs.chmod(work, 0o700);
    const download = posix.join(work, 'browser.zip');
    try {
      this.#progress(actionId, 'started');
      try {
        await network.download(b.url, download, { maxBytes: b.size, onProgress: (bytes, total) => this.#progress(actionId, 'downloading', { bytes, totalBytes: total ?? b.size }) });
      } catch (e) {
        if (e instanceof DownloadError && e.code === 'too_large') return this.#reject('size_mismatch', { expected: b.size }, actionId);
        this.#o.logger.log('warn', 'browser download failed', { error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
        return { status: 'failed', reason: 'network', detail: e instanceof DownloadError ? e.code : 'network' };
      }
      this.#progress(actionId, 'verifying');
      const got = await fs.hashFile(download);
      if (got.sha256 !== b.sha256) return this.#reject('hash_mismatch', { expected: b.sha256, actual: got.sha256, bytes: got.size }, actionId);
      this.#progress(actionId, 'extracting');
      const unpacked = posix.join(work, 'unpacked');
      await fs.mkdir(unpacked, 0o700);
      const x = await processes.spawn('/usr/bin/ditto', ['-x', '-k', download, unpacked], { cwd: work, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 300_000, maxOutputBytes: 64 * 1024 });
      if (x.code !== 0) return { status: 'failed', reason: 'extract', detail: new TextDecoder().decode(x.stderr).slice(0, 300) || null };
      await fs.remove(download);
      // AYAR downloaded and verified it: a quarantine flag, if the system added one, goes (E-20).
      await processes.spawn('/usr/bin/xattr', ['-r', '-d', 'com.apple.quarantine', unpacked], { cwd: work, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 60_000, maxOutputBytes: 4096 });
      this.#progress(actionId, 'probing');
      const exe = posix.join(unpacked, b.bin);
      const version = await this.#version(exe, work);
      if (version !== b.version) return { status: 'failed', reason: 'version', detail: `version ${version ?? 'unknown'}` };
      const dest = this.dir();
      await fs.remove(dest);
      await fs.mkdir(posix.dirname(dest), 0o700);
      await fs.rename(unpacked, dest);
      const path = posix.join(dest, b.bin);
      const at = clock.now().toISOString();
      this.#o.db.transaction(() => {
        this.#o.db.run(
          `INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES (?, 'browser', ?, ?, ?, ?, ?)
           ON CONFLICT (kind, key) DO UPDATE SET version_or_date = excluded.version_or_date, path = excluded.path, size = excluded.size, updated_at = excluded.updated_at`,
          newId(random, 'dat'),
          b.key,
          b.version,
          path,
          got.size,
          at,
        );
        recordAudit(this.#o.db, { id: newId(random, 'aud'), at: clock.now(), action: 'browser.installed', projectId: null, details: { browser: b.key, version: b.version, revision: b.revision, url: b.url, sha256: b.sha256 } });
      });
      this.#progress(actionId, 'done');
      return { status: 'installed', browser: { executablePath: path, version: b.version, dir: posix.dirname(path) }, downloadedBytes: got.size };
    } finally {
      await fs.remove(work);
    }
  }

  /** «Google Chrome for Testing 156.0.8078.4» from the browser itself, run with a home of its own (deleted after). */
  async #version(exe: string, work: string): Promise<string | null> {
    const home = posix.join(work, 'home');
    await this.#o.ports.fs.mkdir(home, 0o700);
    const r = await this.#o.ports.processes.spawn(exe, ['--version'], { cwd: home, env: { PATH: '/usr/bin:/bin', HOME: home, ...PROBE_ENV }, timeoutMs: 30_000, maxOutputBytes: 64 * 1024 });
    if (r.error || r.timedOut || r.code !== 0) return null;
    return /(\d+\.\d+\.\d+\.\d+)/.exec(new TextDecoder().decode(r.stdout))?.[1] ?? null;
  }

  #reject(reason: 'hash_mismatch' | 'size_mismatch', details: Record<string, string | number>, actionId: string): BrowserInstallResult {
    const { random, clock } = this.#o.ports;
    const auditId = newId(random, 'aud');
    recordAudit(this.#o.db, { id: auditId, at: clock.now(), action: 'browser.installRejected', projectId: null, actor: 'engine', details: { browser: this.build.key, version: this.build.version, url: this.build.url, reason, ...details } });
    this.#o.logger.log('error', 'security alert: the downloaded browser did not match its pinned hash, and was deleted', { reason });
    this.#progress(actionId, 'rejected', { securityAlert: true, messageKey: `setup.rejected.${reason}` });
    return { status: 'rejected', reason, auditId };
  }
}
