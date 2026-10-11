// The remaining adapters of C-15: the build (any approved build command: 0 with the declared outputs passes, anything
// else fails; the errors from the log at best, the whole log as evidence), a custom check (its mandatory success
// criterion: the exit code, and optionally a text in the output or a report it names), StrykerJS (AYAR applies the
// profile's threshold itself: `thresholds.break` is empty by default, S-30) and k6 (0 passes, 99 the thresholds failed).
import type { ExitSignal } from '@ayar/protocol';
import { emptyReport, filesNamed, finding, firstErrorLine, oversize, projectTemplate, pushFinding, reason, type Adapter, type ParseContext } from '../framework.ts';
import { arr, int, isRecord, num, readJson, rec, REPORT_LIMITS, str } from '../read/guards.ts';
import { readJUnit } from '../read/junit.ts';
import { readSarif } from '../read/sarif.ts';
import { cleanMessage, normalizePath, stripAnsi } from '../read/text.ts';

// ── code.build ──────────────────────────────────────────────────────────────────────────────────────────────

/** The lines of a build log that name an error (best effort: `error`, `ERROR`, `✘`, `TS1234`). */
export function buildErrors(log: string): string[] {
  const lines = stripAnsi(log).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => /(^|\s|\[)(error|ERROR|✘|Error:)|\bTS\d{4}\b|failed to|Failed to|Could not resolve/.test(l)).slice(0, 20);
}

export const build: Adapter = {
  id: 'build-command',
  tool: 'build',
  version: '1.0.0',
  tested: '*',
  limitsKey: 'adapter.limits.build',
  sources: [],
  recognizes: () => true,
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: [], reports: [] }));
  },
  parseReports(ctx, exit) {
    const r = emptyReport(this, ['build-log']);
    if (exit.exitCode !== 0) {
      const errors = buildErrors(`${ctx.stderr}\n${ctx.stdout}`);
      pushFinding(r, finding({ rule: 'build.failed', message: errors.length ? errors.slice(0, 5).join('\n') : `exit code ${exit.exitCode ?? -1}`, location: null, anchor: { kind: 'text', value: errors[0] ?? `exit:${exit.exitCode ?? -1}` } }));
      return r;
    }
    // 0 with every declared output present (FR-36 outputs, the discovered build folder).
    for (const out of ctx.outputs) if (!ctx.exists(out)) pushFinding(r, finding({ rule: 'build.output-missing', message: `${out} is missing after the build`, location: { path: out }, anchor: { kind: 'text', value: out } }));
    return r;
  },
  exitMap(exit) {
    return exit.exitCode === 0 ? { kind: 'ok' } : { kind: 'project_failure', reason: reason('adapter.reason.buildFailed', { code: exit.exitCode ?? -1 }) };
  },
};

// ── custom.<name> ───────────────────────────────────────────────────────────────────────────────────────────

interface CustomSuccess {
  exitCode: number;
  outputContains?: string;
  report?: string;
}

function successOf(ctx: ParseContext): CustomSuccess | null {
  const s = ctx.customSuccess;
  if (!isRecord(s) || typeof s.exitCode !== 'number') return null;
  return { exitCode: s.exitCode, ...(typeof s.outputContains === 'string' ? { outputContains: s.outputContains } : {}), ...(typeof s.report === 'string' ? { report: s.report } : {}) };
}

/**
 * A custom check (10.3): AYAR does not know what the command means; its criterion decides. Without a criterion it
 * does not enter the index (the profile refuses it). A declared JUnit or SARIF report (written into the project, or
 * into `{reports}`) adds its failures as findings.
 */
