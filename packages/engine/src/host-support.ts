// What the desktop main process borrows from the engine package: the data folder layout and the log file.
// Node-only modules, no SQLite, so the main bundle stays small. (Importing the engine from the main process
// is fine; the rule forbids the reverse, D-19.)
export { dataLayout, ensureDataDir, DIR_MODE, FILE_MODE, SUBDIRS, type DataLayout } from './storage/data-dir.ts';
export { createFileLogger, stderrLogger } from './node/file-logger.ts';
export { nodeFileSystem } from './node/fs.ts';
export { systemClock } from './node/clock.ts';
export { StorageError } from './storage/errors.ts';
export type { Logger, LogFields, LogLevel } from './ports/index.ts';
