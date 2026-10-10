// Boot step 2 (C-04, C-12): settle the process ledger left by a previous engine. For every entry still
// "running": if its group leader is alive AND started at the recorded time (so a reused pid is never
// killed), the whole group is killed. Then every process of the user that carries one of those entries'
// AYAR_CHECK_TOKEN is ended too (E-22: the detached descendants whose leader is gone), and only then are the
// rows settled.
//
// G-27: this runs BEFORE migrations, on whatever schema the database has. It reads only the frozen columns.
import { sweepTokens } from '../executor/sweep.ts';
import type { ProcessControl } from '../ports/index.ts';
import { tableExists, type Db } from '../storage/db.ts';

export const LEDGER_FROZEN_COLUMNS = ['id', 'pid', 'pgid', 'os_start_time', 'check_token', 'temp_dir', 'state', 'ended_at'] as const;

export interface LedgerReport {
  running: number;
  killed: number;
  /** Leader gone, or alive with another start time: the pid was reused, so nothing was signalled. */
  notOurs: number;
  marked: number;
  /** Rows whose kill or update failed (for example EPERM: the pid now belongs to another user). */
  failed: number;
  /** Temp folders recorded outside tmp/ (never deleted from a path read in the database). */
  outsideTmp: number;
  /** Processes outside the groups that carried a ledger token (E-22), ended. */
  tokenKilled: number;
  error: string | null;
}

interface Row {
  id: string;
  pid: number;
  pgid: number;
  os_start_time: string;
  check_token: string;
  temp_dir: string | null;
}

export async function reapLedger(
  db: Db | null,
  processes: ProcessControl,
  o: { writable: boolean; tmpRoot: string; now: () => Date },
): Promise<LedgerReport> {
  const report: LedgerReport = { running: 0, killed: 0, notOurs: 0, marked: 0, failed: 0, outsideTmp: 0, tokenKilled: 0, error: null };
  // A ledger row never makes the engine signal itself or the app (a damaged or forged row).
  const self = new Set([process.pid, process.ppid, 0, 1]);
  if (!db) return report;
  let rows: Row[];
  try {
    if (!tableExists(db, 'process_ledger')) return report;
    rows = db.all<Row>("SELECT id, pid, pgid, os_start_time, check_token, temp_dir FROM process_ledger WHERE state = 'running'");
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    return report;
  }
  report.running = rows.length;
  for (const row of rows) {
    // Each row on its own: one failure must not stop the others, nor the boot.
    try {
      if (row.temp_dir && !row.temp_dir.startsWith(o.tmpRoot + '/')) report.outsideTmp++;
      const leaderStart = self.has(row.pgid) ? null : await processes.startTime(row.pgid);
      if (leaderStart !== null && leaderStart === row.os_start_time && (await processes.killGroup(row.pgid, 'SIGKILL'))) report.killed++;
      else report.notOurs++;
    } catch {
      report.failed++;
    }
  }
  // E-22: the detached descendants (setsid, double fork) left no group to kill: they are found by their token.
  try {
    report.tokenKilled = (await sweepTokens(processes, rows.map((r) => r.check_token))).length;
  } catch {
    report.failed++;
  }
  for (const row of rows) {
    // Marked even when the kill failed: a group we may not signal is not ours, and the row would repeat forever.
    if (o.writable) {
      try {
        db.run("UPDATE process_ledger SET state = 'reaped', ended_at = ? WHERE id = ?", o.now().toISOString(), row.id);
        report.marked++;
      } catch {
        report.failed++;
      }
    }
  }
  return report;
}
