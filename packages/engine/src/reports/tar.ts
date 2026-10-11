// A minimal POSIX ustar writer for the evidence bundle (C-23 «حزمة أدلة مضغوطة»), gzipped by the caller. Names up
// to 255 bytes through the ustar prefix field; longer names are shortened with a digest. Regular files only, read-only
// modes, a fixed owner, and the time the caller gives: the bundle is reproducible for the same inputs.
import { createHash } from 'node:crypto';

export interface TarEntry {
  name: string;
  data: Uint8Array;
  /** Seconds since the epoch. */
  mtime: number;
  mode?: number;
}

const BLOCK = 512;

function octal(n: number, width: number): Uint8Array {
  const s = n.toString(8).padStart(width - 1, '0');
  const out = new Uint8Array(width);
  for (let i = 0; i < width - 1; i++) out[i] = s.charCodeAt(i);
  out[width - 1] = 0;
  return out;
}

function ascii(s: string, width: number): Uint8Array {
  const out = new Uint8Array(width);
  const b = Buffer.from(s, 'utf8');
  out.set(b.subarray(0, width));
  return out;
}

/** The name split into ustar's prefix (155) and name (100), both at a slash; or shortened with a digest. */
export function splitName(name: string): { prefix: string; name: string } {
  const bytes = Buffer.byteLength(name, 'utf8');
  if (bytes <= 100) return { prefix: '', name };
  const parts = name.split('/');
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join('/');
    const rest = parts.slice(i).join('/');
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(rest, 'utf8') <= 100) return { prefix, name: rest };
  }
  const digest = createHash('sha256').update(name).digest('hex').slice(0, 12);
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(name)?.[0] ?? '';
  return { prefix: '', name: `long-${digest}${ext}` };
}

export function tar(entries: readonly TarEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const e of entries) {
    const header = new Uint8Array(BLOCK);
    const { prefix, name } = splitName(e.name);
    header.set(ascii(name, 100), 0);
    header.set(octal(e.mode ?? 0o444, 8), 100);
    header.set(octal(0, 8), 108);
    header.set(octal(0, 8), 116);
    header.set(octal(e.data.length, 12), 124);
    header.set(octal(Math.max(0, Math.floor(e.mtime)), 12), 136);
    header.set(ascii('        ', 8), 148); // checksum placeholder: spaces
    header[156] = '0'.charCodeAt(0);
    header.set(ascii('ustar', 6), 257);
    header.set(ascii('00', 2), 263);
    header.set(ascii('ayar', 32), 265);
    header.set(ascii('ayar', 32), 297);
    header.set(ascii(prefix, 155), 345);
    let sum = 0;
    for (const b of header) sum += b;
    const cs = sum.toString(8).padStart(6, '0');
    header.set(ascii(`${cs}\0 `, 8), 148);
    chunks.push(header, e.data);
    const pad = (BLOCK - (e.data.length % BLOCK)) % BLOCK;
    if (pad) chunks.push(new Uint8Array(pad));
  }
  chunks.push(new Uint8Array(BLOCK * 2));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The entries of a tar (for the tests): name and data. */
export function untar(data: Uint8Array): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = [];
  let at = 0;
  const text = (from: number, len: number) => Buffer.from(data.subarray(from, from + len)).toString('utf8').replace(/\0.*$/s, '');
  while (at + BLOCK <= data.length) {
    const header = data.subarray(at, at + BLOCK);
    if (header.every((b) => b === 0)) break;
    const name = text(at, 100);
    const prefix = text(at + 345, 155);
    const size = parseInt(text(at + 124, 12).trim() || '0', 8);
    at += BLOCK;
    out.push({ name: prefix ? `${prefix}/${name}` : name, data: data.subarray(at, at + size) });
    at += size + ((BLOCK - (size % BLOCK)) % BLOCK);
  }
  return out;
}
