// Vitest 5 (C-15): `vitest run --reporter=default --reporter=json --reporter=junit --outputFile.json=<r>/vitest.json
// --outputFile.junit=<r>/junit.xml --update=none` — the reports outside the project, no snapshot written (E-12).
// Exit 0 passes, 1 is failures or «No test files found» (told apart by the report and the message), and a run that
// stopped before any test (an environment that does not load) is the tool's. Vitest records no flakiness: the
// repetitions of beh.stability show it (D-20).
import type { ExitSignal, FindingLocation, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, firstErrorLine, locateTest, oversize, projectTemplate, reason, reportMissing, unknownExit, type Adapter, type ExitInfo, type ParseContext, type SpecInput } from '../framework.ts';
import { arr, int, readJson, rec, str } from '../read/guards.ts';
import { readJUnit } from '../read/junit.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';
import { fillTests, isSnapshotMissing, repeatedExit, testsExit, type Attempt } from './tests-common.ts';

export function repeatsOf(spec: SpecInput): number {
  if (spec.checkId !== 'beh.stability') return 1;
  const n = Number(spec.thresholds?.repeats);
  return Number.isInteger(n) && n >= 2 && n <= 50 ? n : 5;
}

function locate(ctx: ParseContext, file: string, title: string, line: number | undefined): FindingLocation {
  const p = normalizePath(file, ctx.root, ctx.cwd);
  const at = line ?? (p.path && !p.outside ? locateTest(ctx.read(p.path), title, false) : null) ?? undefined;
  return { path: p.path, ...(p.outside ? { outside: true } : {}), ...(at ? { line: at } : {}) };
}

export const vitest: Adapter = {
  id: 'vitest',
  tool: 'vitest',
  version: '1.0.0',
  tested: '>=5.0.0 <6.0.0',
  limitsKey: 'adapter.limits.tests',
  sources: ['S-24', 'S-51'],
  packageName: 'vitest',
  recognizes: (program) => program === 'vitest',
  template(spec) {
    return projectTemplate(this, spec, (args) => ({
      args: [...(args.includes('run') || args.includes('--run') ? [] : ['--run']), '--reporter=default', '--reporter=json', '--reporter=junit', '--outputFile.json={reports}/vitest.json', '--outputFile.junit={reports}/junit.xml', '--update=none'],
      reports: ['vitest.json', 'junit.xml'],
      repeat: repeatsOf(spec),
    }));
  },
  parseReports(ctx: ParseContext, exit: ExitInfo): ParsedReport {
    const r = emptyReport(this, ['vitest-json', 'junit-xml']);
    const out = stripAnsi(`${ctx.stdout}\n${ctx.stderr}`);
    r.signals.noInputs = /No test files found/.test(out);
    const attempts: Attempt[] = [];
    const perStep: { total: number; failed: number }[] = [];
    const steps = Math.max(1, exit.steps.length);
    for (let n = 1; n <= steps; n++) {
      const json = filesNamed(ctx, 'vitest.json').find((f) => f.step === n);
      const junit = filesNamed(ctx, 'junit.xml').find((f) => f.step === n);
      if (!json) {
        if (!r.signals.noInputs) r.problems.push(reportMissing(this, 'vitest.json'));
        continue;
      }
      const big = oversize(json);
      if (big) {
        r.problems.push(big);
        continue;
      }
      const j = readJson(json.text!, json.name);
      if (!j.ok) {
        r.problems.push(j.problem);
        continue;
      }
      const attempt: Attempt = { tests: [], collectionErrors: [] };
      for (const file of arr(rec(j.value).testResults)) {
        const f = rec(file);
        const name = str(f.name);
        const results = arr(f.assertionResults);
        for (const a of results.map(rec)) {
          const title = str(a.title);
          const fullName = [...arr(a.ancestorTitles).map((x) => str(x)), title].filter(Boolean).join(' › ');
          const status = str(a.status);
          const message = arr(a.failureMessages).map((m) => str(m)).join('\n');
          attempt.tests.push({
            fullName: `${normalizePath(name, ctx.root, ctx.cwd).path ?? name} › ${fullName}`,
            status: status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'skipped',
            location: locate(ctx, name, title, int(rec(a.location).line)),
            message,
            snapshotMissing: status === 'failed' && isSnapshotMissing(message),
          });
        }
        // A file that failed with no test of its own did not load (a syntax or import error).
        if (str(f.status) === 'failed' && !results.length) attempt.collectionErrors.push({ message: str(f.message) || 'the test file failed to load', location: locate(ctx, name, '', undefined) });
      }
      // Errors Vitest caught outside any test («Unhandled Errors») are in the JUnit report alone.
      if (junit && !oversize(junit)) {
        const x = readJUnit(junit.text!, junit.name);
        if (x.ok) for (const c of x.value.cases.filter((k) => k.classname === 'vitest unhandled errors')) attempt.collectionErrors.push({ message: c.message, location: null });
      }
      const failed = attempt.tests.filter((t) => t.status === 'failed').length + attempt.collectionErrors.length;
      perStep.push({ total: attempt.tests.length, failed });
      attempts.push(attempt);
    }
    if (attempts.length) fillTests(r, attempts);
    r.info.perStep = perStep;
    if (!attempts.length && r.signals.noInputs) r.tests = { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, flaky: 0 };
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (report.signals.noInputs) return { kind: 'missing', reason: reason('adapter.reason.noTestFiles', { tool: 'vitest' }) };
    if (report.problems.length) return { kind: 'ok' };
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    if (codes.some((c) => c !== 0 && c !== 1)) return unknownExit(this, codes.find((c) => c !== 0 && c !== 1) ?? null);
    // Each attempt's exit agrees with its own report (7.3 rule 5).
    const per = (report.info.perStep as { total: number; failed: number }[] | undefined) ?? [];
    for (const [i, p] of per.entries()) {
      if (codes[i] === 0 && p.failed > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'vitest', exit: 0, failed: p.failed }) };
      if (codes[i] === 1 && p.failed === 0 && p.total > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'vitest', exit: 1 }) };
      if (codes[i] === 1 && p.total === 0 && p.failed > 0) return { kind: 'tool_error', reason: reason('adapter.reason.stoppedBeforeTests', { tool: 'vitest', detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
      if (codes[i] === 1 && p.total === 0) return { kind: 'tool_error', reason: reason('adapter.reason.stoppedBeforeTests', { tool: 'vitest', detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    }
    const repeated = repeatedExit(codes.length, report.tests, 'vitest');
    if (repeated) return repeated;
    return testsExit({ exitCode: codes.includes(1) ? 1 : 0, tests: report.tests, okCodes: [0], failCodes: [1], noInputs: false, tool: 'vitest' }) ?? unknownExit(this, exit.exitCode);
  },
  liveParser(line) {
    const l = stripAnsi(line);
    const m = /^\s*(✓|×|✗)\s+(.+?)(?:\s+\d+ms)?$/.exec(l);
    if (!m) return null;
    return m[1] === '✓' ? { testsSeen: 1 } : { testsSeen: 1, provisional: { rule: 'test.failed', title: m[2]!.slice(0, 300), location: null } };
  },
};
