// node:test (C-15): `node --test` with a JUnit reporter into the reports folder beside the project's own reporter on
// the output. Node pairs reporters and destinations by order and refuses a mismatch, so the flags complete the
// pairs the command already has: a lone reporter gets `stdout`, then the JUnit pair is added (E-07: supported by the
// Node versions found). Exit 0 with no test run is «ناقص» (7.3 rule 3); a failing test exits 1.
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, firstErrorLine, locateTest, oversize, projectTemplate, reason, reportMissing, unknownExit, type Adapter, type ExitInfo, type ParseContext } from '../framework.ts';
import { readJUnit } from '../read/junit.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';
import { fillTests, isSnapshotMissing, repeatedExit, testsExit, type Attempt } from './tests-common.ts';
import { repeatsOf } from './vitest.ts';

const count = (args: readonly string[], flag: string) => args.filter((a) => a === flag || a.startsWith(`${flag}=`)).length;

/** The flags that add the JUnit reporter, pairing what the command has; null when its pairs cannot be completed. */
export function junitFlags(args: readonly string[]): string[] | null {
  const reporters = count(args, '--test-reporter');
  const destinations = count(args, '--test-reporter-destination');
  const junit = ['--test-reporter=junit', '--test-reporter-destination={reports}/junit.xml'];
  if (reporters === 0 && destinations === 0) return ['--test-reporter=spec', '--test-reporter-destination=stdout', ...junit];
  if (reporters === destinations) return junit;
  if (reporters === 1 && destinations === 0) return ['--test-reporter-destination=stdout', ...junit];
  return null;
}

export const nodeTest: Adapter = {
  id: 'node-test',
  tool: 'node',
  version: '1.0.0',
  tested: '>=20.0.0 <27.0.0',
  limitsKey: 'adapter.limits.tests',
  sources: ['S-08'],
  recognizes: (program) => program === 'node-test',
  template(spec) {
    return projectTemplate(this, spec, (args) => {
      const f = junitFlags(args);
      return { args: f ?? [], reports: f ? ['junit.xml'] : [], repeat: repeatsOf(spec) };
    });
  },
  parseReports(ctx: ParseContext, exit: ExitInfo): ParsedReport {
    const r = emptyReport(this, ['junit-xml']);
    const attempts: Attempt[] = [];
    const perStep: { total: number; failed: number }[] = [];
    for (let n = 1; n <= Math.max(1, exit.steps.length); n++) {
      const f = filesNamed(ctx, 'junit.xml').find((x) => x.step === n);
      if (!f) {
        r.problems.push(reportMissing(this, 'junit.xml'));
        continue;
      }
      const big = oversize(f);
      if (big) {
        r.problems.push(big);
        continue;
      }
      const x = readJUnit(f.text!, f.name);
      if (!x.ok) {
        r.problems.push(x.problem);
        continue;
      }
      const attempt: Attempt = { tests: [], collectionErrors: [] };
      for (const c of x.value.cases) {
        const p = c.file ? normalizePath(c.file, ctx.root, ctx.cwd) : { path: null, outside: false };
        const line = c.line ?? (p.path && !p.outside ? locateTest(ctx.read(p.path), c.name, false) : null);
        attempt.tests.push({
          fullName: [p.path ?? '', ...c.suites, c.name].filter(Boolean).join(' › '),
          status: c.status === 'passed' ? 'passed' : c.status === 'skipped' ? 'skipped' : 'failed',
          location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}) },
          message: c.message || c.detail,
          snapshotMissing: isSnapshotMissing(c.detail),
        });
      }
      perStep.push({ total: attempt.tests.length, failed: attempt.tests.filter((t) => t.status === 'failed').length });
      attempts.push(attempt);
    }
    if (attempts.length) fillTests(r, attempts);
    r.info.perStep = perStep;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (report.problems.length) return { kind: 'ok' };
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    if (codes.some((c) => c !== 0 && c !== 1)) return unknownExit(this, codes.find((c) => c !== 0 && c !== 1) ?? null);
    const per = (report.info.perStep as { total: number; failed: number }[] | undefined) ?? [];
    for (const [i, p] of per.entries()) {
      if (codes[i] === 0 && p.failed > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'node:test', exit: 0, failed: p.failed }) };
      if (codes[i] === 1 && p.failed === 0 && p.total > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'node:test', exit: 1 }) };
      // Exit 1 with no test case: a test file that does not load is reported as a failing case by node:test; a
      // run that ends with nothing at all is the tool's.
      if (codes[i] === 1 && p.total === 0) return { kind: 'tool_error', reason: reason('adapter.reason.stoppedBeforeTests', { tool: 'node:test', detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    }
    const repeated = repeatedExit(codes.length, report.tests, 'node:test');
    if (repeated) return repeated;
    return testsExit({ exitCode: codes.includes(1) ? 1 : 0, tests: report.tests, okCodes: [0], failCodes: [1], noInputs: report.tests?.total === 0, tool: 'node:test' }) ?? unknownExit(this, exit.exitCode);
  },
  liveParser(line) {
    const l = stripAnsi(line);
    const m = /^\s*(✔|✖)\s+(.+?)(?:\s+\([\d.]+ms\))?$/.exec(l);
    if (!m) return null;
    return m[1] === '✔' ? { testsSeen: 1 } : { testsSeen: 1, provisional: { rule: 'test.failed', title: m[2]!.slice(0, 300), location: null } };
  },
};
