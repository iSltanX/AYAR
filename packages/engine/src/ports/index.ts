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
  /**
   * The status-change time (C-17 «المسار السريع»): every write or attribute change moves it, and a process with
   * the user's rights cannot set it back on APFS (E-25), unlike mtime.
   */
  ctimeMs: number;
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
  /** Renames within one volume (atomic replacement of the target). */
  rename(from: string, to: string): Promise<void>;
  /** Opens a new file (O_EXCL, no link followed) for appending in order; the caller closes it. */
  openWriter(path: string, mode: number): Promise<FileWriter>;
  /** SHA-256 of a whole file, streamed (never read whole into memory), and its size. Never follows a link. */
  hashFile(path: string): Promise<{ sha256: string; size: number }>;
  /**
   * The file-system type of the volume that holds a path (`apfs`, `hfs`, `exfat`, `msdos`, `smbfs`…), or null
   * when it cannot be told. E-25: the snapshot shortcut is allowed on APFS and HFS+ only.
   */
  fsType(path: string): Promise<string | null>;
  /** Bytes free on the volume that holds a path (C-11, C-17: stop before a download or a write fills the disk). */
  freeBytes(path: string): Promise<number | null>;
}

export interface FileWriter {
  /** Appends in call order; resolves when the bytes are written. */
  write(data: Uint8Array): Promise<void>;
  /** Flushes and closes. */
  close(): Promise<void>;
}

export interface Clock {
  now(): Date;
  /** Monotonic milliseconds: not moved by wall-clock changes. */
  monotonicMs(): number;
}

export type StopSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL';

export interface ProcessControl {
  currentUid(): number;
  /** The start time of a live process as the OS reports it, or null when it does not exist. */
  startTime(pid: number): Promise<string | null>;
  /** Signals a whole process group. False when the group no longer exists. */
  killGroup(pgid: number, signal: StopSignal): Promise<boolean>;
  /** Signals one process. False when it no longer exists. */
  killProcess(pid: number, signal: StopSignal): Promise<boolean>;
  /** True while at least one process of the group is alive (signal 0). */
  groupAlive(pgid: number): boolean;
  /**
   * Every process the OS shows (ps): the executor's 2 s sample of its groups (C-12 point 6), the descendants by
   * parent, and the launchd children that appeared during a check (E-22 escape rule).
   */
  listProcesses(): Promise<ProcessInfo[]>;
  /**
   * The environment strings of some of the user's own processes, as the OS lets them be read (KERN_PROCARGS2, E-22):
   * empty for platform binaries. Used only to find AYAR_CHECK_TOKEN on detached descendants (C-12 point 8).
   */
  environments(pids: readonly number[]): Promise<Map<number, string>>;
  /** The labels of the user's launchd jobs (E-22: a new job during a check is a possible escape). */
  launchdJobs(): Promise<string[]>;
  /**
   * Starts a long-running program for C-12: no shell (argument array), its own process group (detached), stdin
   * closed, stdout and stderr streamed, the exact environment given. The pid is known when it resolves.
   */
  start(command: string, args: readonly string[], options: StartOptions): Promise<StartedProcess>;
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

export interface ProcessInfo {
  pid: number;
  ppid: number;
  pgid: number;
  uid: number;
  /** Processor use in percent (ps %cpu: a decaying average, for display). */
  cpu: number;
  /** Processor time used so far (ps time): its change between two samples is the real activity (C-12 point 7). */
  cpuTimeMs: number;
  rssKb: number;
  /** As startTime() reports it (ps lstart, C locale, UTC). */
  startTime: string;
  /** The executable's path (ps comm). */
  command: string;
}

export interface StartOptions {
  cwd: string;
  env: Readonly<Record<string, string>>;
  onStdout(chunk: Uint8Array): void;
  onStderr(chunk: Uint8Array): void;
}

export interface StartedProcess {
  /** Null when the program could not start (see `error`). The group id is the pid (detached). */
  pid: number | null;
  /** The spawn error code (ENOENT, EACCES, EPERM…) when it could not start. */
  error: string | null;
  /**
   * Resolves when the leader exited (`exit`, not `close`: a detached grandchild may keep the pipes open, E-22),
   * after a short wait for the output it already wrote.
   */
  exited: Promise<{ code: number | null; signal: string | null }>;
}

/** Why a download stopped (the Network port's one error). */
export class DownloadError extends Error {
  readonly code: 'network' | 'too_large' | 'http_status' | 'insecure_url' | 'too_many_redirects' | 'aborted';
  constructor(code: DownloadError['code'], message: string) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
  }
}

/** HTTPS downloads for C-11 (managed tools and data assets). Never used for anything a check runs. */
export interface Network {
  /**
   * Streams a URL into a new file (O_EXCL): https only — plain http only to this machine when the host allowed it
   * for tests. Redirects are followed (https only), at most `maxBytes` are accepted. Resolves with the size.
   */
  download(url: string, dest: string, o: { maxBytes: number; signal?: AbortSignal; onProgress?: (bytes: number, total: number | null) => void }): Promise<{ bytes: number }>;
  /**
   * A companion service's readiness (C-12 point 10): one GET to a URL on this machine (the profile accepts no
   * other), the HTTP status or null when nothing answered within the time.
   */
  ping(url: string, timeoutMs: number): Promise<number | null>;
  /**
   * DEV-7 (C-12 point 10, AT-19): is a port of this machine taken already (by another program)? A companion service
   * that declares it would never become ready, and an answer on it would not be the service's.
   */
  portInUse?(port: number): Promise<boolean>;
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

/**
 * C-14 and 6.3 (E-11): the web probe's process. Under Electron it is a second utilityProcess the main process starts
 * at the engine's request, joined to the engine by a MessagePort; under Node (tools/cli, the tests) a child process
 * the engine forks itself. Either way the engine speaks to it by messages only, and ends it when its job is over.
 */
export interface ProbeProcess {
  readonly pid: number | null;
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Resolves with why it ended (its exit code or signal, or `closed`). */
  readonly exited: Promise<string>;
  /** Ends it now: its browser and its server go with it. */
  close(): void;
}

export interface ProbeHost {
  start(): Promise<ProbeProcess>;
  /** axe-core's script, as AYAR ships it (the probe reads it from here). */
  readonly axePath: string | null;
}

/** The ports the engine receives from its entry point. */
export interface EnginePorts {
  fs: FileSystem;
  clock: Clock;
  processes: ProcessControl;
  random: Random;
  network: Network;
  /** C-14: the web probe's process; absent where no probe can run (its checks say so: «تعذّر»). */
  probe?: ProbeHost;
  /** Ends the engine process with this code. */
  exit(code: number): never;
}
