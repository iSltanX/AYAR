// Jest 30 (C-15): `jest --ci --json --outputFile=<r>/jest.json --testLocationInResults` — `--ci` makes a new
// snapshot a failure instead of writing it (S-25, E-12). Exit 1 is failures or «No tests found» (then no report is
// written: the message tells it apart); a configuration Jest refuses writes no report either: the tool's.
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, firstErrorLine, locateTest, oversize, projectTemplate, reason, reportMissing, unknownExit, type Adapter, type ExitInfo, type ParseContext } from '../framework.ts';
import { arr, int, readJson, rec, str } from '../read/guards.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';
import { fillTests, isSnapshotMissing, repeatedExit, testsExit, type Attempt } from './tests-common.ts';
import { repeatsOf } from './vitest.ts';

export const jest: Adapter = {
  id: 'jest',
  tool: 'jest',
  version: '1.0.0',
  tested: '>=30.0.0 <31.0.0',
  limitsKey: 'adapter.limits.tests',
  sources: ['S-25'],
  packageName: 'jest',
  recognizes: (program) => program === 'jest',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--ci', '--json', '--outputFile={reports}/jest.json', '--testLocationInResults'], reports: ['jest.json'], repeat: repeatsOf(spec) }));
  },
  parseReports(ctx: ParseContext, exit: ExitInfo): ParsedReport {
    const r = emptyReport(this, ['jest-json']);
    r.signals.noInputs = /No tests found/.test(stripAnsi(`${ctx.stdout}\n${ctx.stderr}`));
    const attempts: Attempt[] = [];
    const perStep: { total: number; failed: number }[] = [];
    for (let n = 1; n <= Math.max(1, exit.steps.length); n++) {
      const f = filesNamed(ctx, 'jest.json').find((x) => x.step === n);
      if (!f) {
        if (!r.signals.noInputs) r.problems.push(reportMissing(this, 'jest.json'));
        continue;
      }
      const big = oversize(f);
      if (big) {
        r.problems.push(big);
        continue;
      }
      const j = readJson(f.text!, f.name);
      if (!j.ok) {
        r.problems.push(j.problem);
        continue;
      }
      const attempt: Attempt = { tests: [], collectionErrors: [] };
      for (const file of arr(rec(j.value).testResults).map(rec)) {
        const name = str(file.name);
        const p = normalizePath(name, ctx.root, ctx.cwd);
        const text = p.path && !p.outside ? ctx.read(p.path) : null;
        const results = arr(file.assertionResults).map(rec);
        for (const a of results) {
          const title = str(a.title);
          const status = str(a.status);
          const message = arr(a.failureMessages).map((m) => str(m)).join('\n');
          const line = int(rec(a.location).line) ?? locateTest(text, title, false) ?? undefined;
          attempt.tests.push({
            fullName: `${p.path ?? name} › ${[...arr(a.ancestorTitles).map((x) => str(x)), title].filter(Boolean).join(' › ')}`,
            status: status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'skipped',
            location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}) },
            message,
            snapshotMissing: status === 'failed' && isSnapshotMissing(message),
          });
        }
        // A suite that failed to run (testExecError, or failed with no test of its own).
        if (rec(file).testExecError !== undefined || (str(file.status) === 'failed' && !results.length)) attempt.collectionErrors.push({ message: str(rec(file.testExecError).message) || str(file.message) || 'the test file failed to run', location: { path: p.path } });
      }
      perStep.push({ total: attempt.tests.length, failed: attempt.tests.filter((t) => t.status === 'failed').length + attempt.collectionErrors.length });
      attempts.push(attempt);
    }
    if (attempts.length) fillTests(r, attempts);
    r.info.perStep = perStep;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (report.signals.noInputs) return { kind: 'missing', reason: reason('adapter.reason.noTestFiles', { tool: 'jest' }) };
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    // No report and no «No tests found»: Jest refused its configuration before running anything.
    if (report.problems.some((p) => p.code === 'missing') && codes.every((c) => c === 1)) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'jest', code: 1, detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (codes.some((c) => c !== 0 && c !== 1)) return unknownExit(this, codes.find((c) => c !== 0 && c !== 1) ?? null);
    const per = (report.info.perStep as { total: number; failed: number }[] | undefined) ?? [];
    for (const [i, p] of per.entries()) {
      if (codes[i] === 0 && p.failed > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'jest', exit: 0, failed: p.failed }) };
      if (codes[i] === 1 && p.failed === 0 && p.total > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'jest', exit: 1 }) };
    }
    const repeated = repeatedExit(codes.length, report.tests, 'jest');
    if (repeated) return repeated;
    return testsExit({ exitCode: codes.includes(1) ? 1 : 0, tests: report.tests, okCodes: [0], failCodes: [1], noInputs: false, tool: 'jest' }) ?? { kind: 'tool_error', reason: reason('adapter.reason.stoppedBeforeTests', { tool: 'jest', detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
  },
  liveParser(line) {
    const l = stripAnsi(line);
    if (/^\s*(PASS|FAIL)\s/.test(l)) return { testsSeen: 0 };
    const m = /^\s*(✓|✕)\s+(.+?)(?:\s+\(\d+\s*ms\))?$/.exec(l);
    if (!m) return null;
    return m[1] === '✓' ? { testsSeen: 1 } : { testsSeen: 1, provisional: { rule: 'test.failed', title: m[2]!.slice(0, 300), location: null } };
  },
};
