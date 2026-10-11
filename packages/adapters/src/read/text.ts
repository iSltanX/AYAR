// C-15 «حماية القراءة» for text (T3): ANSI escape sequences are removed from what is shown, and the characters that
// control direction are kept but made visible, so a message cannot reorder what the user reads (AT-29). Paths are
// normalized relative to the project root, NFC, and a path outside the root is marked, never followed.
import { posix } from 'node:path';

// CSI, OSC (BEL or ST terminated) and the other two-character escapes.
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

/** The direction controls of Unicode (embeddings, overrides, isolates, marks), as visible tokens. */
const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;

export function visibleBidi(s: string): string {
  return s.replace(BIDI, (c) => `⟪U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟫`);
}

/** What a message becomes before it is kept: no ANSI, visible direction controls, bounded. */
export function cleanMessage(s: string, max = 4000): string {
  const t = visibleBidi(stripAnsi(s)).replace(/\r\n?/g, '\n').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface NormalizedPath {
  path: string | null;
  outside: boolean;
}

/**
 * A tool's path as AYAR's location: relative to the project root, NFC, POSIX separators. A path relative to the
 * tool's folder (`cwd`, itself absolute) is resolved first; `file://` URIs are decoded. A path that leaves the root
 * is kept by its base name only and marked `outside` (C-15 «وما خرج عن الجذر يُوسم»).
 */
export function normalizePath(raw: string, root: string, cwd: string = root): NormalizedPath {
  if (!raw) return { path: null, outside: false };
  let p = raw;
  if (p.startsWith('file://')) {
    try {
      p = decodeURIComponent(new URL(p).pathname);
    } catch {
      return { path: null, outside: false };
    }
  }
  p = p.replace(/\\/g, '/');
  // Both sides NFC: a root and a tool's path may come in different normalizations (an NFD folder, AT-04).
  const abs = (posix.isAbsolute(p) ? posix.normalize(p) : posix.join(cwd, p)).normalize('NFC');
  const r = posix.normalize(root).normalize('NFC');
  const rel = posix.relative(r, abs);
  if (rel === '' || rel === '..' || rel.startsWith('../') || posix.isAbsolute(rel)) return { path: posix.basename(abs), outside: true };
  return { path: rel, outside: false };
}
