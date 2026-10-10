// The engine's abstract ports (D-19, NFR-07): it reaches the world only through these interfaces, so it runs
// in Electron's utilityProcess, in a plain Node child (tools/cli), in tests, and later on Linux. Pure
// computation (node:path, node:crypto hashing) is not a port. The Node implementations live in ../node/.

export interface FileStat {
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  /** Permission bits only (mode & 0o777). */
  mode: number;
  uid: number;
  size: number;
  mtimeMs: number;
  /** Device and inode: the identity of a file or folder whatever its path spelling (FR-03, C-05 duplicates). */
  dev: number;
  ino: number;
}

export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';
export interface DirEntry {
  name: string;
  kind: EntryKind;
}

export interface FileSystem {
  /** lstat: never follows a symbolic link. Null when the path does not exist. */
  lstat(path: string): Promise<FileStat | null>;
  /** Creates the directory and its missing parents with this mode. */
  mkdir(path: string, mode: number): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  readdir(path: string): Promise<string[]>;
  /** Entries with their kind, without following symbolic links. */
  readdirEntries(path: string): Promise<DirEntry[]>;
  /** stat: follows symbolic links. Null when the path (or its target) does not exist. */
  stat(path: string): Promise<FileStat | null>;
  /** The real path (links resolved). Null when the path does not exist. */
  realpath(path: string): Promise<string | null>;
  readFile(path: string): Promise<Uint8Array>;
  /** Reads at most maxBytes from the start of a file: a huge file is never read whole (AT-01). */
  readFilePrefix(path: string, maxBytes: number): Promise<{ data: Uint8Array; size: number }>;
  /** Writes through a temporary file in the same folder, then renames it into place. */
  writeFileAtomic(path: string, data: Uint8Array, mode: number): Promise<void>;
  /** Creates a new file with this mode; false if it already exists (O_EXCL). */
  writeFileExclusive(path: string, data: Uint8Array, mode: number): Promise<boolean>;
  /** Removes a file or a directory tree. Never follows symbolic links; missing is not an error. */
  remove(path: string): Promise<void>;
}

export interface Clock {
  now(): Date;
  /** Monotonic milliseconds: not moved by wall-clock changes. */
  monotonicMs(): number;
}

export interface ProcessControl {
  currentUid(): number;
  /** The start time of a live process as the OS reports it, or null when it does not exist. */
  startTime(pid: number): Promise<string | null>;
  /** Signals a whole process group. False when the group no longer exists. */
  killGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL'): Promise<boolean>;
  /**
   * Runs a program without a shell (argument array), in its own process group, stdin closed, with an exact
   * environment and a timeout after which the whole group is killed. Output is captured up to a limit. Used by
   * C-07 (the login shell, tool version probes); never by discovery (D-05).
   */
  spawn(command: string, args: readonly string[], options: SpawnOptions): Promise<SpawnResult>;
}

export interface SpawnOptions {
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  /** Bytes kept per stream; the rest is dropped and `truncated` is set. */
  maxOutputBytes: number;
}

export interface SpawnResult {
  code: number | null;
  signal: string | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
  timedOut: boolean;
  truncated: boolean;
  /** The spawn error code (ENOENT, EACCES…) when the program could not start. */
  error: string | null;
  durationMs: number;
}

/** The message channel to the host (main process or tools/cli). */
export interface HostChannel {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Called once when the host is gone. */
  onClose(listener: () => void): void;
}

export interface Random {
  bytes(length: number): Uint8Array;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  /** Writes what is buffered; used before a deliberate crash. */
  flush(): void;
}

/** The ports the engine receives from its entry point. */
export interface EnginePorts {
  fs: FileSystem;
  clock: Clock;
  processes: ProcessControl;
  random: Random;
  /** Ends the engine process with this code. */
  exit(code: number): never;
}
