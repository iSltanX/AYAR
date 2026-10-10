// AT-12 (FR-24), through tools/cli on FX-PROC: a hanging check ends at its timeout by the escalation, «انتهت
// المهلة» with its last activity and its last 200 lines kept; an idle timeout ends a silent check that is doing
// nothing, «خمول», and never a silent check that is busy computing. The three run at once, each in its own engine.
// The timeout is a minute, the smallest unit the profile has (7.4 «المهلة: دقائق»); AT-12 names 30 s [D-DEV5-10].
import type { RunDetail } from '@ayar/protocol';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProject, approveAll, check, connectEngine, ledgerTokens, loginShell, materialize, ok, plan, processesWithTokens, startRun, tempDir, waitRun } from './support/fixtures.ts';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempDir('ayar-DEV-5-at12-')));
afterEach(() => cleanup());

const PATH = '/opt/homebrew/bin:/usr/bin:/bin';

async function scenario(name: string, variant: string, patch: Record<string, unknown>, instances: string[]): Promise<{ detail: RunDetail; dataDir: string }> {
  const project = materialize('FX-PROC', variant, join(root, name));
  const dataDir = join(root, `AYAR-${name}`);
  const engine = await connectEngine({ dataDir, env: { AYAR_TEST_LOGIN_SHELL: loginShell(root, { path: PATH }) } });
  try {
    await engine.waitForEvent('engine.health');
    const { projectId } = await addProject(engine, project);
    ok(await engine.invoke('profile.update', { projectId, patch }));
    await approveAll(engine, projectId);
    const p = await plan(engine, projectId, { kind: 'group', instances });
    const run = await startRun(engine, p.id);
    return { detail: await waitRun(engine, run.runId, 180_000), dataDir };
  } finally {
    await engine.close();
  }
}

describe('AT-12: the timeout and the idle timeout', () => {
  it('ends the hanging check at its timeout, the idle one for idling, and lets the busy silent one finish', async () => {
    const lines = "for (let i = 0; i < 500; i++) console.log('line ' + i); setInterval(() => {}, 1000);";
    const [hanging, idle, busy] = await Promise.all([
      scenario('hanging', 'hanging-test', { checks: { 'beh.unit@.': { timeoutMin: 1 } }, custom: { lines: { argv: ['node', '-e', lines], cwd: '.', timeoutMin: 1, success: { exitCode: 0 } } } }, ['beh.unit@.', 'custom.lines@.']),
      scenario('idle', 'idle-silent', { checks: { 'beh.unit@.': { idleTimeoutSec: 20, explicitEnv: { FX_PROC_SECONDS: '120' } } } }, ['beh.unit@.']),
      scenario('busy', 'busy-silent', { checks: { 'beh.unit@.': { idleTimeoutSec: 20, explicitEnv: { FX_PROC_SECONDS: '35' } } } }, ['beh.unit@.']),
    ]);

    // The hanging check: «انتهت المهلة» at a minute, ended by the escalation, its last activity kept.
    const h = check(hanging.detail, 'beh.unit@.');
    expect(h).toMatchObject({ outcome: 'timed_out', outcomeReason: { key: 'run.reason.timeout', params: { minutes: 1 } } });
    expect(h.durationMs).toBeGreaterThanOrEqual(60_000);
    expect(h.durationMs).toBeLessThan(80_000);
    expect(h.raw?.ended).toBe('timed_out');
    expect(h.raw?.lastActivityAt).not.toBeNull();
    const metaRef = h.evidence.find((x) => x.relPath.endsWith('meta.json'))!;
    const meta = JSON.parse(readFileSync(join(hanging.dataDir, 'evidence', metaRef.relPath), 'utf8')) as { escalation: { signal: string }[] };
    expect(meta.escalation[0]?.signal).toBe('SIGINT');
    // Its last 200 lines are kept (a check that wrote 500, then hung).
    const l = check(hanging.detail, 'custom.lines@.');
    expect(l.outcome).toBe('timed_out');
    expect(l.raw?.tail).toHaveLength(200);
    expect(l.raw?.tail.at(-1)).toBe('line 499');
    expect(l.raw?.tail[0]).toBe('line 300');

    // The silent, idle check: ended for idling, long before its timeout.
    const i = check(idle.detail, 'beh.unit@.');
    expect(i).toMatchObject({ outcome: 'timed_out', outcomeReason: { key: 'run.reason.idle', params: { seconds: 20 } } });
    expect(i.raw?.ended).toBe('idle_timed_out');
    expect(i.durationMs).toBeLessThan(40_000);

    // The silent, busy check: never idle (its processor works), it runs to its end.
    const b = check(busy.detail, 'beh.unit@.');
    expect(b.raw?.ended).toBe('exited');
    expect(b.raw?.exitCode).toBe(0);
    expect(b.durationMs).toBeGreaterThan(30_000);
    expect(b.raw?.resources.maxCpuPercent).toBeGreaterThan(50);

    // Not one process of these checks is left (T12, NFR-02), by their tokens.
    for (const s of [hanging, idle, busy]) expect(processesWithTokens(ledgerTokens(s.dataDir))).toEqual([]);
    console.log(`AT-12: timeout ${h.durationMs} ms (${meta.escalation.map((x) => x.signal).join('→')}), idle ${i.durationMs} ms, busy ${b.durationMs} ms at up to ${b.raw?.resources.maxCpuPercent}% CPU`);
  }, 240_000);
});
