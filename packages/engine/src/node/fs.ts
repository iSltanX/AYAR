// Node implementation of the FileSystem port.
import { constants, promises as fsp } from 'node:fs';
import type { FileStat, FileSystem } from '../ports/index.ts';

const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

export const nodeFileSystem: FileSystem = {
  async lstat(path) {
    try {
      const s = await fsp.lstat(path);
      const stat: FileStat = {
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
        isSymbolicLink: s.isSymbolicLink(),
        mode: s.mode & 0o777,
        uid: s.uid,
        size: s.size,
        mtimeMs: s.mtimeMs,
      };
      return stat;
    } catch (e) {
      if (code(e) === 'ENOENT') return null;
      throw e;
    }
  },
  async mkdir(path, mode) {
    await fsp.mkdir(path, { recursive: true, mode });
  },
  async chmod(path, mode) {
    await fsp.chmod(path, mode);
  },
  async readdir(path) {
    return fsp.readdir(path);
  },
  async readFile(path) {
    return new Uint8Array(await fsp.readFile(path));
  },
  async writeFileExclusive(path, data, mode) {
    let handle: fsp.FileHandle | undefined;
    try {
      handle = await fsp.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
      await handle.writeFile(data);
      await handle.sync();
      return true;
    } catch (e) {
      if (code(e) === 'EEXIST') return false;
      throw e;
    } finally {
      await handle?.close();
    }
  },
  async remove(path) {
    // fs.rm removes a symbolic link itself and never descends into its target.
    await fsp.rm(path, { recursive: true, force: true });
  },
};
