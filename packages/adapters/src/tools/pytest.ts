// pytest 8 and 9 (C-15): `<python> -m pytest --junit-xml=<r>/junit.xml -p no:cacheprovider` in the project's
// environment (`.venv/bin/python`, or `uv run --no-sync --offline`; E-07) — `-p no:cacheprovider` writes no
// `.pytest_cache`. Exit 0 passes, 1 is failures; 2 is a project failure when the report holds a collection error (an
// import or syntax error in a test file), «أُلغي» when AYAR stopped it (the executor's rule 1), else the tool's; 3
// and 4 are the tool's; 5 is «ناقص: لم تُجمع اختبارات»; 6 (pytest 9.1: too many warnings) is decided by the warnings
// policy (S-26).
import type { ExitSignal, FindingLocation, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, finding, firstErrorLine, locateTest, oversize, projectTemplate, pushFinding, reason, reportMissing, unknownExit, type Adapter, type ExitInfo, type ParseContext } from '../framework.ts';
import { readJUnit } from '../read/junit.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';
import { fillTests, isSnapshotMissing, type Attempt } from './tests-common.ts';
import { repeatsOf } from './vitest.ts';

/** `tests.test_add` (xunit2) → `tests/test_add.py`, or the class's module (`tests.test_x.TestY` → tests/test_x.py). */
function moduleFile(ctx: ParseContext, classname: string): string | null {
  const parts = classname.split('.').filter(Boolean);
  const base = ctx.cwd === ctx.root ? '' : `${normalizePath(ctx.cwd, ctx.root).path ?? ''}/`;
  for (let n = parts.length; n > 0; n--) {
    const rel = `${base}${parts.slice(0, n).join('/')}.py`.replace(/^\/+/, '');
    if (ctx.exists(rel)) return rel;
  }
  return null;
}

/** Where a collection error points (`tests/test_add.py:4`, or `File "…/tests/test_add.py", line 4`). */
function errorLocation(ctx: ParseContext, detail: string, file: string | null): FindingLocation | null {
  if (!file) return null;
  const name = file.split('/').pop()!;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${esc}", line (\\d+)`).exec(detail) ?? new RegExp(`${esc}:(\\d+)`).exec(detail);
  return { path: file, ...(m ? { line: Number(m[1]) } : {}) };
}

export const pytest: Adapter = {
  id: 'pytest',
  tool: 'pytest',
  version: '1.0.0',
  tested: '>=8.0.0 <10.0.0',
  limitsKey: 'adapter.limits.tests',
  sources: ['S-26'],
  packageName: 'pytest',
  recognizes: (program) => program === 'pytest' || program === 'py.test',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--junit-xml={reports}/junit.xml', '-p', 'no:cacheprovider'], reports: ['junit.xml'], repeat: repeatsOf(spec) }));
  },
  parseReports(ctx: ParseContext, exit: ExitInfo): ParsedReport {
    const r = emptyReport(this, ['junit-xml']);
    const out = stripAnsi(`${ctx.stdout}\n${ctx.stderr}`);
    const attempts: Attempt[] = [];
    const perStep: { total: number; failed: number; errors: number }[] = [];
    for (let n = 1; n <= Math.max(1, exit.steps.length); n++) {
      const f = filesNamed(ctx, 'junit.xml').find((x) => x.step === n);
      const code = exit.steps.find((s) => s.n === n)?.exitCode ?? exit.exitCode;
      if (!f) {
        // A usage error (4) or an internal error (3) writes no report: the exit says what happened.
        if (code !== 4 && code !== 3) r.problems.push(reportMissing(this, 'junit.xml'));
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
        // A collection error: a case with no class, named after the module, with an <error> (xunit2).
        if (c.status === 'error' && !c.classname) {
          const file = moduleFile(ctx, c.name);
          attempt.collectionErrors.push({ message: c.message === 'collection failure' ? firstErrorLine(c.detail) || c.message : c.message, location: errorLocation(ctx, c.detail, file) });
          continue;
        }
        const file = c.file ? normalizePath(c.file, ctx.root, ctx.cwd).path : moduleFile(ctx, c.classname);
        const line = c.line ?? (file ? locateTest(ctx.read(file), c.name, true) : null);
        attempt.tests.push({
          fullName: [file ?? c.classname, c.classname.split('.').at(-1)?.startsWith('Test') ? c.classname.split('.').at(-1)! : '', c.name].filter(Boolean).join(' › '),
          // An error in a fixture's setup or teardown is a failure of the test it serves.
          status: c.status === 'passed' ? 'passed' : c.status === 'skipped' ? 'skipped' : 'failed',
          location: { path: file, ...(line ? { line } : {}) },
          message: c.message || c.detail,
          snapshotMissing: isSnapshotMissing(c.detail),
        });
      }
      perStep.push({ total: attempt.tests.length, failed: attempt.tests.filter((t) => t.status === 'failed').length, errors: attempt.collectionErrors.length });
      attempts.push(attempt);
    }
    if (attempts.length) fillTests(r, attempts);
    // Exit 6 (pytest 9.1): the warnings went over the limit the project set; the warnings policy decides (7.4).
    if (exit.steps.some((s) => s.exitCode === 6) || exit.exitCode === 6) pushFinding(r, finding({ rule: 'test.warnings', level: 'warning', message: firstErrorLine(out.split('\n').filter((l) => /warning/i.test(l)).join('\n')) || 'pytest warnings over the limit', location: null, anchor: { kind: 'text', value: 'pytest-warnings-limit' } }));
    r.info.perStep = perStep;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    if (codes.includes(5)) return { kind: 'missing', reason: reason('adapter.reason.pytestNoTests') };
    if (codes.includes(4)) return { kind: 'tool_error', reason: reason('adapter.reason.pytestUsage', { detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    if (codes.includes(3)) return { kind: 'tool_error', reason: reason('adapter.reason.pytestInternal', { detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    if (report.problems.length) return { kind: 'ok' };
    const per = (report.info.perStep as { total: number; failed: number; errors: number }[] | undefined) ?? [];
    for (const [i, p] of per.entries()) {
      const code = codes[i];
      if (code === 0 && (p.failed > 0 || p.errors > 0)) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'pytest', exit: 0, failed: p.failed + p.errors }) };
      if (code === 1 && p.failed === 0) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'pytest', exit: 1 }) };
      // 2 without a collection error in the report: an interruption pytest did not explain, the tool's.
      if (code === 2 && p.errors === 0) return { kind: 'tool_error', reason: reason('adapter.reason.pytestInterrupted', { detail: firstErrorLine(stripAnsi(ctx.stdout)) }) };
      if (code !== 0 && code !== 1 && code !== 2 && code !== 6) return unknownExit(this, code ?? null);
    }
    if (report.tests && report.tests.passed + report.tests.flaky + report.tests.failed + report.tests.errors === 0) return { kind: 'missing', reason: reason('adapter.reason.noTestsRan', { tool: 'pytest' }) };
    return { kind: 'ok' };
  },
  liveParser(line) {
    const m = /^(\S+::\S+)\s+(PASSED|FAILED|ERROR|SKIPPED)/.exec(stripAnsi(line));
    if (!m) return null;
    return m[2] === 'FAILED' || m[2] === 'ERROR' ? { testsSeen: 1, provisional: { rule: 'test.failed', title: m[1]!.slice(0, 300), location: null } } : { testsSeen: 1 };
  },
};
