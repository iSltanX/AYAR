// C-07 point 3 (E-07): the versions installed by version managers, read from their folders without running them
// — nvm, fnm, mise, asdf, pyenv, and uv's Pythons — and nvm's default alias, resolved from files (G-49).
import { posix } from 'node:path';
import type { FileSystem } from '../ports/index.ts';
import { best, compare, parseVersion } from './semver.ts';

export interface InstalledVersion {
  tool: 'node' | 'python';
  version: string;
  manager: 'nvm' | 'fnm' | 'mise' | 'asdf' | 'pyenv' | 'uv';
  /** The executable of that version. */
  path: string;
}

type ManagersFs = Pick<FileSystem, 'readdirEntries' | 'stat' | 'readFilePrefix'>;

async function list(fs: ManagersFs, dir: string): Promise<string[]> {
  try {
    return (await fs.readdirEntries(dir)).filter((e) => e.kind === 'directory' || e.kind === 'symlink').map((e) => e.name);
  } catch {
    return [];
  }
}

async function executable(fs: ManagersFs, path: string): Promise<boolean> {
  const st = await fs.stat(path);
  return st !== null && st.isFile && (st.mode & 0o111) !== 0;
}

export async function installedVersions(fs: ManagersFs, home: string): Promise<InstalledVersion[]> {
  const out: InstalledVersion[] = [];
  const add = async (tool: InstalledVersion['tool'], manager: InstalledVersion['manager'], version: string, path: string) => {
    if (parseVersion(version) && (await executable(fs, path))) out.push({ tool, version: version.replace(/^v/, ''), manager, path });
  };
  for (const v of await list(fs, posix.join(home, '.nvm/versions/node'))) await add('node', 'nvm', v, posix.join(home, '.nvm/versions/node', v, 'bin/node'));
  for (const v of await list(fs, posix.join(home, '.local/share/fnm/node-versions'))) await add('node', 'fnm', v, posix.join(home, '.local/share/fnm/node-versions', v, 'installation/bin/node'));
  for (const v of await list(fs, posix.join(home, '.local/share/mise/installs/node'))) await add('node', 'mise', v, posix.join(home, '.local/share/mise/installs/node', v, 'bin/node'));
  for (const v of await list(fs, posix.join(home, '.local/share/mise/installs/python'))) await add('python', 'mise', v, posix.join(home, '.local/share/mise/installs/python', v, 'bin/python3'));
  for (const v of await list(fs, posix.join(home, '.asdf/installs/nodejs'))) await add('node', 'asdf', v, posix.join(home, '.asdf/installs/nodejs', v, 'bin/node'));
  for (const v of await list(fs, posix.join(home, '.asdf/installs/python'))) await add('python', 'asdf', v, posix.join(home, '.asdf/installs/python', v, 'bin/python3'));
  for (const v of await list(fs, posix.join(home, '.pyenv/versions'))) await add('python', 'pyenv', v, posix.join(home, '.pyenv/versions', v, 'bin/python3'));
  for (const d of await list(fs, posix.join(home, '.local/share/uv/python'))) {
    const m = /^cpython-(\d+\.\d+\.\d+)/.exec(d);
    if (m) await add('python', 'uv', m[1]!, posix.join(home, '.local/share/uv/python', d, 'bin/python3'));
  }
  out.sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : compare(parseVersion(b.version)!, parseVersion(a.version)!)));
  return out;
}

/** nvm's default alias (`~/.nvm/alias/default`: `24`, `v24.16.0`, `node`), resolved against the installed versions. */
export async function nvmDefault(fs: ManagersFs, home: string, installed: readonly InstalledVersion[]): Promise<string | null> {
  try {
    const { data } = await fs.readFilePrefix(posix.join(home, '.nvm/alias/default'), 256);
    const alias = new TextDecoder().decode(data).trim();
    const nvm = installed.filter((i) => i.tool === 'node' && i.manager === 'nvm').map((i) => i.version);
    if (alias === 'node' || alias === 'stable') return best(nvm, '>=0');
    return best(nvm, alias.replace(/^v/, ''));
  } catch {
    return null;
  }
}
