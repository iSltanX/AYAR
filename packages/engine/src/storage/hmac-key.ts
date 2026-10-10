// The HMAC key of C-18 (E-04, D-53): 32 random bytes in <data>/hmac.key, a 0600 file inside the 0700 folder,
// never in the Keychain nor in the database. tools/cli has no app identity, so it uses a declared test key
// instead (G-47): the engine reports `hmacKeySource: test` in engine.health, and evidence records it.
import { createHash, createHmac } from 'node:crypto';
import type { FileSystem, Random } from '../ports/index.ts';
import type { HmacKeySource } from '@ayar/protocol';
import { FILE_MODE, type DataLayout } from './data-dir.ts';
import { StorageError } from './errors.ts';

export const HMAC_KEY_BYTES = 32;

/** The declared, public test key of tools/cli. It protects nothing, and says so wherever it is used. */
export const TEST_HMAC_KEY: Uint8Array = new Uint8Array(createHash('sha256').update('AYAR test HMAC key: public, not secret, tools/cli only (G-47)').digest());

export interface HmacKey {
  source: HmacKeySource;
  key: Uint8Array;
  /** True when this load created the key file (first run, or the file was missing). */
  created: boolean;
  /** First 16 hex digits of SHA-256(key): names the key in evidence without revealing it. */
  fingerprint: string;
}

export function keyFingerprint(key: Uint8Array): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function hmacHex(key: HmacKey, data: Uint8Array | string): string {
  return createHmac('sha256', key.key).update(data).digest('hex');
}

export async function loadHmacKey(fs: FileSystem, layout: DataLayout, source: HmacKeySource, random: Random, uid: number): Promise<HmacKey> {
  if (source === 'test') return { source, key: TEST_HMAC_KEY, fingerprint: keyFingerprint(TEST_HMAC_KEY), created: false };
  let st = await fs.lstat(layout.hmacKey);
  let created = false;
  if (!st) {
    created = await fs.writeFileExclusive(layout.hmacKey, random.bytes(HMAC_KEY_BYTES), FILE_MODE);
    if (created) await fs.chmod(layout.hmacKey, FILE_MODE); // the umask may have narrowed it further; make it exact
    st = await fs.lstat(layout.hmacKey);
  }
  if (!st || st.isSymbolicLink || !st.isFile) throw new StorageError('data_dir_unsafe', 'the HMAC key is not a regular file', { reason: 'hmac_key' });
  if (uid >= 0 && st.uid !== uid) throw new StorageError('data_dir_unsafe', 'the HMAC key belongs to another user', { reason: 'owner' });
  if (st.mode !== FILE_MODE) await fs.chmod(layout.hmacKey, FILE_MODE);
  const key = await fs.readFile(layout.hmacKey);
  // A key of another length is never replaced silently: earlier fingerprints would stop matching.
  if (key.length !== HMAC_KEY_BYTES) throw new StorageError('internal', 'the HMAC key file has the wrong length', { reason: 'hmac_key_length', length: key.length });
  return { source, key, fingerprint: keyFingerprint(key), created };
}
