// E-04, D-53, G-47: the HMAC key file (0600, stable, never replaced silently) and the declared test key.
import { chmodSync, existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeFileSystem as fs } from '../src/node/fs.ts';
import { nodeRandom } from '../src/node/random.ts';
import { ensureDataDir, type DataLayout } from '../src/storage/data-dir.ts';
import { hmacHex, keyFingerprint, loadHmacKey, TEST_HMAC_KEY } from '../src/storage/hmac-key.ts';
import { tempRoot } from './support/tmp.ts';

const uid = process.getuid!();
let layout: DataLayout;
let cleanup: () => void;

beforeEach(async () => {
  const t = tempRoot();
  cleanup = t.cleanup;
  layout = (await ensureDataDir(fs, join(t.dir, 'AYAR'), uid)).layout;
});
afterEach(() => cleanup());

describe('HMAC key (C-18 source)', () => {
  it('creates 32 random bytes in a 0600 file and returns the same key afterwards', async () => {
    const a = await loadHmacKey(fs, layout, 'file', nodeRandom, uid);
    expect(statSync(layout.hmacKey).mode & 0o777).toBe(0o600);
    expect(readFileSync(layout.hmacKey)).toHaveLength(32);
    const b = await loadHmacKey(fs, layout, 'file', nodeRandom, uid);
    expect(Buffer.from(b.key).equals(Buffer.from(a.key))).toBe(true);
    expect(a.source).toBe('file');
    expect(a.fingerprint).toBe(keyFingerprint(a.key));
    expect(a.fingerprint).not.toBe(keyFingerprint(TEST_HMAC_KEY));
  });

  it('tightens a key file that is readable by others', async () => {
    await loadHmacKey(fs, layout, 'file', nodeRandom, uid);
    chmodSync(layout.hmacKey, 0o644);
    await loadHmacKey(fs, layout, 'file', nodeRandom, uid);
    expect(statSync(layout.hmacKey).mode & 0o777).toBe(0o600);
  });

  it('refuses a symbolic link and a key of the wrong length, without replacing it', async () => {
    symlinkSync('/etc/hosts', layout.hmacKey);
    await expect(loadHmacKey(fs, layout, 'file', nodeRandom, uid)).rejects.toMatchObject({ code: 'data_dir_unsafe' });
    await fs.remove(layout.hmacKey);
    writeFileSync(layout.hmacKey, 'short', { mode: 0o600 });
    await expect(loadHmacKey(fs, layout, 'file', nodeRandom, uid)).rejects.toMatchObject({ details: { reason: 'hmac_key_length' } });
    expect(readFileSync(layout.hmacKey, 'utf8')).toBe('short');
  });

  it('tools/cli uses the declared test key and never creates a key file (G-47)', async () => {
    const k = await loadHmacKey(fs, layout, 'test', nodeRandom, uid);
    expect(k.source).toBe('test');
    expect(Buffer.from(k.key).equals(Buffer.from(TEST_HMAC_KEY))).toBe(true);
    expect(existsSync(layout.hmacKey)).toBe(false);
  });

  it('HMAC is deterministic for a key and differs between keys', async () => {
    const file = await loadHmacKey(fs, layout, 'file', nodeRandom, uid);
    const test = await loadHmacKey(fs, layout, 'test', nodeRandom, uid);
    expect(hmacHex(file, 'API_TOKEN=abc')).toBe(hmacHex(file, 'API_TOKEN=abc'));
    expect(hmacHex(file, 'API_TOKEN=abc')).not.toBe(hmacHex(test, 'API_TOKEN=abc'));
    expect(hmacHex(test, '')).toMatch(/^[0-9a-f]{64}$/);
  });
});
