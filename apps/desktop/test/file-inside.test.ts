// «افتح في المحرر» opens only a regular file inside the project's real root (AT-29: `../` refused).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileInside } from '../src/main/file-inside.ts';

let base: string;
let root: string;
beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-DEV-11-inside-')));
  root = join(base, 'project');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'export {};\n');
  writeFileSync(join(base, 'secret.txt'), 'outside\n');
  symlinkSync(join(base, 'secret.txt'), join(root, 'link.txt'));
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('fileInside', () => {
  it('resolves a file inside the root', async () => {
    expect(await fileInside(root, 'src/a.ts')).toBe(join(root, 'src', 'a.ts'));
  });
  it('refuses `..`, a symbolic link out of the root, a folder and a missing file', async () => {
    expect(await fileInside(root, '../secret.txt')).toBeNull();
    expect(await fileInside(root, 'src/../../secret.txt')).toBeNull();
    expect(await fileInside(root, 'link.txt')).toBeNull();
    expect(await fileInside(root, 'src')).toBeNull();
    expect(await fileInside(root, 'nope.ts')).toBeNull();
  });
});
