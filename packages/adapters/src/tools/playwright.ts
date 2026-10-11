// Playwright Test 1.6x (C-15): `playwright test --reporter=list,json,junit --update-snapshots=none` with the JSON
// and JUnit files in the reports folder (by their environment variables) and the test artifacts in AYAR's own folder
// (`--output`), so nothing is written into the project; `--update-snapshots=none` is the one mode that writes no
// reference image (S-16, E-12). A test Playwright marks `flaky` (it passed on a retry the project configured) makes
// the check «متذبذب» unless a failure decides first (D-20, AT-15). «No tests found» is «ناقص».
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, firstErrorLine, oversize, projectTemplate, reason, reportMissing, unknownExit, type Adapter, type ExitInfo, type ParseContext } from '../framework.ts';
import { arr, int, readJson, rec, str } from '../read/guards.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';
import { fillTests, isSnapshotMissing, repeatedExit, testsExit, type Attempt, type TestResult } from './tests-common.ts';
import { repeatsOf } from './vitest.ts';
import { posix } from 'node:path';

function walk(suite: Record<string, unknown>, titles: string[], rootDir: string, ctx: ParseContext, out: TestResult[]): void {
  const here = str(suite.title);
  const path = here && !here.endsWith('.js') && !here.endsWith('.ts') && !/\.(m|c)?[jt]sx?$/.test(here) ? [...titles, here] : titles;
  for (const spec of arr(suite.specs).map(rec)) {
    const file = str(spec.file);
    const abs = file ? (posix.isAbsolute(file) ? file : posix.join(rootDir, file)) : '';
    const p = abs ? normalizePath(abs, ctx.root, ctx.cwd) : { path: null, outside: false };
    const line = int(spec.line);
    for (const t of arr(spec.tests).map(rec)) {
      const project = str(t.projectName);
      const status = str(t.status);
      const results = arr(t.results).map(rec);
      const failedResult = results.find((x) => str(x.status) !== 'passed' && str(x.status) !== 'skipped');
      const message = failedResult ? stripAnsi(str(rec(failedResult.error).message)) : '';
      // A failure outside the test's own body (a beforeAll or beforeEach above it that threw or timed out) is shown
      // where it happened; a failure inside the test, at the test (its declaration names it, as the other runners do).
      const at = rec(rec(failedResult?.error).location);
      const atLine = int(at.line);
      const inHook = atLine !== undefined && line !== undefined && atLine < line && str(at.file) !== '' && normalizePath(str(at.file), ctx.root, ctx.cwd).path === p.path;
      out.push({
        fullName: [p.path ?? file, ...path, str(spec.title), project ? `[${project}]` : ''].filter(Boolean).join(' › '),
        status: status === 'expected' ? 'passed' : status === 'flaky' ? 'flaky' : status === 'skipped' ? 'skipped' : 'failed',
        location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(inHook ? { line: atLine } : line ? { line } : {}) },
        message,
        snapshotMissing: status === 'unexpected' && isSnapshotMissing(message),
      });
    }
  }
  for (const s of arr(suite.suites).map(rec)) walk(s, path, rootDir, ctx, out);
}

export const playwright: Adapter = {
  id: 'playwright',
  tool: 'playwright',
  version: '1.0.0',
  tested: '>=1.60.0 <2.0.0',
  limitsKey: 'adapter.limits.tests',
  sources: ['S-16', 'S-19'],
  packageName: '@playwright/test',
  recognizes: (program, args) => program === 'playwright' && args[0] === 'test',
  template(spec) {
    return projectTemplate(this, spec, () => ({
      args: ['--reporter=list,json,junit', '--update-snapshots=none', '--output={tmp}/playwright-output'],
      env: { PLAYWRIGHT_JSON_OUTPUT_FILE: '{reports}/playwright.json', PLAYWRIGHT_JUNIT_OUTPUT_FILE: '{reports}/junit.xml' },
      reports: ['playwright.json', 'junit.xml'],
      repeat: repeatsOf(spec),
    }));
  },
  parseReports(ctx: ParseContext, exit: ExitInfo): ParsedReport {
    const r = emptyReport(this, ['playwright-json']);
    const attempts: Attempt[] = [];
    const perStep: { total: number; failed: number }[] = [];
    for (let n = 1; n <= Math.max(1, exit.steps.length); n++) {
      const f = filesNamed(ctx, 'playwright.json').find((x) => x.step === n);
      if (!f) {
        r.problems.push(reportMissing(this, 'playwright.json'));
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
      const root = rec(j.value);
      const rootDir = str(rec(root.config).rootDir, ctx.cwd);
      const attempt: Attempt = { tests: [], collectionErrors: [] };
      for (const s of arr(root.suites).map(rec)) walk(s, [], rootDir, ctx, attempt.tests);
      // Global errors: «No tests found» is no input; anything else (a test file that does not load) the project's.
      for (const e of arr(root.errors).map(rec)) {
        const msg = stripAnsi(str(e.message));
        if (/No tests found/i.test(msg)) r.signals.noInputs = true;
        else {
          const loc = rec(e.location);
          const p = str(loc.file) ? normalizePath(str(loc.file), ctx.root, ctx.cwd) : null;
          attempt.collectionErrors.push({ message: msg, location: p ? { path: p.path, ...(int(loc.line) ? { line: int(loc.line)! } : {}) } : null });
        }
      }
      perStep.push({ total: attempt.tests.length, failed: attempt.tests.filter((t) => t.status === 'failed').length + attempt.collectionErrors.length });
      attempts.push(attempt);
    }
    if (attempts.length) fillTests(r, attempts);
    r.info.perStep = perStep;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (report.signals.noInputs) return { kind: 'missing', reason: reason('adapter.reason.noTestFiles', { tool: 'playwright' }) };
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    // No report at all: the configuration did not load (a syntax error), before any test.
    if (report.problems.some((p) => p.code === 'missing') && codes.every((c) => c === 1)) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'playwright', code: 1, detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (codes.some((c) => c !== 0 && c !== 1)) return unknownExit(this, codes.find((c) => c !== 0 && c !== 1) ?? null);
    const per = (report.info.perStep as { total: number; failed: number }[] | undefined) ?? [];
    for (const [i, p] of per.entries()) {
      if (codes[i] === 0 && p.failed > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'playwright', exit: 0, failed: p.failed }) };
      if (codes[i] === 1 && p.failed === 0 && p.total > 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'playwright', exit: 1 }) };
    }
    const repeated = repeatedExit(codes.length, report.tests, 'playwright');
    if (repeated) return repeated;
    return testsExit({ exitCode: codes.includes(1) ? 1 : 0, tests: report.tests, okCodes: [0], failCodes: [1], noInputs: false, tool: 'playwright' }) ?? { kind: 'tool_error', reason: reason('adapter.reason.stoppedBeforeTests', { tool: 'playwright', detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
  },
  liveParser(line) {
    const l = stripAnsi(line);
    const m = /^\s*(✓|✘|-)\s+\d+\s+(.+?)(?:\s+\([\d.]+m?s\))?$/.exec(l);
    if (!m) return null;
    return m[1] === '✘' ? { testsSeen: 1, provisional: { rule: 'test.failed', title: m[2]!.slice(0, 300), location: null } } : { testsSeen: 1 };
  },
};
