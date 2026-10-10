// The engine's own log, logs/engine.log as JSON lines, rotated by size (C-17: "logs/ لسجل عِيَار نفسه، بتدوير").
// Synchronous on purpose: the last line before a deliberate crash must reach the disk (C-04). Nothing secret
// is logged: messages are written by AYAR, and fields are codes, counts and ids.
import { appendFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock, LogFields, Logger, LogLevel } from '../ports/index.ts';

export interface FileLoggerOptions {
  dir: string;
  name: string;
  clock: Clock;
  maxBytes?: number;
  keep?: number;
  /** Also mirror to stderr (the supervisor keeps it as the crash context). */
  mirror?: boolean;
}

export function createFileLogger(o: FileLoggerOptions): Logger & { path: string } {
  const path = join(o.dir, `${o.name}.log`);
  const maxBytes = o.maxBytes ?? 5 * 1024 * 1024;
  const keep = o.keep ?? 3;
  const rotate = () => {
    if (!existsSync(path) || statSync(path).size < maxBytes) return;
    rmSync(join(o.dir, `${o.name}.${keep}.log`), { force: true });
    for (let i = keep - 1; i >= 1; i--) {
      const from = join(o.dir, `${o.name}.${i}.log`);
      if (existsSync(from)) renameSync(from, join(o.dir, `${o.name}.${i + 1}.log`));
    }
    renameSync(path, join(o.dir, `${o.name}.1.log`));
  };
  return {
    path,
    log(level: LogLevel, message: string, fields: LogFields = {}) {
      const line = JSON.stringify({ at: o.clock.now().toISOString(), level, message, ...fields }) + '\n';
      try {
        rotate();
        appendFileSync(path, line, { mode: 0o600 });
      } catch {
        // A full or missing disk must not take the engine down through its logger.
      }
      if (o.mirror) process.stderr.write(line);
    },
    flush() {
      // appendFileSync has already written every line.
    },
  };
}

/** A logger for the time before the data folder exists: stderr only. */
export function stderrLogger(clock: Clock): Logger {
  return {
    log(level, message, fields = {}) {
      process.stderr.write(JSON.stringify({ at: clock.now().toISOString(), level, message, ...fields }) + '\n');
    },
    flush() {},
  };
}