export const custom: Adapter = {
  id: 'custom-command',
  tool: 'custom',
  version: '1.0.0',
  tested: '*',
  limitsKey: 'adapter.limits.custom',
  sources: [],
  recognizes: () => true,
  template(spec) {
    const cmd = spec.command;
    if (!cmd) return null;
    // The command as the user wrote it; `{reports}` and `{tmp}` in it name AYAR's folders (D-DEV5-09).
    return { adapter: this.id, adapterVersion: '1.0.0', argv: [...cmd.argv], cwd: cmd.cwd === '.' ? '{root}' : `{root}/${cmd.cwd}`, env: { AYAR_REPORTS_DIR: '{reports}' }, repeat: 1, prepare: [], targets: null, reports: [], stdoutReport: false, suggestion: null };
  },
  parseReports(ctx, exit) {
    const r = emptyReport(this, ['custom']);
    const s = successOf(ctx);
    if (!s) return r;
    if (exit.exitCode !== s.exitCode) pushFinding(r, finding({ rule: 'custom.failed', message: `exit code ${exit.exitCode ?? -1}, expected ${s.exitCode}`, location: null, anchor: { kind: 'text', value: 'exit' }, expected: String(s.exitCode), actual: String(exit.exitCode ?? -1) }));
    if (s.outputContains && !stripAnsi(`${ctx.stdout}\n${ctx.stderr}`).includes(s.outputContains)) pushFinding(r, finding({ rule: 'custom.failed', message: `the output does not contain the expected text`, location: null, anchor: { kind: 'text', value: 'output' }, expected: s.outputContains, actual: null }));
    if (s.report) {
      // Into {reports} (kept by the executor), or a file of the project read as it is now.
      const kept = ctx.files.find((f) => f.name === s.report!.split('/').pop());
      const big = kept ? oversize(kept) : null;
      const fromProject = kept ? null : ctx.projectReport(s.report);
      const text = kept ? (big ? null : kept.text) : fromProject!.text;
      if (big) r.problems.push(big);
      else if (fromProject?.problem === 'too_large') r.problems.push({ code: 'too_large', file: s.report, detail: `${fromProject.size ?? 0} bytes; the limit is ${REPORT_LIMITS.maxBytes}` });
      else if (text === null) r.problems.push({ code: 'missing', file: s.report, detail: fromProject?.problem === 'stale' ? 'the declared report was not written in this run (the one there is from before)' : 'the declared report was not written' });
      else if (/^\s*</.test(text)) {
        const x = readJUnit(text, s.report);
        if (!x.ok) r.problems.push(x.problem);
        else {
          for (const c of x.value.cases.filter((k) => k.status === 'failed' || k.status === 'error')) pushFinding(r, finding({ rule: 'test.failed', message: c.message || c.name, location: c.file ? { path: normalizePath(c.file, ctx.root, ctx.cwd).path, ...(c.line ? { line: c.line } : {}) } : null, anchor: { kind: 'test', value: c.fullName } }));
          r.tests = { total: x.value.cases.length, passed: x.value.cases.filter((c) => c.status === 'passed').length, failed: x.value.cases.filter((c) => c.status === 'failed' || c.status === 'error').length, skipped: x.value.cases.filter((c) => c.status === 'skipped').length, errors: 0, flaky: 0 };
        }
      } else {
        const x = readSarif(text, s.report);
        if (!x.ok) r.problems.push(x.problem);
        else for (const res of x.value.results) pushFinding(r, finding({ rule: 'sast.project-rule', toolRule: res.ruleId || null, proof: res.level === 'note' || res.level === 'none' ? 'suggestion' : 'proven', level: res.level === 'error' ? 'error' : res.level === 'warning' ? 'warning' : null, message: res.message, location: res.uri ? { path: normalizePath(res.uri, ctx.root, ctx.cwd).path, ...(res.line ? { line: res.line } : {}) } : null, anchor: { kind: 'code', value: '' } }));
      }
    }
    return r;
  },
  exitMap(_exit, report, ctx): ExitSignal {
    if (!successOf(ctx)) return { kind: 'tool_error', reason: reason('adapter.reason.noSuccessCriterion') };
    void report;
    return { kind: 'ok' };
  },
};

// ── StrykerJS ───────────────────────────────────────────────────────────────────────────────────────────────

/** The mutation score (mutation-testing-report-schema 3): detected over valid, in percent; null with no valid mutant. */
export function mutationScore(files: Record<string, unknown>): { score: number | null; survived: { path: string; line: number | null; mutator: string; replacement: string }[] } {
  let detected = 0;
  let valid = 0;
  const survived: { path: string; line: number | null; mutator: string; replacement: string }[] = [];
  for (const [path, f] of Object.entries(files)) {
    for (const m of arr(rec(f).mutants).map(rec)) {
      const status = str(m.status);
      if (status === 'Killed' || status === 'Timeout') {
        detected++;
        valid++;
      } else if (status === 'Survived' || status === 'NoCoverage') {
        valid++;
        survived.push({ path, line: int(rec(rec(m.location).start).line) ?? null, mutator: str(m.mutatorName), replacement: str(m.replacement) });
      }
    }
  }
  return { score: valid ? (detected / valid) * 100 : null, survived };
}

