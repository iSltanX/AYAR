// AT-15 (FR-32, D-20): flakiness, through the engine on FX-EXT:
// - a Vitest test that alternates is «متذبذب» in beh.stability's repetition mode (5 attempts by default, each a step
//   of one execution, each attempt's report kept as evidence), with the test a finding at its line; it counts for
//   nothing: beh.unit, covered by beh.stability, inherits «متذبذب», and the behaviour section is not «نقي»;
// - a Playwright test that passes after a retry of the project's own configuration is «متذبذب» in beh.e2e;
// - a steady failure with a flaky test beside it is «أخفق», the flakiness an extra finding;
// - the clean variant passes both (the negative control).
import type { ResultsPage, RunDetail } from '@ayar/protocol';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addProject, approveAll, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, execOf, FIXTURES, installDependencies, LOGIN_PATH, materialize, ok, tempDir, toolchainReady, type EngineConnection } from './support/scan.ts';

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  if (!toolchainReady()) return;
  ({ dir: root, cleanup } = tempDir('ayar-DEV-6-at15-'));
  engine = await engineFor(root, { path: LOGIN_PATH });
}, 60_000);
afterAll(async () => {
  await engine?.close();
  cleanup?.();
});

async function scan(path: string, groups: string[][]): Promise<{ projectId: string; runs: RunDetail[] }> {
  installDependencies(path);
  const { projectId } = await addProject(engine, path);
  const checks = Object.fromEntries(groups.flat().filter((i) => !i.startsWith('section:')).map((i) => [i, { included: true }]));
  ok(await engine.invoke('profile.update', { projectId, patch: { checks } }));
  await approveAll(engine, projectId);
  const runs: RunDetail[] = [];
  for (const g of groups) {
    const p = await plan(engine, projectId, g.length === 1 && g[0] === 'section:behavior' ? { kind: 'section', section: 'behavior' } : { kind: 'group', instances: g });
    runs.push(await waitRun(engine, (await startRun(engine, p.id)).runId, 600_000));
  }
  return { projectId, runs };
}

const findings = async (projectId: string, runId: string) => ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId } })).findings;

describe.runIf(toolchainReady())('AT-15: flakiness', () => {
  it('Vitest in the repetition mode: «متذبذب», counted for nothing; beside a steady failure: «أخفق» with the flakiness a finding', async () => {
    const { projectId, runs } = await scan(materialize('FX-EXT', 'flaky-vitest', join(root, 'flaky-vitest')), [['beh.stability@.'], ['section:behavior']]);
    const stab = execOf(runs[0]!, 'beh.stability@.');
    expect(stab).toMatchObject({ outcome: 'flaky', outcomeReason: { key: 'verdict.reason.flaky' } });
    // Five attempts, one execution: each attempt's end and its report kept.
    expect(stab.raw?.steps?.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(stab.evidence.filter((e) => /reports\/\d\/vitest\.json$/.test(e.relPath))).toHaveLength(5);
    const f = (await findings(projectId, runs[0]!.run.runId)).find((x) => x.ruleId === 'test.flaky')!;
    expect(f).toMatchObject({ location: { path: 'src/lib/flaky.test.ts', line: 19 }, proof: 'proven' });
    // In the section (beh.stability included): beh.unit inherits «متذبذب» and gets no credit (D-20).
    const section = runs[1]!;
    expect(execOf(section, 'beh.unit@.')).toMatchObject({ outcome: 'flaky', coveredByCheckRunId: execOf(section, 'beh.stability@.').checkRunId });
    expect(section.purity?.checks.find((c) => c.instance === 'beh.unit@.')).toMatchObject({ outcome: 'flaky', credit: 0 });
    expect(section.purity?.incompleteReasons.map((r) => r.key)).toContain('purity.reason.flaky');

    // A steady failure with the flaky test beside it: «أخفق», and the flakiness is still a finding.
    const both = materialize('FX-EXT', 'failing-test', join(root, 'failing-and-flaky'));
    copyFileSync(join(FIXTURES, 'FX-EXT/variants/flaky-vitest/overlay/src/lib/flaky.test.ts'), join(both, 'src/lib/flaky.test.ts'));
    const b = await scan(both, [['beh.stability@.']]);
    expect(execOf(b.runs[0]!, 'beh.stability@.')).toMatchObject({ outcome: 'failed', origin: 'project' });
    const fs2 = await findings(b.projectId, b.runs[0]!.run.runId);
    expect(fs2.some((x) => x.ruleId === 'test.flaky')).toBe(true);
    expect(fs2.some((x) => x.ruleId === 'test.failed' && x.effect === 'violation')).toBe(true);
  }, 900_000);

  it('Playwright retries of the project: «متذبذب» in beh.e2e; the clean variant passes both', async () => {
    const flaky = await scan(materialize('FX-EXT', 'flaky-playwright', join(root, 'flaky-playwright')), [['code.build@.'], ['beh.e2e@.']]);
    expect(execOf(flaky.runs[1]!, 'beh.e2e@.')).toMatchObject({ outcome: 'flaky' });
    const f = (await findings(flaky.projectId, flaky.runs[1]!.run.runId)).find((x) => x.ruleId === 'test.flaky')!;
    expect(f).toMatchObject({ location: { path: 'e2e/flaky.spec.ts', line: 4 } });

    const good = await scan(materialize('FX-EXT', 'good', join(root, 'good')), [['code.build@.'], ['beh.e2e@.'], ['beh.stability@.']]);
    expect(execOf(good.runs[1]!, 'beh.e2e@.')).toMatchObject({ outcome: 'passed' });
    expect(execOf(good.runs[2]!, 'beh.stability@.')).toMatchObject({ outcome: 'passed' });
  }, 900_000);
});
