// AT-39 (FR-31, FR-32), the functional part, and the report rows of AT-14, on FX-REPORTS through the engine: every
// damaged report — a corrupt JUnit, an incomplete SARIF, a JSON nested beyond the limit, a report over 50 MB, exit 0
// with a failure in the report — ends «تعذّر» with its own reason and the tool as its origin, never a pass; the
// sound ones pass. Each report reaches the engine the way a tool would leave it: a stand-in for the tool (Vitest,
// ESLint) on the project's own node_modules/.bin writes the recorded report where the adapter's flags ask and exits
// with the recorded code; JUnit and SARIF arrive through a custom check that declares its report (10.3). Meanwhile
// the engine keeps answering: the longest answer to a request while the reports are read is measured and printed
// (the numeric limit is E-14's calibrated UI-response target, DEV-13: 100 ms, NFR-01).
import type { ResultsPage } from '@ayar/protocol';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addProject, approveAll, plan, startRun, waitRun } from '../../../tools/cli/test/support/fixtures.ts';
import { engineFor, FIXTURES, materialize, ok, PNPM, tempDir, type EngineConnection } from './support/scan.ts';

/** NFR-01's UI response target as calibrated in E-14 (docs/tracking/env-decisions.md, DEV-13). */
const UI_RESPONSE_MS = 100;

let root: string;
let cleanup: () => void;
let engine: EngineConnection;
beforeAll(async () => {
  ({ dir: root, cleanup } = tempDir('ayar-DEV-6-at39-'));
  engine = await engineFor(root);
}, 60_000);
afterAll(async () => {
  await engine?.close();
  if (process.env.AYAR_KEEP_TMP) console.log(root);
  else cleanup?.();
});

/** A stand-in for a tool: copies the recorded report to where the flags ask, prints a line, exits with the code. */
function stub(dir: string, tool: 'vitest' | 'eslint', report: string, code: number): void {
  const bin = join(dir, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  const find = tool === 'vitest' ? "const a = process.argv.find((x) => x.startsWith('--outputFile.json=')); const out = a && a.slice(a.indexOf('=') + 1); const j = process.argv.find((x) => x.startsWith('--outputFile.junit=')); if (j) fs.writeFileSync(j.slice(j.indexOf('=') + 1), '<testsuites></testsuites>');" : "const i = process.argv.indexOf('-o'); const out = i > 0 ? process.argv[i + 1] : null;";
  writeFileSync(join(bin, tool), `#!/usr/bin/env node\nconst fs = require('fs');\n${find}\nif (out) fs.copyFileSync(${JSON.stringify(report)}, out);\nconsole.log('${tool} (stand-in): ' + (out ? 'report written' : 'no report flag'));\nprocess.exit(${code});\n`);
  chmodSync(join(bin, tool), 0o755);
}

/** A small project whose test or lint script is the tool, with the stand-in in place of the real one. */
function project(name: string, tool: 'vitest' | 'eslint', report: string, code: number): string {
  const dir = join(root, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  const scripts = tool === 'vitest' ? { test: 'vitest run' } : { lint: 'eslint src' };
  // npm: it runs the script with node_modules/.bin first on PATH and installs nothing on its own.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', private: true, scripts, devDependencies: { [tool]: tool === 'vitest' ? '5.0.3' : '10.12.0' } }, null, 2));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ name, lockfileVersion: 3, requires: true, packages: {} }, null, 2));
  writeFileSync(join(dir, 'src', 'add.js'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(join(dir, 'test', 'add.test.js'), "import { it } from 'vitest';\nit('adds', () => {});\n");
  if (tool === 'eslint') writeFileSync(join(dir, 'eslint.config.js'), 'export default [];\n');
  stub(dir, tool, report, code);
  return dir;
}

async function scan(path: string, instances: string[], patch?: Record<string, unknown>): Promise<{ detail: Awaited<ReturnType<typeof waitRun>>; results: ResultsPage }> {
  const { projectId } = await addProject(engine, path);
  if (patch) ok(await engine.invoke('profile.update', { projectId, patch }));
  await approveAll(engine, projectId);
  const p = await plan(engine, projectId, { kind: 'group', instances });
  const detail = await waitRun(engine, (await startRun(engine, p.id)).runId, 180_000);
  const results = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: detail.run.runId, includeExcluded: true } }));
  return { detail, results };
}

/** FX-REPORTS's recorded reports of a variant (the oversize one generated at test time, never committed). */
function reportsOf(variant: string): string {
  const dir = materialize('FX-REPORTS', variant, join(root, `FX-REPORTS-${variant}`));
  if (variant === 'oversize') execFileSync(process.execPath, [join(FIXTURES, 'FX-REPORTS/tools/gen-oversize.mjs'), '--out', dir], { stdio: 'pipe' });
  return join(dir, 'reports');
}

