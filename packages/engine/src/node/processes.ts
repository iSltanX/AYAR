// Node implementation of the ProcessControl port. The start time comes from ps(1), so that a reused pid is
// never mistaken for the process the ledger recorded (C-12: "مطابقة وقت بدئه").
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessControl } from '../ports/index.ts';

const run = promisify(execFile);

export const nodeProcessControl: ProcessControl = {
  currentUid: () => process.getuid?.() ?? -1,
  async startTime(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    try {
      const { stdout } = await run('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { env: { LC_ALL: 'C', TZ: 'UTC' } });
      const out = stdout.trim();
      return out.length ? out : null;
    } catch {
      return null; // ps exits 1 when the process does not exist
    }
  },
  killGroup(pgid, signal) {
    if (!Number.isInteger(pgid) || pgid <= 1) return Promise.resolve(false);
    try {
      process.kill(-pgid, signal);
      return Promise.resolve(true);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') return Promise.resolve(false);
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  },
};
