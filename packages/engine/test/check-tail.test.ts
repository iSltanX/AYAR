// check.tail (protocol 1.6, D-DEV11-03): the live row's «ذيل السجل» (9.6 point 3). While a check runs, its last
// lines come from the executor's redacted counters (never the log file's path); after it, from its raw result. A
// secret printed by the check reaches the tail already redacted; an unknown execution is not_found.
import type { CheckRunView, RunDetail } from '@ayar/protocol';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addProject, approveAll, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, LOGIN_PATH, ok, tempDir, type EngineConnection } from './support/scan.ts';

type Tail = { lines: string[]; totalLines: number; live: boolean };

// A synthetic token of the GitHub shape (C-18 layer 2), printed by the check itself.
const SECRET = `ghp_${'A1b2C3d4E5'.repeat(3)}abcdef`;

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-11-tail-'));
  engine = await engineFor(root, { path: LOGIN_PATH });
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

describe('check.tail', () => {
  it('reads the running check’s redacted last lines, then the finished one’s from its raw result', async () => {
    // A folder with no ecosystem: nothing to install, so the custom check is ready at once.
    const path = join(root, 'project');
    mkdirSync(path);
    writeFileSync(join(path, 'notes.txt'), 'a plain folder\n');
    const { projectId } = await addProject(engine, path);
    // The profile refuses a secret in a command (C-18), so the shell builds it at run time from short pieces.
    const script = `s=$(printf 'A1b2C3d4E5%.0s' 1 2 3); for i in 1 2 3 4 5 6; do echo tail-line-$i; [ $i = 2 ] && echo token gh"p_"$s"abcdef"; [ $i = 3 ] && printf '%30000s\\n' '' | tr ' ' y; sleep 0.4; done`;
    ok(await engine.invoke('profile.update', { projectId, patch: { custom: { slow: { argv: ['sh', '-c', script], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } } }));
    await approveAll(engine, projectId);
    const p = await plan(engine, projectId, { kind: 'check', instance: 'custom.slow@.' });
    const run = await startRun(engine, p.id);
    const running = await engine.waitForEvent('check.state', (e) => (e.payload as CheckRunView).instance === 'custom.slow@.' && (e.payload as CheckRunView).state === 'running', 30_000);
    const checkRunId = (running.payload as CheckRunView).checkRunId;

    let live: Tail | null = null;
    for (let i = 0; i < 60 && !live; i++) {
      const t = ok<Tail>(await engine.invoke('check.tail', { checkRunId }));
      if (t.live && t.lines.includes('tail-line-3')) live = t;
      else await new Promise((r) => setTimeout(r, 100));
    }
    expect(live).not.toBeNull();
    expect(live!.lines.slice(0, 2)).toEqual(['tail-line-1', 'tail-line-2']);
    expect(live!.lines.join('\n')).not.toContain(SECRET);
    expect(live!.lines.find((l) => l.startsWith('token '))).toMatch(/⟦redacted:/);
    expect(live!.totalLines).toBeGreaterThanOrEqual(4);
    // AT-29: the 30,000-character line arrives cut to the contract's 20,000, marked, and the call does not fail.
    const long = ok<Tail>(await engine.invoke('check.tail', { checkRunId })).lines.find((l) => l.startsWith('yyy'));
    if (long) expect([long.length, long.endsWith('…')]).toEqual([20_000, true]);

    const limited = ok<Tail>(await engine.invoke('check.tail', { checkRunId, maxLines: 1 }));
    expect(limited.lines).toHaveLength(1);

    const detail: RunDetail = await waitRun(engine, run.runId, 60_000);
    expect(detail.checks.find((c) => c.checkRunId === checkRunId)?.outcome).toBe('passed');
    const after = ok<Tail>(await engine.invoke('check.tail', { checkRunId }));
    expect(after.live).toBe(false);
    expect(after.lines.filter((l) => l.startsWith('tail-line-'))).toEqual(['tail-line-1', 'tail-line-2', 'tail-line-3', 'tail-line-4', 'tail-line-5', 'tail-line-6']);
    expect(after.lines.join('\n')).not.toContain(SECRET);
    expect(after.lines.find((l) => l.startsWith('yyy'))).toMatch(/^y{19999}…$/);

    const missing = await engine.invoke('check.tail', { checkRunId: 'chk_missing' });
    expect(missing).toMatchObject({ ok: false, error: { code: 'not_found' } });
  }, 120_000);
});
