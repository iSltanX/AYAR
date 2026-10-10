// AT-26, the engine part (FR-02, FR-37, NFR-02, NFR-03), through tools/cli on the state fixtures/tools/at26-state.ts
// builds with the engine's own schema and services: 21 runs, one kept forever, a round on another, reviews, cards
// and baselines. After opening, everything is sound and every evidence hash matches; the data folder is 0700;
// retention keeps the pinned run and what the round needs, collects the content no snapshot references, and the
// space shown drops by as much; a moved project is found again by its identity and keeps its history; and removing
// a project removes AYAR's data about it only — its repository is untouched.
import type { RunList } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationGrant, pathGrant } from '../src/grants.ts';
import { addProject, connectEngine, FIXTURES, filesUnder, materialize, ok, tempDir } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at26-')));
afterEach(() => cleanup());

/** A tree's content, file by file (the repository «untouched» is compared byte for byte). */
const treeHash = (dir: string) =>
  createHash('sha256')
    .update(filesUnder(dir).sort().map((f) => `${f.slice(dir.length)}\0${createHash('sha256').update(readFileSync(f)).digest('hex')}`).join('\n'))
    .digest('hex');

const query = <T>(dataDir: string, sql: string, ...params: (string | number)[]): T[] => {
  const db = new DatabaseSync(join(dataDir, 'ayar.db'), { readOnly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
};

describe('AT-26 (engine): sound after opening, retention, a moved project, and removal of AYAR data only', () => {
  it('runs the whole scenario on the generated state', async () => {
    const dataDir = join(root, 'AYAR');
    const repo = materialize('FX-PROC', 'good', join(root, 'repo'));
    const state = JSON.parse(execFileSync(process.execPath, [join(FIXTURES, 'tools/at26-state.ts'), dataDir, repo], { encoding: 'utf8' })) as { projectId: string; runs: string[]; keepForever: string; roundBase: string };
    expect(state.runs).toHaveLength(21);
    const engine = await connectEngine({ dataDir });
    try {
      // Sound after opening: the boot's integrity_check passed, and every evidence file still has its hash.
      const health = await engine.waitForEvent('engine.health');
      expect(health.payload).toMatchObject({ state: 'ready', reason: null });
      expect(statSync(dataDir).mode & 0o777).toBe(0o700);
      for (const d of ['evidence', 'snapshots', 'baselines', 'tmp', 'backups']) expect(statSync(join(dataDir, d)).mode & 0o777, d).toBe(0o700);
      const evidence = query<{ id: string }>(dataDir, 'SELECT id FROM evidence');
      expect(evidence).toHaveLength(21);
      for (const e of evidence) {
        const t = ok<{ token: string }>(await engine.invoke('evidence.token', { evidenceId: e.id }));
        expect(ok<{ sha256: string }>(await engine.invoke('internal.evidencePath', { token: t.token })).sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      const before = ok<RunList>(await engine.invoke('runs.list', { projectId: state.projectId }));
      expect(before.runs).toHaveLength(21);
      expect(before.retainRuns).toBe(20);

      // Retention at 20: the 21st run is the one kept forever, so nothing goes.
      ok(await engine.invoke('settings.set', { key: 'evidence.retainRuns', value: 20 }));
      expect(ok<RunList>(await engine.invoke('runs.list', { projectId: state.projectId })).runs).toHaveLength(21);
      // At 15: the six oldest are beyond; the pinned one and the round's base stay, four go with their content.
      const blobsBefore = query<{ sha256: string; compressed_size: number }>(dataDir, 'SELECT sha256, compressed_size FROM snapshot_blobs');
      ok(await engine.invoke('settings.set', { key: 'evidence.retainRuns', value: 15 }));
      const after = ok<RunList>(await engine.invoke('runs.list', { projectId: state.projectId }));
      const kept = new Set(after.runs.map((r) => r.runId));
      expect(after.runs).toHaveLength(17);
      expect(kept.has(state.keepForever)).toBe(true);
      expect(kept.has(state.roundBase)).toBe(true);
      for (const gone of [1, 3, 4, 5].map((i) => state.runs[i]!)) {
        expect(kept.has(gone), gone).toBe(false);
        expect(existsSync(join(dataDir, 'evidence', state.projectId, gone))).toBe(false);
      }
      // The content only those runs' snapshots used is collected; the space shown drops by what was freed.
      const blobsAfter = new Set(query<{ sha256: string }>(dataDir, 'SELECT sha256 FROM snapshot_blobs').map((b) => b.sha256));
      const collected = blobsBefore.filter((b) => !blobsAfter.has(b.sha256));
      expect(collected.length).toBeGreaterThan(0);
      for (const b of collected) expect(existsSync(join(dataDir, 'snapshots', 'blobs', b.sha256.slice(0, 2), `${b.sha256}.gz`))).toBe(false);
      const evidenceFreed = 4 * Buffer.byteLength('run 2: ok\n'.repeat(50));
      expect(before.spaceUsedBytes - after.spaceUsedBytes).toBe(evidenceFreed + collected.reduce((a, b) => a + b.compressed_size, 0));
      // Reviews, cards and baselines are not touched by retention.
      expect(query(dataDir, 'SELECT id FROM reviews')).toHaveLength(2);
      expect(query(dataDir, 'SELECT id FROM tasks')).toHaveLength(2);
      expect(readdirSync(join(dataDir, 'baselines', state.projectId))).toHaveLength(2);

      // A second project, moved: «المسار غير موجود», then found again by its identity, with its history.
      const other = materialize('FX-NOISY', 'good', join(root, 'noisy'));
      const added = await addProject(engine, other);
      renameSync(other, join(root, 'noisy-moved'));
      const moved = ok<{ project: { pathStatus: string } }>(await engine.invoke('project.get', { projectId: added.projectId }));
      expect(moved.project.pathStatus).toBe('missing');
      const g = pathGrant('selection', join(root, 'noisy-moved'));
      expect(ok<{ status: string; project: { pathStatus: string } }>(await engine.invoke('project.relocate', { projectId: added.projectId, selectionToken: g.token }, g.grants))).toMatchObject({ status: 'relocated', project: { pathStatus: 'ok' } });

      // Removing the generated project: AYAR's data about it goes; the repository is byte for byte the same.
      const repoBefore = treeHash(repo);
      const c = confirmationGrant('project.remove', state.projectId);
      ok(await engine.invoke('project.remove', { projectId: state.projectId, confirmationToken: c.token }, c.grants));
      expect(existsSync(join(dataDir, 'evidence', state.projectId))).toBe(false);
      expect(query(dataDir, 'SELECT id FROM runs WHERE project_id = ?', state.projectId)).toEqual([]);
      expect(query(dataDir, 'SELECT id FROM snapshots WHERE project_id = ?', state.projectId)).toEqual([]);
      expect(query(dataDir, 'SELECT sha256 FROM snapshot_blobs')).toEqual([]);
      expect(treeHash(repo)).toBe(repoBefore);
    } finally {
      await engine.close();
    }
  }, 120_000);
});
