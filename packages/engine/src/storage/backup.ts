// Database backups with VACUUM INTO (C-17, 14.3): before every migration and weekly; the last three are kept.
import { join } from 'node:path';
import type { Clock, FileSystem } from '../ports/index.ts';
import type { Db } from './db.ts';
import { FILE_MODE } from './data-dir.ts';

export const BACKUPS_KEPT = 3;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NAME = /^ayar-(\d{8}T\d{9}Z)(?:-\d+)?-[a-z0-9.-]+\.db$/;

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace('.', '');
}

/** Writes a consistent copy of the database into the backups folder, 0600, and prunes old ones. */
export async function backupDatabase(db: Db, fs: FileSystem, dir: string, label: string, clock: Clock): Promise<string> {
  const base = `ayar-${stamp(clock.now())}`;
  const existing = new Set(await fs.readdir(dir));
  let name = `${base}-${label}.db`;
  for (let i = 1; existing.has(name); i++) name = `${base}-${i}-${label}.db`;
  const path = join(dir, name);
  db.run('VACUUM INTO ?', path);
  await fs.chmod(path, FILE_MODE);
  await pruneBackups(fs, dir);
  return path;
}

export async function listBackups(fs: FileSystem, dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).filter((n) => NAME.test(n)).sort();
}

export async function pruneBackups(fs: FileSystem, dir: string, keep = BACKUPS_KEPT): Promise<string[]> {
  const all = await listBackups(fs, dir);
  const old = all.slice(0, Math.max(0, all.length - keep));
  for (const n of old) await fs.remove(join(dir, n));
  return old;
}

/** The time of the newest backup, read from its name, or null when there is none. */
export async function newestBackupTime(fs: FileSystem, dir: string): Promise<Date | null> {
  const last = (await listBackups(fs, dir)).at(-1);
  const m = last ? NAME.exec(last) : null;
  if (!m?.[1]) return null;
  const s = m[1];
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.${s.slice(15, 18)}Z`);
}

/** The weekly backup (14.3): when the newest backup is a week old, or there is none. */
export async function weeklyBackupIfDue(db: Db, fs: FileSystem, dir: string, clock: Clock): Promise<string | null> {
  const newest = await newestBackupTime(fs, dir);
  if (newest && clock.now().getTime() - newest.getTime() < WEEK_MS) return null;
  return backupDatabase(db, fs, dir, 'weekly', clock);
}
