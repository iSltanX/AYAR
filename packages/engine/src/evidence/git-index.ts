// The paths Git tracks, read from the index file (versions 2, 3 and 4) without running git (D-05, T2, E-16):
// FR-36's «الملف المتتبع المعدل» is a file Git tracks that a check changed. A file that is not an index, or one
// beyond the limits, gives null: «tracked» is then unknown, and the evidence says so instead of guessing.
import { posix } from 'node:path';
import { locate } from '../discovery/git.ts';
import type { DiscoveryFs } from '../discovery/walker.ts';

const MAX_INDEX_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 2_000_000;

export function parseGitIndex(data: Uint8Array): Set<string> | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 12 || data[0] !== 0x44 || data[1] !== 0x49 || data[2] !== 0x52 || data[3] !== 0x43) return null; // "DIRC"
  const version = view.getUint32(4);
  const count = view.getUint32(8);
  if (![2, 3, 4].includes(version) || count > MAX_ENTRIES) return null;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const out = new Set<string>();
  let at = 12;
  let previous: Uint8Array = new Uint8Array(0);
  for (let i = 0; i < count; i++) {
    const start = at;
    if (at + 62 > data.length) return null;
    const flags = view.getUint16(at + 60);
    at += 62;
    if (version >= 3 && flags & 0x4000) at += 2; // extended flags
    let name: Uint8Array;
    if (version === 4) {
      // A varint (the bytes to drop from the previous name), then the NUL-terminated rest of the name.
      let drop = 0;
      let byte = 0;
      let shift = 0;
      do {
        if (at >= data.length || shift > 28) return null;
        byte = data[at++]!;
        drop = shift === 0 ? byte & 0x7f : ((drop + 1) << 7) | (byte & 0x7f);
        shift += 7;
      } while (byte & 0x80);
      const end = data.indexOf(0, at);
      if (end < 0 || drop > previous.length) return null;
      const merged = new Uint8Array(previous.length - drop + (end - at));
      merged.set(previous.subarray(0, previous.length - drop));
      merged.set(data.subarray(at, end), previous.length - drop);
      name = merged;
      at = end + 1;
    } else {
      const end = data.indexOf(0, at);
      if (end < 0) return null;
      name = data.subarray(at, end);
      // Padded with 1 to 8 NUL bytes to a multiple of 8 from the start of the entry.
      at = start + Math.ceil((end - start + 1) / 8) * 8;
    }
    previous = name;
    // Stage bits (0x3000): a conflicted path is listed per stage; once is enough.
    out.add(decoder.decode(name));
  }
  return out;
}

/** The tracked paths of the work tree at `root`, or null when there is no readable index. */
export async function trackedPaths(fs: DiscoveryFs, root: string): Promise<Set<string> | null> {
  try {
    const where = await locate(fs, root);
    if (!where) return null;
    const file = posix.join(where.gitdir, 'index');
    const st = await fs.lstat(file);
    if (!st?.isFile || st.size > MAX_INDEX_BYTES) return null;
    const { data } = await fs.readFilePrefix(file, MAX_INDEX_BYTES);
    return parseGitIndex(data);
  } catch {
    return null;
  }
}
