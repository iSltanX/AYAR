// E-03 orchestrator: Electron main process, no window. Each database client is a utilityProcess.
// Run: ../E-01-electron-forge/node_modules/.bin/electron .   (see README.md)
import { app, utilityProcess } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Worker {
  constructor(name) {
    this.name = name;
    this.seq = 0;
    this.pending = new Map();
    this.child = utilityProcess.fork(path.join(here, 'db-worker.mjs'), [], { serviceName: `E03 ${name}`, stdio: 'ignore' });
    this.child.on('message', (m) => {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(new Error(`${name}: ${m.error}`));
    });
    this.exited = new Promise((r) => this.child.on('exit', (code) => r(code)));
    this.ready = new Promise((r) => this.child.once('spawn', r));
  }
  call(cmd, params) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.postMessage({ id, cmd, params });
    });
  }
  // Sends the command and does not wait for the reply (used before a SIGKILL).
  fire(cmd, params) { this.child.postMessage({ id: ++this.seq, cmd, params }); }
  async sigkill() {
    await this.ready;
    process.kill(this.child.pid, 'SIGKILL');
    return this.exited;
  }
}

function summarizePoll(samples, windowStart, windowEnd, allowed) {
  const inWindow = samples.filter((s) => s.t >= windowStart && s.t <= windowEnd);
  const errors = samples.filter((s) => s.error);
  const seen = [...new Set(samples.filter((s) => !s.error).map((s) => s.n))].sort((a, b) => a - b);
  const maxReadMs = Math.max(0, ...samples.filter((s) => !s.error).map((s) => s.ms));
  return {
    samples: samples.length,
    samplesDuringWrite: inWindow.length,
    errors: errors.length,
    firstError: errors[0]?.error ?? null,
    countsSeen: seen,
    onlyCommittedStates: seen.every((n) => allowed.includes(n)),
    maxReadMs: Number(maxReadMs.toFixed(2)),
  };
}

const sizes = (p) => Object.fromEntries(['', '-wal', '-shm'].map((s) => [s || 'db', fs.existsSync(p + s) ? fs.statSync(p + s).size : null]));