describe('AT-39 (engine) and the report rows of AT-14', () => {
  it.runIf(existsSync(PNPM))('a damaged report is «تعذّر» with its reason and the tool as its origin; a sound one passes; the engine keeps answering', async () => {
    const good = reportsOf('good');
    const cases = [
      { name: 'good-vitest', tool: 'vitest' as const, report: join(good, 'vitest.json'), code: 0, instance: 'beh.unit@.', outcome: 'passed', reason: 'verdict.reason.testsPassed' },
      { name: 'good-eslint', tool: 'eslint' as const, report: join(good, 'eslint.json'), code: 0, instance: 'code.lint@.', outcome: 'passed', reason: 'verdict.reason.passed' },
      { name: 'exit0-with-failures', tool: 'vitest' as const, report: join(reportsOf('exit0-with-failures'), 'vitest.json'), code: 0, instance: 'beh.unit@.', outcome: 'unavailable', reason: 'adapter.reason.conflictExitPass' },
      { name: 'json-too-deep', tool: 'eslint' as const, report: join(reportsOf('json-too-deep'), 'eslint.json'), code: 0, instance: 'code.lint@.', outcome: 'unavailable', reason: 'verdict.reason.report.tooDeep' },
      { name: 'oversize', tool: 'vitest' as const, report: join(reportsOf('oversize'), 'vitest.json'), code: 0, instance: 'beh.unit@.', outcome: 'unavailable', reason: 'verdict.reason.report.tooLarge' },
    ];
    // The longest wait for an answer while the runs go on (a request every 50 ms).
    let worst = 0;
    let pinging = true;
    const pinger = (async () => {
      while (pinging) {
        const t0 = performance.now();
        await engine.invoke('settings.get', { keys: ['ui.language'] });
        worst = Math.max(worst, performance.now() - t0);
        await new Promise((r) => setTimeout(r, 50));
      }
    })();
    try {
      for (const c of cases) {
        const { detail, results } = await scan(project(c.name, c.tool, c.report, c.code), [c.instance]);
        const x = detail.checks.find((k) => k.instance === c.instance)!;
        expect({ case: c.name, outcome: x.outcome, reason: x.outcomeReason?.key }).toEqual({ case: c.name, outcome: c.outcome, reason: c.reason });
        if (c.outcome === 'unavailable') expect(x.origin, c.name).toBe('tool');
        if (c.outcome === 'passed') expect(results.findings.filter((f) => f.effect !== 'note'), c.name).toEqual([]);
        // The report over the limit was not read, and not kept: its size was (C-15).
        if (c.name === 'oversize') expect(x.evidence.find((e) => e.relPath.endsWith('reports/vitest.json'))).toMatchObject({ truncated: true });
      }
      // JUnit and SARIF, through a custom check that declares its report: corrupt and incomplete are «تعذّر».
      const custom = (report: string, file: string) => ({ argv: ['cp', report, `{reports}/${file}`], cwd: '.', timeoutMin: 1, success: { exitCode: 0, report: file } });
      const dir = project('custom-reports', 'vitest', join(good, 'vitest.json'), 0);
      const { detail } = await scan(dir, ['custom.junitgood@.', 'custom.junitbad@.', 'custom.sarifgood@.', 'custom.sarifbad@.'], {
        custom: {
          junitgood: custom(join(good, 'pytest.junit.xml'), 'junit.xml'),
          junitbad: custom(join(reportsOf('junit-corrupt'), 'pytest.junit.xml'), 'junit.xml'),
          sarifgood: custom(join(good, 'semgrep.sarif'), 'semgrep.sarif'),
          sarifbad: custom(join(reportsOf('sarif-incomplete'), 'semgrep.sarif'), 'semgrep.sarif'),
        },
      });
      const by = (i: string) => detail.checks.find((k) => k.instance === i)!;
      expect(by('custom.junitgood@.')).toMatchObject({ outcome: 'passed' });
      expect(by('custom.junitbad@.')).toMatchObject({ outcome: 'unavailable', origin: 'tool', outcomeReason: { key: 'verdict.reason.report.malformed' } });
      expect(by('custom.sarifgood@.')).toMatchObject({ outcome: 'passed' });
      expect(by('custom.sarifbad@.')).toMatchObject({ outcome: 'unavailable', origin: 'tool' });
      expect(by('custom.sarifbad@.').outcomeReason?.key).toMatch(/^verdict\.reason\.report\.(incomplete|unsupported)$/);
    } finally {
      pinging = false;
      await pinger;
    }
    console.log(`AT-39 (functional): the longest answer while the reports were read: ${Math.round(worst)} ms`);
    // E-14 (DEV-13): the engine answers within NFR-01's UI-response target while the damaged reports are read.
    expect(worst).toBeLessThan(UI_RESPONSE_MS);
  }, 600_000);
});

