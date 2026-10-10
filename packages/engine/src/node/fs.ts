// Node implementation of the FileSystem port.
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants, promises as fsp, type Stats } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { DirEntry, FileStat, FileSystem, FileWriter } from '../ports/index.ts';

const run = promisify(execFile);

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
    ctimeMs: s.ctimeMs,
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
  async rename(from, to) {
    await fsp.rename(from, to);
  },
  async openWriter(path, mode) {
    const handle = await fsp.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_APPEND | constants.O_NOFOLLOW, mode);
    let chain: Promise<unknown> = Promise.resolve();
    let failed: Error | null = null;
    const writer: FileWriter = {
      write(data) {
        chain = chain.then(async () => {
          if (failed) throw failed;
          let off = 0;
          while (off < data.length) {
            const { bytesWritten } = await handle.write(data, off, data.length - off);
            off += bytesWritten;
          }
        });
        chain.catch((e: unknown) => (failed ??= e instanceof Error ? e : new Error(String(e))));
        return chain as Promise<void>;
      },
      async close() {
        await chain.catch(() => {});
        await handle.close();
        if (failed) throw failed;
      },
    };
    return writer;
  },
  async hashFile(path) {
    const handle = await fsp.open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const st = await handle.stat();
      if (!st.isFile()) throw Object.assign(new Error(`not a regular file: ${path}`), { code: 'ENOTFILE' });
      const hash = createHash('sha256');
      const buffer = new Uint8Array(1024 * 1024);
      let size = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead));
        size += bytesRead;
      }
      return { sha256: hash.digest('hex'), size };
    } finally {
      await handle.close();
    }
  },
  async fsType(path) {
    try {
      const st = await fsp.statfs(path);
      return (await fsTypeNames()).get(Number(st.type)) ?? null;
    } catch {
      return null;
    }
  },
  async freeBytes(path) {
    try {
      const st = await fsp.statfs(path);
      return Number(st.bavail) * Number(st.bsize);
    } catch {
      return null;
    }
  },
};

/**
 * statfs() gives a volume's type as a number the kernel assigns when a file-system driver loads, so it is mapped
 * to a name once per engine through the mounted volumes: mount(8) names each one's type, statfs() gives its number.
 */
let typeNames: Promise<Map<number, string>> | null = null;
function fsTypeNames(): Promise<Map<number, string>> {
  typeNames ??= (async () => {
    const map = new Map<number, string>();
    try {
      const { stdout } = await run('/sbin/mount', [], { env: { LC_ALL: 'C' } });
      for (const line of stdout.split('\n')) {
        const m = / on (\/.*?) \(([a-z0-9_-]+)[,)]/i.exec(line);
        if (!m) continue;
        try {
          const st = await fsp.statfs(m[1]!);
          if (!map.has(Number(st.type))) map.set(Number(st.type), m[2]!.toLowerCase());
        } catch {
          /* an unreachable mount point says nothing */
        }
      }
    } catch {
      typeNames = null; // try again next time
    }
    return map;
  })();
  return typeNames;
}
