// Node implementation of the FileSystem port.
import { randomBytes } from 'node:crypto';
import { constants, promises as fsp, type Stats } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DirEntry, FileStat, FileSystem } from '../ports/index.ts';

const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

function toStat(s: Stats): FileStat {
  return {
    isDirectory: s.isDirectory(),
    isFile: s.isFile(),
    isSymbolicLink: s.isSymbolicLink(),
    mode: s.mode & 0o777,
    uid: s.uid,
    size: s.size,
    mtimeMs: s.mtimeMs,
    dev: s.dev,
    ino: s.ino,
  };
}

export const nodeFileSystem: FileSystem = {
  async lstat(path) {
    try {
      return toStat(await fsp.lstat(path));
    } catch (e) {
      if (code(e) === 'ENOENT') return null;
      throw e;
    }
  },
  async stat(path) {
    try {
      return toStat(await fsp.stat(path));
    } catch (e) {
      if (code(e) === 'ENOENT' || code(e) === 'ELOOP') return null;
      throw e;
    }
  },
  async realpath(path) {
    try {
      return await fsp.realpath(path);
    } catch (e) {
      if (code(e) === 'ENOENT' || code(e) === 'ELOOP') return null;
      throw e;
    }
  },
  async readdirEntries(path) {
    const entries = await fsp.readdir(path, { withFileTypes: true });
    return entries.map((d): DirEntry => ({
      name: d.name,
      kind: d.isSymbolicLink() ? 'symlink' : d.isDirectory() ? 'directory' : d.isFile() ? 'file' : 'other',
    }));
  },
  async readFilePrefix(path, maxBytes) {
    // No link is followed, and a FIFO or device cannot block the engine: open non-blocking, then insist on a
    // regular file by the handle itself (the path may have changed since it was listed).
    const handle = await fsp.open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const st = await handle.stat();
      if (!st.isFile()) throw Object.assign(new Error(`not a regular file: ${path}`), { code: 'ENOTFILE' });
      const { size } = st;
      const length = Math.max(0, Math.min(size, maxBytes));
      const buffer = new Uint8Array(length);
      let read = 0;
      while (read < length) {
        const { bytesRead } = await handle.read(buffer, read, length - read, read);
        if (bytesRead === 0) break;
        read += bytesRead;
      }
      return { data: buffer.subarray(0, read), size };
    } finally {
      await handle.close();
    }
  },
  async writeFileAtomic(path, data, mode) {
    const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
    let handle: fsp.FileHandle | undefined;
    try {
      handle = await fsp.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
      await handle.writeFile(data);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fsp.rename(temp, path);
    } catch (e) {
      await handle?.close();
      await fsp.rm(temp, { force: true });
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
