// C-05 and FR-59 with E-05's result: where macOS asks for a privacy permission when a folder is reached without
// the open panel (a dropped folder, a path saved before the bundle id or the permissions changed), and which
// paths are too broad to add without a warning (the disk root, the whole home folder). Paths are compared after
// Unicode normalization (FR-03); the path on disk is never rewritten.
import type { ProtectedLocation } from '@ayar/protocol';

/** The comparison key of a path: NFC, so the NFC and NFD spellings of one name compare equal (FR-03). */
export function pathKey(path: string): string {
  return path.normalize('NFC');
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

function within(path: string, dir: string): boolean {
  const p = pathKey(path);
  const d = pathKey(dir);
  return p === d || p.startsWith(`${d}/`);
}

export function protectedLocation(realPath: string, home: string): ProtectedLocation | null {
  if (within(realPath, `${home}/Library/Mobile Documents`)) return 'icloud';
  if (within(realPath, `${home}/Documents`)) return 'documents';
  if (within(realPath, `${home}/Desktop`)) return 'desktop';
  if (within(realPath, `${home}/Downloads`)) return 'downloads';
  if (within(realPath, '/Volumes')) return 'removable';
  return null;
}

export function broadPath(realPath: string, home: string): 'disk_root' | 'home_folder' | null {
  if (realPath === '/') return 'disk_root';
  if (samePath(realPath.replace(/\/+$/, ''), home.replace(/\/+$/, ''))) return 'home_folder';
  return null;
}

/** EPERM or EACCES on a path: the privacy refusal C-05 turns into guidance (AT-33). */
export function isPermissionError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === 'EPERM' || code === 'EACCES';
}