app.dock?.hide();
app.whenReady().then(async () => {
  const dir = path.join(app.getPath('userData'), 'e03');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'ayar-e03.db');
  const report = { spike: 'E-03', at: new Date().toISOString(), electron: process.versions.electron, dbDir: dir.replace(app.getPath('home'), '~'), steps: {} };
  const step = async (name, fn) => {
    try { report.steps[name] = { ok: true, ...(await fn()) }; } catch (e) { report.steps[name] = { ok: false, error: String(e.message) }; }
  };

  // 1) open with WAL + 2) 100k inserts in one transaction, while two readers poll.
  const writer = new Worker('writer');
  const r1 = new Worker('reader-1');
  const r2 = new Worker('reader-2');
  await step('open', async () => ({ writer: await writer.call('open', { dbPath, autoCheckpoint: 0 }) }));
  await step('readersOpen', async () => ({
    r1: await r1.call('open', { dbPath, readOnly: true }),
    r2: await r2.call('open', { dbPath, readOnly: true }),
  }));
  await step('insert100kWithConcurrentReads', async () => {
    await r1.call('pollStart', { intervalMs: 2 });
    await r2.call('pollStart', { intervalMs: 2 });
    await sleep(50);
    const ins = await writer.call('insert', { n: 100000, run: 'A' });
    await sleep(50);
    const p1 = await r1.call('pollStop');
    const p2 = await r2.call('pollStop');
    return {
      insertMs: Number(ins.ms.toFixed(1)),
      rowsPerSecond: Math.round(100000 / (ins.ms / 1000)),
      count: await writer.call('count'),
      reader1: summarizePoll(p1, ins.t0, ins.t1, [0, 100000]),
      reader2: summarizePoll(p2, ins.t0, ins.t1, [0, 100000]),
      filesAfter: sizes(dbPath),
    };
  });

  // 3) ten 10k transactions while readers poll: readers only ever see whole transactions.
  await step('tenTransactionsWithConcurrentReads', async () => {
    await r1.call('pollStart', { intervalMs: 1 });
    let first = null, last = null;
    for (let i = 0; i < 10; i++) {
      const x = await writer.call('insert', { n: 10000, run: 'B' });
      first ??= x.t0; last = x.t1;
    }
    const p1 = await r1.call('pollStop');
    const allowed = Array.from({ length: 11 }, (_, i) => 100000 + i * 10000);
    return { count: await writer.call('count'), reader1: summarizePoll(p1, first, last, allowed) };
  });
  await writer.call('close');

  // 4a) SIGKILL with an open, uncommitted 50k transaction.
  await step('killDuringOpenTransaction', async () => {
    const w = new Worker('writer-killed-open-tx');
    await w.call('open', { dbPath, autoCheckpoint: 0 });
    await w.call('insert', { n: 50000, run: 'C', commit: false });
    const filesBeforeKill = sizes(dbPath);
    const exit = await w.sigkill();
    const v = new Worker('verifier-a');
    await v.call('open', { dbPath });
    const res = { exitCode: exit, filesBeforeKill, count: await v.call('count'), byRun: await v.call('countByRun'), integrity: await v.call('integrity') };
    await v.call('close');
    return { ...res, expectedCount: 200000, recovered: res.count === 200000 && res.integrity[0] === 'ok' };
  });

  // 4b) SIGKILL right after commits that live only in the WAL (checkpoint disabled).
  await step('killAfterCommitBeforeCheckpoint', async () => {
    const w = new Worker('writer-killed-after-commit');
    await w.call('open', { dbPath, autoCheckpoint: 0 });
    await w.call('insert', { n: 20000, run: 'D' });
    const filesBeforeKill = sizes(dbPath);
    const exit = await w.sigkill();
    const v = new Worker('verifier-b');
    await v.call('open', { dbPath });
    const res = { exitCode: exit, filesBeforeKill, count: await v.call('count'), byRun: await v.call('countByRun'), integrity: await v.call('integrity') };
    await v.call('close');
    return { ...res, expectedCount: 220000, recovered: res.count === 220000 && res.integrity[0] === 'ok' };
  });

  // 4c) SIGKILL in the middle of a long-running insert (kill arrives while the transaction is running).
  await step('killMidInsert', async () => {
    const w = new Worker('writer-killed-mid-insert');
    await w.call('open', { dbPath, autoCheckpoint: 0 });
    w.fire('insert', { n: 2000000, run: 'E' });
    await sleep(400);
    const exit = await w.sigkill();
    const v = new Worker('verifier-c');
    await v.call('open', { dbPath });
    const res = { exitCode: exit, count: await v.call('count'), byRun: await v.call('countByRun'), integrity: await v.call('integrity') };
    await v.call('close');
    return { ...res, expectedCount: 220000, recovered: res.count === 220000 && res.integrity[0] === 'ok' };
  });

  // 5) VACUUM INTO while a reader polls; then verify the copy from a separate process.
  await step('vacuumInto', async () => {
    const w = new Worker('writer-vacuum');
    await w.call('open', { dbPath });
    await r2.call('pollStart', { intervalMs: 2 });
    const target = path.join(dir, 'backup', 'ayar-e03-backup.db');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const vac = await w.call('vacuumInto', { target });
    const p2 = await r2.call('pollStop');
    const v = new Worker('verifier-backup');
    await v.call('open', { dbPath: target, readOnly: true });
    const res = {
      vacuumMs: Number(vac.ms.toFixed(1)),
      backupCount: await v.call('count'),
      backupIntegrity: await v.call('integrity'),
      backupSizes: sizes(target),
      sourceSizes: sizes(dbPath),
      readerDuringVacuum: summarizePoll(p2, 0, Infinity, [220000]),
      warnings: await w.call('warnings'),
    };
    return { ...res, matches: res.backupCount === 220000 && res.backupIntegrity[0] === 'ok' };
  });

  report.ok = Object.values(report.steps).every((s) => s.ok && s.recovered !== false && s.matches !== false);
  const out = path.join(here, 'results', `e03-${report.at.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(0);
});
