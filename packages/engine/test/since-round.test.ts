// run.get's sinceRound and the report head's state.sinceRound (protocol 1.6, DEV-11; 13.5, D-31): a later run on the
// state the latest complete round read is «same»; after a change outside the declared outputs it is «changed», which
// the results page and the overview show as the round being «قديم».
import type { RunDetail } from '@ayar/protocol';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addProject, approveAll, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, LOGIN_PATH, ok, tempDir, type EngineConnection } from './support/scan.ts';

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-11-since-'));
  engine = await engineFor(root, { path: LOGIN_PATH });
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

describe('sinceRound', () => {
  it('is «same» on the round’s state and «changed» after an edit outside the declared outputs', async () => {
    const path = join(root, 'project');
    mkdirSync(path);
    writeFileSync(join(path, 'notes.txt'), 'first\n');
    const { projectId } = await addProject(engine, path);
    ok(await engine.invoke('profile.update', { projectId, patch: { custom: { quick: { argv: ['sh', '-c', 'echo ok'], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
    await approveAll(engine, projectId);

    const full = await startRun(engine, (await plan(engine, projectId, { kind: 'full' })).id);
    const fullDetail: RunDetail = await waitRun(engine, full.runId, 120_000);
    expect(fullDetail.sinceRound).toBe('same');

    const again = await startRun(engine, (await plan(engine, projectId, { kind: 'check', instance: 'custom.quick@.' })).id);
    expect((await waitRun(engine, again.runId, 60_000)).sinceRound).toBe('same');

    writeFileSync(join(path, 'notes.txt'), 'changed\n');
    const after = await startRun(engine, (await plan(engine, projectId, { kind: 'check', instance: 'custom.quick@.' })).id);
    expect((await waitRun(engine, after.runId, 60_000)).sinceRound).toBe('changed');
    const report = ok<{ report: { head: { state: { sinceRound?: string } } } }>(await engine.invoke('report.build', { target: { kind: 'run', runId: after.runId }, options: { lang: 'en' } }));
    expect(report.report.head.state.sinceRound).toBe('changed');
  }, 240_000);
});
