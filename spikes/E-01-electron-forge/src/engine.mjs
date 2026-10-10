// DEV-0 spike harness, engine side (Electron utilityProcess). No `electron` import here.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const warnings = [];
process.on('warning', (w) => warnings.push(`${w.name}: ${w.message}`));

const dbs = new Map();
function open(dbPath) {
  if (!dbs.has(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA busy_timeout = 5000');
    dbs.set(dbPath, db);
  }
  return dbs.get(dbPath);
}

const handlers = {
  ping: () => ({ pid: process.pid, ppid: process.ppid, node: process.versions.node, uptimeS: process.uptime(), warnings }),
  'sqlite.smoke': ({ dbPath }) => {
    const db = open(dbPath);
    const journal = db.prepare('PRAGMA journal_mode = WAL').get();
    db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run(`row at ${new Date().toISOString()}`);
    const { n } = db.prepare('SELECT count(*) AS n FROM t').get();
    const version = db.prepare('SELECT sqlite_version() AS v').get().v;
    return { journal, rows: n, sqliteVersion: version, warnings };
  },
  'sqlite.count': ({ dbPath }) => open(dbPath).prepare('SELECT count(*) AS n FROM t').get().n,
  'env.snapshot': () => ({ PATH: process.env.PATH, SHELL: process.env.SHELL, HOME: process.env.HOME, LANG: process.env.LANG ?? null }),
};

// Extra handlers registered by experiment modes (sent as module path at runtime).
async function load(modulePath) {
  const mod = await import(modulePath);
  Object.assign(handlers, mod.handlers);
  return Object.keys(mod.handlers);
}
handlers['engine.load'] = ({ modulePath }) => load(modulePath);

process.parentPort.on('message', async (e) => {
  const { id, cmd, params } = e.data;
  try {
    const fn = handlers[cmd];
    if (!fn) throw new Error(`unknown command ${cmd}`);
    const result = await fn(params || {});
    process.parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: String(err?.stack || err) });
  }
});
