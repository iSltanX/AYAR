// C-17 (part 1): the data folder layout and its permissions (NFR-03, T10). The folder and everything AYAR
// creates in it are 0700; the HMAC key file is 0600 (D-53). A symbolic link where a folder is expected, or a
// folder owned by another user, makes the folder unsafe and nothing is written.
import { join } from 'node:path';
import type { FileSystem } from '../ports/index.ts';
import { StorageError } from './errors.ts';

export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;

/** Subfolders of plan C-17 (627–635). */
export const SUBDIRS = ['evidence', 'snapshots', 'snapshots/blobs', 'baselines', 'tools', 'browsers', 'osv-db', 'logs', 'tmp', 'backups'] as const;

export interface DataLayout {
  root: string;
  db: string;
  hmacKey: string;
  evidence: string;
  snapshots: string;
  blobs: string;
  baselines: string;
  tools: string;
  browsers: string;
  osvDb: string;
  logs: string;
  tmp: string;
  backups: string;
}

export function dataLayout(root: string): DataLayout {
  return {
    root,
    db: join(root, 'ayar.db'),
    hmacKey: join(root, 'hmac.key'),
    evidence: join(root, 'evidence'),
    snapshots: join(root, 'snapshots'),
    blobs: join(root, 'snapshots', 'blobs'),
    baselines: join(root, 'baselines'),
    tools: join(root, 'tools'),
    browsers: join(root, 'browsers'),
    osvDb: join(root, 'osv-db'),
    logs: join(root, 'logs'),
    tmp: join(root, 'tmp'),
    backups: join(root, 'backups'),
  };
}

export interface EnsureReport {
  layout: DataLayout;
  created: string[];
  /** Folders whose permissions were wider than 0700 and were tightened. */
  tightened: string[];
}

async function ensureDir(fs: FileSystem, path: string, uid: number, report: EnsureReport): Promise<void> {
  const st = await fs.lstat(path);
  if (!st) {
    await fs.mkdir(path, DIR_MODE);
    await fs.chmod(path, DIR_MODE); // mkdir's mode is filtered by the umask
    report.created.push(path);
    return;
  }
  if (st.isSymbolicLink) throw new StorageError('data_dir_unsafe', 'a symbolic link stands where a data folder is expected', { reason: 'symlink' });
  if (!st.isDirectory) throw new StorageError('data_dir_unsafe', 'a file stands where a data folder is expected', { reason: 'not_a_directory' });
  if (uid >= 0 && st.uid !== uid) throw new StorageError('data_dir_unsafe', 'the data folder belongs to another user', { reason: 'owner' });
  if (st.mode !== DIR_MODE) {
    await fs.chmod(path, DIR_MODE);
    report.tightened.push(path);
  }
}

/** Creates or checks the data folder. `uid` is the current user's (negative skips the owner check). */
export async function ensureDataDir(fs: FileSystem, root: string, uid: number): Promise<EnsureReport> {
  const layout = dataLayout(root);
  const report: EnsureReport = { layout, created: [], tightened: [] };
  await ensureDir(fs, root, uid, report);
  for (const sub of SUBDIRS) await ensureDir(fs, join(root, sub), uid, report);
  return report;
}

/** Deletes tmp/ entirely and recreates it 0700 (C-04 boot step 3, after the ledger is settled). */
export async function cleanTmp(fs: FileSystem, layout: DataLayout): Promise<{ removedEntries: number }> {
  const st = await fs.lstat(layout.tmp);
  const removedEntries = st?.isDirectory ? (await fs.readdir(layout.tmp)).length : st ? 1 : 0;
  await fs.remove(layout.tmp);
  await fs.mkdir(layout.tmp, DIR_MODE);
  await fs.chmod(layout.tmp, DIR_MODE);
  return { removedEntries };
}
