// C-17 part two (DEV-5): state snapshots (D-22, D-37, E-25), the content store and its collector, evidence files
// and their tokens, retention (14.3, AT-26 engine part), and the backups redacted again (G-DEV4-01).
import { loadCatalog } from '@ayar/catalog';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlobStore } from '../src/evidence/blobs.ts';
import { parseGitIndex, trackedPaths } from '../src/evidence/git-index.ts';
import { expiredRuns } from '../src/evidence/retention.ts';
import { EvidenceService } from '../src/evidence/service.ts';
import { diffManifests, underAny, type Manifest } from '../src/evidence/snapshot.ts';
import { nodeFileSystem } from '../src/node/fs.ts';
import { nodePorts } from '../src/node/ports.ts';
import { rescrubBackups } from '../src/redaction/rescrub.ts';
import { RedactionService } from '../src/redaction/service.ts';
import { backupDatabase, listBackups } from '../src/storage/backup.ts';
import { ensureDataDir, type DataLayout } from '../src/storage/data-dir.ts';
import { openDatabase, type Db } from '../src/storage/db.ts';
import { TEST_HMAC_KEY, keyFingerprint } from '../src/storage/hmac-key.ts';
import { migrate } from '../src/storage/migrations.ts';
import { fakeClock, tempRoot } from './support/tmp.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
const logger = { log: () => {}, flush: () => {} };
const hmacKey = { source: 'test' as const, key: TEST_HMAC_KEY, fingerprint: keyFingerprint(TEST_HMAC_KEY), created: false };
const SECRET = `ghp_${'a1B2c3D4e5'.repeat(4)}`;

let root: string;
let cleanup: () => void;
let db: Db;
let layout: DataLayout;
let project: string;
let redaction: RedactionService;
let ev: EvidenceService;

beforeEach(async () => {
  ({ dir: root, cleanup } = tempRoot('ayar-DEV-5-evidence-'));
  ({ layout } = await ensureDataDir(nodeFileSystem, join(root, 'AYAR'), process.getuid!()));
  db = openDatabase(layout.db);
  await migrate(db, { fs: nodeFileSystem, clock: fakeClock(), backupsDir: layout.backups, appVersion: '0.1.0' });
  db.run("INSERT INTO projects (id, display_name, root_path, root_realpath, created_at) VALUES ('p1', 'P', '/p', '/p', 'x')");
  project = join(root, 'project');
  mkdirSync(project);
  redaction = new RedactionService(catalog);
  ev = new EvidenceService({ db, layout, ports: nodePorts, logger, hmacKey, redaction });
});
afterEach(() => {
  try {
    db.close();
  } catch {
    /* closed */
  }
  // Evidence files are read-only: the folder itself stays writable, so removal works.
  cleanup();
});

const write = (rel: string, text: string) => {
  mkdirSync(join(project, rel, '..'), { recursive: true });
  writeFileSync(join(project, rel), text);
};
const take = (o: { full?: boolean; store?: boolean; previous?: Manifest | null } = {}) =>
  ev.snapshots.take({ root: project, full: o.full ?? true, storeContent: o.store ?? true, previous: o.previous ?? null, maxEntries: 100_000, maxDepth: 12 });
const entry = (m: Manifest, path: string) => m.files.find((f) => f[0] === path);
/** Every file under the data folder, read as text, searched for a value (AT-48's binary search). */
const dataHolds = (value: string): string[] => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (readFileSync(p).includes(Buffer.from(value))) hits.push(p);
    }
  };
  walk(layout.root);
  return hits;
};

