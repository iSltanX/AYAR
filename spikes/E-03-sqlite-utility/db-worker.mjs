// E-03 worker: runs inside an Electron utilityProcess. Writer or reader, by command.
import { DatabaseSync } from 'node:sqlite';

const warnings = [];
process.on('warning', (w) => warnings.push(`${w.name}: ${w.message}`));
let db = null;
let poll = null;
const now = () => performance.timeOrigin + performance.now();

const handlers = {
  open: ({ dbPath, readOnly = false, synchronous = 'NORMAL', autoCheckpoint }) => {
    db = new DatabaseSync(dbPath, { readOnly });
    db.exec('PRAGMA busy_timeout = 5000');
    const journal = readOnly ? db.prepare('PRAGMA journal_mode').get() : db.prepare('PRAGMA journal_mode = WAL').get();
    if (!readOnly) {
      db.exec(`PRAGMA synchronous = ${synchronous}`);
      if (autoCheckpoint !== undefined) db.exec(`PRAGMA wal_autocheckpoint = ${autoCheckpoint}`);
      db.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL)');
    }
    return { pid: process.pid, journal, sqlite: db.prepare('SELECT sqlite_version() AS v').get().v, node: process.versions.node, warnings };
  },
  // One transaction of n rows. commit=false leaves it open (for the kill test).
  insert: ({ n, run, commit = true }) => {
    const stmt = db.prepare('INSERT INTO events (run, seq, payload) VALUES (?, ?, ?)');
    const payload = 'x'.repeat(200);
    const t0 = now();
    db.exec('BEGIN');
    for (let i = 0; i < n; i++) stmt.run(run, i, payload);
    if (commit) db.exec('COMMIT');
    return { t0, t1: now(), ms: now() - t0, committed: commit };
  },
  count: () => db.prepare('SELECT count(*) AS n FROM events').get().n,
  countByRun: () => db.prepare('SELECT run, count(*) AS n FROM events GROUP BY run ORDER BY run').all(),
  integrity: () => db.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check),
  vacuumInto: ({ target }) => {
    const t0 = now();
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    return { ms: now() - t0 };
  },
  checkpoint: () => db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get(),
  pollStart: ({ intervalMs = 2 }) => {
    const out = [];
    const stmt = db.prepare('SELECT count(*) AS n FROM events');
    poll = { out, timer: setInterval(() => {
      const t = now();
      try { out.push({ t, n: stmt.get().n, ms: now() - t }); } catch (e) { out.push({ t, error: String(e.message) }); }
    }, intervalMs) };
    return true;
  },
  pollStop: () => { clearInterval(poll.timer); const out = poll.out; poll = null; return out; },
  close: () => { db.close(); return true; },
  warnings: () => warnings,
};

process.parentPort.on('message', async (e) => {
  const { id, cmd, params } = e.data;
  try {
    process.parentPort.postMessage({ id, ok: true, result: await handlers[cmd](params || {}) });
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
});
