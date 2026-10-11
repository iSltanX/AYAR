// «افتح في المحرر» (C-15, AT-29): a finding names its file relative to the project; only a regular file whose real
// path stays inside the project's real root is opened — never `..`, never a symbolic link out of it, never a folder.
import { realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

export async function fileInside(root: string, relative: string): Promise<string | null> {
  try {
    const realRoot = await realpath(root);
    const file = await realpath(join(realRoot, relative));
    if (!file.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) return null;
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}