describe('state snapshots (C-17, D-22, D-37)', () => {
  it('inventories the project without its dependencies, keeps text contents once, and never a sensitive one', async () => {
    write('src/a.js', 'export const a = 1;\n');
    write('src/b.js', 'export const a = 1;\n'); // same content: stored once
    write('.env', `TOKEN=${SECRET}\n`);
    write('config/settings.json', JSON.stringify({ token: SECRET }));
    write('node_modules/x/index.js', 'module.exports = 1;\n');
    write('ignored/big.txt', 'x');
    write('.gitignore', 'ignored/\n');
    writeFileSync(join(project, 'image.bin'), Buffer.from([0, 1, 2, 3]));
    symlinkSync('/etc/hosts', join(project, 'outside-link'));

    const m = await take();
    expect(m.files.map((f) => f[0])).toEqual(['.env', '.gitignore', 'config/settings.json', 'image.bin', 'outside-link', 'src/a.js', 'src/b.js']);
    expect(m.skipped).toEqual(expect.arrayContaining([{ path: 'node_modules', reason: 'default' }, { path: 'ignored', reason: 'gitignore' }]));
    // .env by name, and a file a high-confidence pattern matches, by HMAC only (never a bare SHA-256), not stored.
    expect(entry(m, '.env')).toMatchObject([ '.env', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.stringMatching(/^hmac:/), 'sensitive', false ]);
    expect(entry(m, 'config/settings.json')?.[6]).toBe('secret');
    expect(entry(m, 'config/settings.json')?.[5]).toMatch(/^hmac:/);
    expect(entry(m, 'image.bin')?.slice(6)).toEqual(['binary', false]);
    expect(entry(m, 'outside-link')?.[6]).toBe('link');
    expect(entry(m, 'src/a.js')?.[5]).toBe(entry(m, 'src/b.js')?.[5]);
    const id = await ev.snapshots.persist('p1', m, 'test');
    // One blob for the two identical files, plus the manifest; the secret is nowhere in the data folder.
    expect(db.get<{ n: number }>('SELECT count(*) AS n FROM snapshot_refs WHERE snapshot_id = ?', id)?.n).toBe(3);
    expect(dataHolds(SECRET)).toEqual([]);
    expect(await ev.snapshots.content(entry((await ev.snapshots.load(id))!, 'src/a.js')!)).toBe('export const a = 1;\n');
    // Blobs are read-only on disk.
    const blob = ev.blobs.path(entry(m, 'src/a.js')![5].slice(7));
    expect(statSync(blob).mode & 0o777).toBe(0o400);
  });

  it('E-25: the shortcut reuses unchanged files on APFS, and still sees a rewrite that kept size and mtime', async () => {
    write('a.txt', 'one\n');
    write('b.txt', 'two\n');
    const first = await take({ full: true });
    expect(first.fsType).toBe('apfs');
    // Same size, same mtime (touch -r): only ctime moves. A shortcut on mtime alone would miss it.
    const before = statSync(join(project, 'a.txt'));
    writeFileSync(join(project, 'a.txt'), 'ONE\n');
    utimesSync(join(project, 'a.txt'), before.atime, before.mtime);
    const fast = await take({ full: false, previous: first });
    expect(fast.fastPath).toEqual({ allowed: true, reused: 1 });
    expect(entry(fast, 'a.txt')?.[5]).not.toBe(entry(first, 'a.txt')?.[5]);
    expect(entry(fast, 'b.txt')?.[5]).toBe(entry(first, 'b.txt')?.[5]);
    // The decisive snapshots never take it.
    expect((await take({ full: true, previous: first })).fastPath).toEqual({ allowed: false, reused: 0 });
  });

  it('FR-36: created, modified and deleted files, the declared outputs apart, and the tracked file highlighted', async () => {
    write('src/a.js', 'a\n');
    write('data/runs.json', '{"runs":0}\n');
    write('old.txt', 'x\n');
    execFileSync('git', ['init', '-q'], { cwd: project });
    execFileSync('git', ['add', '-A'], { cwd: project });
    const before = await take({ store: false });
    write('data/runs.json', '{"runs":1}\n');
    write('.cache/last-run.json', '{}');
    write('reports/summary.txt', 'ok');
    unlinkSync(join(project, 'old.txt'));
    const after = await take({ store: false });
    const tracked = await trackedPaths(nodeFileSystem, project);
    expect(tracked).toEqual(new Set(['data/runs.json', 'old.txt', 'src/a.js']));
    const d = diffManifests(before, after, { declared: underAny(['.cache', 'reports']), tracked });
    expect(d).toMatchObject({
      created: ['.cache/last-run.json', 'reports/summary.txt'],
      modified: ['data/runs.json'],
      deleted: ['old.txt'],
      trackedModified: ['data/runs.json'],
      declared: ['.cache/last-run.json', 'reports/summary.txt'],
      truncated: false,
    });
  });

  it('reads Git index versions 2 and 4 (prefix-compressed names)', () => {
    execFileSync('git', ['init', '-q'], { cwd: project });
    write('a/one.txt', '1');
    write('a/two.txt', '2');
    write('b.txt', '3');
    execFileSync('git', ['add', '-A'], { cwd: project });
    expect(parseGitIndex(readFileSync(join(project, '.git/index')))).toEqual(new Set(['a/one.txt', 'a/two.txt', 'b.txt']));
    execFileSync('git', ['update-index', '--index-version', '4'], { cwd: project });
    const v4 = readFileSync(join(project, '.git/index'));
    expect(v4.readUInt32BE(4)).toBe(4);
    expect(parseGitIndex(v4)).toEqual(new Set(['a/one.txt', 'a/two.txt', 'b.txt']));
    expect(parseGitIndex(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('content store and collector (C-17 «مجمّع مخلفات بعدّ المراجع»)', () => {
  it('frees a content when the last snapshot naming it goes, and never one a snapshot in progress pinned', async () => {
    write('shared.txt', 'shared\n');
    write('only-1.txt', 'one\n');
    const s1 = await ev.snapshots.persist('p1', await take(), 'a');
    unlinkSync(join(project, 'only-1.txt'));
    const s2 = await ev.snapshots.persist('p1', await take(), 'b');
    const blobCount = () => db.get<{ n: number }>('SELECT count(*) AS n FROM snapshot_blobs')?.n ?? 0;
    const before = blobCount();
    db.run('DELETE FROM snapshots WHERE id = ?', s1);
    const gc = await ev.blobs.collect(db);
    expect(gc.blobs).toBe(2); // only-1.txt and s1's manifest; shared.txt is still named by s2
    expect(blobCount()).toBe(before - 2);
    // A snapshot being taken pins its contents until it is saved or discarded.
    write('new.txt', 'new\n');
    const inProgress = await take();
    db.run('DELETE FROM snapshots WHERE id = ?', s2);
    await ev.blobs.collect(db);
    const newSha = entry(inProgress, 'new.txt')![5].slice(7);
    expect(statSync(ev.blobs.path(newSha)).isFile()).toBe(true);
    ev.snapshots.discard(inProgress);
    await ev.blobs.collect(db);
    expect(() => statSync(ev.blobs.path(newSha))).toThrow();
    expect(blobCount()).toBe(0);
  });

  it('never removes a content stored or reused while a collection runs (independent review)', async () => {
    // A removal slow enough for the store to run in the middle of it.
    const slow = { ...nodeFileSystem, remove: async (p: string) => (await new Promise((r) => setTimeout(r, 50)), nodeFileSystem.remove(p)) };
    const store = new BlobStore(slow, layout.blobs);
    const data = new TextEncoder().encode('a content no snapshot names');
    const b = await store.put(db, data);
    store.unpin([b.sha256]);
    // The collection finds it unused; the same content is stored again meanwhile (a new snapshot).
    await Promise.all([store.collect(db), store.put(db, data)]);
    expect(await store.get(b.sha256)).toEqual(data);
    expect(db.get('SELECT sha256 FROM snapshot_blobs WHERE sha256 = ?', b.sha256)).toBeTruthy();

    // An inventory that reuses a content collected since (E-25 shortcut) reads the file again, never names a gone blob.
    write('kept.txt', 'kept\n');
    const first = await take({ full: true });
    const s1 = await ev.snapshots.persist('p1', first, 'a');
    db.run('DELETE FROM snapshots WHERE id = ?', s1);
    await ev.blobs.collect(db);
    const sha = entry(first, 'kept.txt')![5].slice(7);
    expect(() => statSync(ev.blobs.path(sha))).toThrow();
    const second = await take({ full: false, previous: first });
    expect(second.fastPath.reused).toBe(0);
    await ev.snapshots.persist('p1', second, 'b');
    expect(await ev.snapshots.content(entry(second, 'kept.txt')!)).toBe('kept\n');
  });

  it('refuses a damaged content instead of returning wrong bytes', async () => {
    const store = new BlobStore(nodeFileSystem, layout.blobs);
    const b = await store.put(db, new TextEncoder().encode('hello'));
    const p = store.path(b.sha256);
    chmodSync(p, 0o600);
    writeFileSync(p, Buffer.from('not gzip'));
    await expect(store.get(b.sha256)).rejects.toThrow();
  });
});

function seedRun(id: string, startedAt: string, o: { keep?: boolean; state?: string } = {}): string {
  db.run(
    'INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, state, started_at, finished_at, keep_forever) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    `RUN-${id}`,
    'p1',
    'full',
    '{}',
    '{}',
    o.state ?? 'finished',
    startedAt,
    startedAt,
    o.keep ? 1 : 0,
  );
  db.run("INSERT INTO check_runs (id, run_id, check_id, component, state) VALUES (?, ?, 'beh.unit', '.', 'finished')", `c-${id}`, id);
  return `c-${id}`;
}

describe('evidence files and tokens (C-17, T7)', () => {
  it('writes, hashes, makes read-only, and serves once through a token; a changed file is «دليل تالف»', async () => {
    const cr = seedRun('r1', '2026-10-10T08:00:00.000Z');
    await ev.store.open('p1', 'r1', cr);
    const ref = await ev.store.add({ projectId: 'p1', runId: 'r1', checkRunId: cr, name: 'stdout.log', kind: 'log', data: new TextEncoder().encode('ok\n'), redacted: true });
    const file = join(layout.evidence, ref.relPath);
    expect(statSync(file).mode & 0o777).toBe(0o400);
    expect(ref).toMatchObject({ kind: 'log', size: 3, redacted: true, truncated: false });
    const t = ev.store.token(ref.id);
    expect(t.token).toMatch(/^evt_[A-Za-z0-9_-]{43}$/);
    expect(await ev.store.resolve(t.token)).toMatchObject({ path: file, size: 3, sha256: ref.sha256 });
    await expect(ev.store.resolve(t.token)).rejects.toMatchObject({ error: { code: 'not_found' } }); // single use
    // A file swapped for a link, or changed, is never served.
    const t2 = ev.store.token(ref.id);
    chmodSync(file, 0o600);
    writeFileSync(file, 'changed\n');
    await expect(ev.store.resolve(t2.token)).rejects.toMatchObject({ error: { code: 'not_found', details: { reason: 'damaged' } } });
    const t3 = ev.store.token(ref.id);
    renameSync(file, `${file}.moved`);
    symlinkSync(`${file}.moved`, file);
    await expect(ev.store.resolve(t3.token)).rejects.toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('retention (C-17, 14.3, AT-26 engine part)', () => {
  it('keeps the last 20, every pinned run and what rounds need; frees the rest and the space shown drops by as much', async () => {
    write('src/a.js', 'a\n');
    for (let i = 1; i <= 23; i++) {
      const id = `r${String(i).padStart(2, '0')}`;
      const cr = seedRun(id, `2026-10-${String(i).padStart(2, '0')}T08:00:00.000Z`, { keep: i === 1 });
      await ev.store.open('p1', id, cr);
      await ev.store.add({ projectId: 'p1', runId: id, checkRunId: cr, name: 'stdout.log', kind: 'log', data: new TextEncoder().encode(`run ${i}\n`.repeat(10)), redacted: true });
      write('src/a.js', `a${i}\n`);
      const snap = await ev.snapshots.persist('p1', await take(), 'run_end');
      db.run('UPDATE runs SET snapshot_end_id = ? WHERE id = ?', snap, id);
    }
    // r02 is a round's base; r03 is still running.
    db.run("INSERT INTO rounds (id, display_id, project_id, base_run_id, updated_at) VALUES ('rd', 'ROUND-001', 'p1', 'r02', 'x')");
    db.run("UPDATE runs SET state = 'running' WHERE id = 'r03'");
    const before = ev.space('p1');
    expect(expiredRuns(db, 'p1', 20)).toEqual([]); // the oldest three are pinned, a round's base, and running
    db.run("UPDATE runs SET state = 'finished' WHERE id = 'r03'");
    expect(expiredRuns(db, 'p1', 20)).toEqual(['r03']);
    const r = await ev.retain('p1');
    expect(r.deleted).toBe(1);
    const after = ev.space('p1');
    expect(before - after).toBe(r.freedBytes);
    expect(r.freedBytes).toBeGreaterThan(0);
    expect(db.all<{ id: string }>('SELECT id FROM runs ORDER BY id').map((x) => x.id)).not.toContain('r03');
    expect(() => statSync(join(layout.evidence, 'p1', 'r03'))).toThrow();
    // The pinned run and the round's base are still there with their evidence.
    expect(statSync(join(layout.evidence, 'p1', 'r01')).isDirectory()).toBe(true);
    expect(statSync(join(layout.evidence, 'p1', 'r02')).isDirectory()).toBe(true);
  });
});

describe('backups redacted again (G-DEV4-01)', () => {
  it('a value that became sensitive after a backup is removed from the backup too', async () => {
    const value = 'zq7-Late-Sensitive-Value-91XK';
    db.run("UPDATE projects SET display_name = ? WHERE id = 'p1'", 'P');
    db.run(
      "INSERT INTO discovery_snapshots (id, project_id, created_at, scanner_version, partial, facts_json, inventory_json, warnings_json, spec_fingerprints_json) VALUES ('d1', 'p1', 'x', '1', 0, ?, '{}', '[]', '{}')",
      JSON.stringify({ facts: [{ key: 'x', value }] }),
    );
    const backup = await backupDatabase(db, nodeFileSystem, layout.backups, 'test', fakeClock());
    expect(readFileSync(backup).includes(Buffer.from(value))).toBe(true);
    redaction.registerKnownValues([{ rule: 'env:LATE_TOKEN', value }]);
    const r = await rescrubBackups(nodeFileSystem, layout.backups, redaction.redactor(), logger);
    expect(r).toEqual({ rewritten: 1, deleted: 0 });
    // The empty backup taken before the first migration is kept as it is (no table to redact).
    expect((await listBackups(nodeFileSystem, layout.backups)).length).toBe(2);
    for (const name of readdirSync(layout.backups)) expect(readFileSync(join(layout.backups, name)).includes(Buffer.from(value)), name).toBe(false);
    // Still a database, still 0600, and no journal files were left next to it.
    const copy = openDatabase(backup, { readOnly: true });
    expect(copy.get<{ n: number }>('SELECT count(*) AS n FROM discovery_snapshots')?.n).toBe(1);
    copy.close();
    expect(statSync(backup).mode & 0o777).toBe(0o600);
    expect(readdirSync(layout.backups).filter((n) => /-(wal|shm|journal)$/.test(n))).toEqual([]);
  });
});
