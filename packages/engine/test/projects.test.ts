// C-05 helpers (FR-03, FR-59, E-05) and plan 19's property «توحيد المسارات قابل للعكس للمقارنة»: the comparison key
// of a path is its NFC form, so NFC and NFD spellings compare equal, the key is stable, and the path itself is
// kept as it is (the key is only for comparing; the stored path round-trips byte for byte).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readIdentity, sameIdentity } from '../src/projects/identity.ts';
import { broadPath, pathKey, protectedLocation, samePath } from '../src/projects/locations.ts';

// Path segments with Arabic letters, combining marks (hamza below, shadda, fatha), Latin with accents, spaces, quotes.
const piece = fc.constantFrom('مشاريع', 'تجريبية', 'مكتبة', '«النصوص»', 'إصدار', 'إ', 'شَّ', 'café', 'café', 'Å', 'Å', ' ', 'x', '-', '1');
const segment = fc.array(piece, { minLength: 1, maxLength: 6 }).map((a) => a.join(''));
const path = fc.array(segment, { minLength: 1, maxLength: 5 }).map((a) => `/Users/u/${a.join('/')}`);

describe('path normalization for comparison (plan 19, FR-03)', () => {
  it('property: NFC and NFD spellings of a path compare equal, and the key is idempotent', () => {
    fc.assert(
      fc.property(path, (p) => {
        expect(pathKey(p.normalize('NFD'))).toBe(pathKey(p.normalize('NFC')));
        expect(samePath(p.normalize('NFD'), p)).toBe(true);
        expect(pathKey(pathKey(p))).toBe(pathKey(p));
      }),
      { numRuns: 500 },
    );
  });

  it('property: comparing never changes the path itself (the original round-trips exactly)', () => {
    fc.assert(
      fc.property(path, fc.constantFrom<'NFC' | 'NFD'>('NFC', 'NFD'), (p, form) => {
        const stored = p.normalize(form);
        const copy = JSON.parse(JSON.stringify({ stored })) as { stored: string };
        void pathKey(stored);
        expect(Buffer.from(copy.stored)).toEqual(Buffer.from(stored));
      }),
      { numRuns: 300 },
    );
  });

  it('property: different paths stay different after normalization unless they are spellings of each other', () => {
    fc.assert(
      fc.property(path, path, (a, b) => {
        expect(samePath(a, b)).toBe(a.normalize('NFC') === b.normalize('NFC'));
      }),
      { numRuns: 300 },
    );
  });
});

describe('locations (E-05, FR-59) and broad paths (C-05)', () => {
  const home = '/Users/me';
  it('names the protected locations, and nothing else', () => {
    expect(protectedLocation('/Users/me/Documents/app', home)).toBe('documents');
    expect(protectedLocation('/Users/me/Desktop', home)).toBe('desktop');
    expect(protectedLocation('/Users/me/Downloads/x/y', home)).toBe('downloads');
    expect(protectedLocation('/Users/me/Library/Mobile Documents/com~apple~CloudDocs/p', home)).toBe('icloud');
    expect(protectedLocation('/Volumes/USB/p', home)).toBe('removable');
    expect(protectedLocation('/Users/me/Projects/p', home)).toBeNull();
    expect(protectedLocation('/Users/me/DocumentsArchive', home)).toBeNull();
  });

  it('warns about the disk root and the whole home folder only', () => {
    expect(broadPath('/', home)).toBe('disk_root');
    expect(broadPath('/Users/me', home)).toBe('home_folder');
    expect(broadPath('/Users/me/', home)).toBe('home_folder');
    expect(broadPath('/Users/me/p', home)).toBeNull();
  });
});

describe('project identity (C-05 «بصمة تعريفية»)', () => {
  it('names a project by its package, else by the content of its root file', async () => {
    const files = (m: Record<string, string>) => (f: string) => Promise.resolve(m[f] ?? null);
    const fp = (d: Uint8Array) => Buffer.from(d).toString('hex').slice(0, 8);
    const a = await readIdentity(files({ 'package.json': '{"name":"a","version":"1"}' }), fp);
    const a2 = await readIdentity(files({ 'package.json': '{"name":"a","version":"2"}' }), fp);
    const b = await readIdentity(files({ 'pyproject.toml': '[project]\nname = "b"\n' }), fp);
    const readme = await readIdentity(files({ 'README.md': '# x' }), fp);
    expect(a).toMatchObject({ name: 'a', file: 'package.json' });
    expect(b).toMatchObject({ name: 'b', file: 'pyproject.toml' });
    expect(sameIdentity(a!, a2!)).toBe(true);
    expect(sameIdentity(a!, b!)).toBe(false);
    expect(sameIdentity(readme!, readme!)).toBe(true);
    expect(await readIdentity(files({}), fp)).toBeNull();
  });
});