export const stryker: Adapter = {
  id: 'stryker',
  tool: 'stryker',
  version: '1.0.0',
  tested: '>=10.0.0 <11.0.0',
  limitsKey: 'adapter.limits.mutation',
  sources: ['S-30'],
  packageName: '@stryker-mutator/core',
  recognizes: (program, args) => program === 'stryker' && (args[0] === 'run' || args.length === 0),
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--reporters', 'json,clear-text'], reports: [] }));
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['mutation-report']);
    // Stryker writes its report into the project (a declared side effect, `reports/`): read as it is after the run.
    const rel = `${ctx.component === '.' ? '' : `${ctx.component}/`}reports/mutation/mutation.json`;
    const got = ctx.projectReport(rel);
    if (got.text === null) {
      r.problems.push(got.problem === 'too_large' ? { code: 'too_large', file: rel, detail: `${got.size ?? 0} bytes; the limit is ${REPORT_LIMITS.maxBytes}` } : { code: 'missing', file: rel, detail: got.problem === 'stale' ? 'stryker did not write its JSON report in this run (the one there is from before)' : 'stryker did not write its JSON report' });
      return r;
    }
    const text = got.text;
    const j = readJson(text, rel);
    if (!j.ok) {
      r.problems.push(j.problem);
      return r;
    }
    const { score, survived } = mutationScore(rec(rec(j.value).files));
    for (const s of survived) pushFinding(r, finding({ rule: 'mutant.survived', toolRule: s.mutator || null, message: cleanMessage(`${s.mutator}: ${s.replacement}`, 500), location: { path: normalizePath(s.path, ctx.root, ctx.cwd).path, ...(s.line ? { line: s.line } : {}) }, anchor: { kind: 'code', value: '' } }));
    r.info.score = score;
    // 7.4: a threshold is a number the profile declares; nothing else becomes one (null or '' is not 0).
    const declared = ctx.thresholds?.mutationScore ?? ctx.thresholds?.break;
    const threshold = typeof declared === 'number' ? declared : NaN;
    if (Number.isFinite(threshold)) {
      r.info.threshold = threshold;
      if (score !== null && score < threshold) pushFinding(r, finding({ rule: 'mutation.score-below', message: `mutation score ${score.toFixed(2)} below ${threshold}`, location: null, anchor: { kind: 'text', value: 'mutation-score' }, expected: String(threshold), actual: score.toFixed(2) }));
    }
    return r;
  },
  exitMap(exit, report): ExitSignal {
    if (exit.exitCode !== 0) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'stryker', code: exit.exitCode ?? -1, detail: '' }) };
    if (report.problems.length) return { kind: 'ok' };
    // 7.4: AYAR invents no threshold; its absence is «ناقص إعداد».
    if (report.info.threshold === undefined) return { kind: 'missing', reason: reason('adapter.reason.noThreshold', { tool: 'stryker' }) };
    if (report.info.score === null) return { kind: 'missing', reason: reason('adapter.reason.noMutants') };
    return { kind: 'ok' };
  },
};

// ── k6 ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const k6: Adapter = {
  id: 'k6',
  tool: 'k6',
  version: '1.0.0',
  tested: '>=2.0.0 <3.0.0',
  limitsKey: 'adapter.limits.load',
  sources: ['S-31'],
  recognizes: (program, args) => program === 'k6' && args[0] === 'run',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--summary-export', '{reports}/k6.json'], reports: ['k6.json'] }));
  },
  parseReports(ctx, exit) {
    const r = emptyReport(this, ['k6-summary']);
    const f = filesNamed(ctx, 'k6.json')[0];
    if (!f) {
      if (exit.exitCode === 0 || exit.exitCode === 99) r.problems.push({ code: 'missing', file: 'k6.json', detail: 'k6 did not write its summary' });
      return r;
    }
    const j = readJson(f.text!, f.name);
    if (!j.ok) {
      r.problems.push(j.problem);
      return r;
    }
    for (const [metric, m] of Object.entries(rec(rec(j.value).metrics))) {
      for (const [expr, crossed] of Object.entries(rec(rec(m).thresholds))) {
        // In the summary export, a threshold maps to whether it failed (`true`: crossed).
        if (crossed === true || rec(crossed).ok === false) pushFinding(r, finding({ rule: 'load.threshold', message: `${metric}: ${expr}`, location: null, anchor: { kind: 'text', value: `${metric}:${expr}` }, actual: String(num(rec(m).value, num(rec(m).avg, NaN))) }));
      }
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (exit.exitCode === 0) return report.findings.length ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'k6', exit: 0, failed: report.findings.length }) } : { kind: 'ok' };
    if (exit.exitCode === 99) return report.findings.length ? { kind: 'ok' } : { kind: 'project_failure', reason: reason('adapter.reason.loadThresholds') };
    if (report.problems.length) return { kind: 'ok' };
    return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'k6', code: exit.exitCode ?? -1, detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
  },
};

