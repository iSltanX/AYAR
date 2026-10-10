#!/usr/bin/env node
// مولّد حالة بيانات عِيَار لاختبار AT-26 (DEV-1 القسم 6، DEV-5 المهمة 7): مجلد بيانات فيه مشروع بـ 21 تشغيلًا أحدها
// «محفوظ دائمًا» وجولة قائمة على أحدها، ومراجعات وبطاقات وصور مرجعية تجريبية، ولكل تشغيل لقطة حالة نهائية بمحتواها
// وسجل دليل ببصمته. يُبنى بمخطط القاعدة نفسه (ترحيلات المحرك) وبخدمات المحرك نفسها (اللقطات والأدلة)، لا بنسخة منها.
// للاختبار فقط: يستعمل مفتاح HMAC الاختباري المعلن (G-47) كما يفعل tools/cli.
//
//   node fixtures/tools/at26-state.ts <مجلد-البيانات> <جذر-المشروع> [--runs 21]
//
// يطبع سطر JSON: { projectId, runs: [الأقدم أولًا], keepForever, roundBase, reviews, tasks, baselines }.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { loadCatalog } from '../../packages/catalog/src/index.ts';
import { EvidenceService } from '../../packages/engine/src/evidence/service.ts';
import { nodeFileSystem } from '../../packages/engine/src/node/fs.ts';
import { nodePorts } from '../../packages/engine/src/node/ports.ts';
import { RedactionService } from '../../packages/engine/src/redaction/service.ts';
import { ensureDataDir } from '../../packages/engine/src/storage/data-dir.ts';
import { openDatabase } from '../../packages/engine/src/storage/db.ts';
import { keyFingerprint, TEST_HMAC_KEY } from '../../packages/engine/src/storage/hmac-key.ts';
import { migrate } from '../../packages/engine/src/storage/migrations.ts';

const [dataDir, projectRoot] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 21;
if (!dataDir || !projectRoot) {
  process.stderr.write('usage: node fixtures/tools/at26-state.ts <data-dir> <project-root> [--runs 21]\n');
  process.exit(2);
}

/** صورة PNG صغيرة بلون واحد (صورة مرجعية تجريبية). */
function png(r: number, g: number, b: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(4, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, r, g, b, r, g, b, r, g, b, r, g, b])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const { layout } = await ensureDataDir(nodeFileSystem, dataDir, process.getuid?.() ?? -1);
const db = openDatabase(layout.db);
const clock = nodePorts.clock;
await migrate(db, { fs: nodeFileSystem, clock, backupsDir: layout.backups, appVersion: '0.1.0' });
const { catalog } = loadCatalog(undefined, { now: new Date() });
const logger = { log: () => {}, flush: () => {} };
const hmacKey = { source: 'test' as const, key: TEST_HMAC_KEY, fingerprint: keyFingerprint(TEST_HMAC_KEY), created: false };
const evidence = new EvidenceService({ db, layout, ports: nodePorts, logger, hmacKey, redaction: new RedactionService(catalog) });

const root = realpathSync(projectRoot);
const projectId = 'prj_at26';
const at = (day: number) => new Date(Date.UTC(2026, 8, day, 8, 0, 0)).toISOString();
db.run('INSERT INTO projects (id, display_name, root_path, root_realpath, trusted, created_at) VALUES (?, ?, ?, ?, 1, ?)', projectId, 'AT-26', root, root, at(1));

const runs: string[] = [];
mkdirSync(join(root, 'state'), { recursive: true });
for (let i = 1; i <= RUNS; i++) {
  // كل تشغيل يرى حالة مختلفة قليلًا: ملف يتغير، فيبقى لكل لقطة محتوى يخصها ومحتوى مشترك.
  writeFileSync(join(root, 'state', 'counter.txt'), `run ${i}\n`);
  const manifest = await evidence.snapshots.take({ root, full: true, storeContent: true, previous: null, maxEntries: 100_000, maxDepth: 12 });
  const snap = await evidence.snapshots.persist(projectId, manifest, 'run_end');
  const runId = `run_at26_${String(i).padStart(2, '0')}`;
  const displayId = `RUN-202609${String(i).padStart(2, '0')}-001`;
  db.run(
    "INSERT INTO runs (id, display_id, project_id, kind, selection_json, plan_json, state, started_at, finished_at, snapshot_end_id, keep_forever, counts_json) VALUES (?, ?, ?, 'full', '{\"kind\":\"full\"}', '{}', 'finished', ?, ?, ?, ?, '{}')",
    runId,
    displayId,
    projectId,
    at(i),
    at(i),
    snap,
    i === 1 ? 1 : 0,
  );
  const checkRunId = `chk_at26_${String(i).padStart(2, '0')}`;
  db.run("INSERT INTO check_runs (id, run_id, check_id, component, state, outcome, started_at, finished_at, duration_ms) VALUES (?, ?, 'beh.unit', '.', 'finished', 'passed', ?, ?, 1200)", checkRunId, runId, at(i), at(i));
  await evidence.store.open(projectId, runId, checkRunId);
  await evidence.store.add({ projectId, runId, checkRunId, name: 'stdout.log', kind: 'log', data: Buffer.from(`run ${i}: ok\n`.repeat(50)), redacted: true });
  runs.push(runId);
}

// جولة قائمة أساسها التشغيل الثالث (ما تحتاجه الجولات القائمة يبقى).
db.run("INSERT INTO rounds (id, display_id, project_id, base_run_id, snapshot_id, updated_at) VALUES ('rnd_at26', 'ROUND-001', ?, ?, NULL, ?)", projectId, runs[2]!, at(3));
// مراجعتان، وبطاقتان، وصورتان مرجعيتان.
const reviews = ['rev_at26_1', 'rev_at26_2'];
for (const id of reviews) db.run("INSERT INTO reviews (id, project_id, target_type, target_ref, decision, scope_json, created_at) VALUES (?, ?, 'check', 'beh.unit@.', 'accepted', '{}', ?)", id, projectId, at(10));
const tasks = ['tsk_at26_1', 'tsk_at26_2'];
tasks.forEach((id, n) => db.run("INSERT INTO tasks (id, display_id, project_id, kind, title, body_json, status, created_at, updated_at) VALUES (?, ?, ?, 'fix', ?, '{}', 'open', ?, ?)", id, `TASK-000${n + 1}`, projectId, `مهمة ${n + 1}`, at(11), at(11)));
const baselines: string[] = [];
mkdirSync(join(layout.baselines, projectId), { recursive: true, mode: 0o700 });
for (const [n, color] of [[1, [200, 30, 30]], [2, [30, 30, 200]]] as const) {
  const rel = `${projectId}/home-${n}.png`;
  const data = png(color[0], color[1], color[2]);
  writeFileSync(join(layout.baselines, rel), data, { mode: 0o600 });
  const { sha256 } = await nodeFileSystem.hashFile(join(layout.baselines, rel));
  db.run("INSERT INTO baselines (id, project_id, key_json, rel_path, sha256, approved_at, status) VALUES (?, ?, ?, ?, ?, ?, 'approved')", `bas_at26_${n}`, projectId, JSON.stringify({ state: 'home', size: n }), rel, sha256, at(12));
  baselines.push(rel);
}
db.close();
process.stdout.write(`${JSON.stringify({ projectId, runs, keepForever: runs[0], roundBase: runs[2], reviews, tasks, baselines })}\n`);
