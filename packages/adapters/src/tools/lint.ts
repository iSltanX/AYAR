// The linters of code.lint (C-15): ESLint 9 and 10, Ruff 0.16, Biome 2. Each reads the project's own configuration
// (AYAR adds no rule: 10.3 «القواعد من اختيار المشروع»); an error is a violation of the criterion, a warning is the
// warnings policy's (7.4). A configuration error is the tool's, never the project's failure (S-27).
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, finding, firstErrorLine, oversize, projectTemplate, pushFinding, reason, reportMissing, unknownExit, type Adapter, type ExitInfo, type ParseContext } from '../framework.ts';
import { arr, int, num, readJson, rec, str } from '../read/guards.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';

function onlyReport(a: Adapter, ctx: ParseContext, name: string, r: ParsedReport): unknown {
  const f = filesNamed(ctx, name)[0];
  if (!f) {
    r.problems.push(reportMissing(a, name));
    return undefined;
  }
  const big = oversize(f);
  if (big) {
    r.problems.push(big);
    return undefined;
  }
  const j = readJson(f.text!, f.name);
  if (!j.ok) {
    r.problems.push(j.problem);
    return undefined;
  }
  return j.value;
}

/** ESLint: `-f json -o <r>/eslint.json`; 0 and 1 by the errors, 2 a configuration error or no files (S-27). */
export const eslint: Adapter = {
  id: 'eslint',
  tool: 'eslint',
  version: '1.0.0',
  tested: '>=9.0.0 <11.0.0',
  limitsKey: 'adapter.limits.lint',
  sources: ['S-27'],
  packageName: 'eslint',
  recognizes: (program) => program === 'eslint',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['-f', 'json', '-o', '{reports}/eslint.json'], reports: ['eslint.json'] }));
  },
  parseReports(ctx, exit: ExitInfo) {
    const r = emptyReport(this, ['eslint-json']);
    if (exit.exitCode === 2) return r;
    const v = onlyReport(this, ctx, 'eslint.json', r);
    for (const file of arr(v).map(rec)) {
      const p = normalizePath(str(file.filePath), ctx.root, ctx.cwd);
      for (const m of arr(file.messages).map(rec)) {
        const severity = num(m.severity);
        const fatal = m.fatal === true;
        const line = int(m.line);
        const column = int(m.column);
        pushFinding(r, finding({
          rule: severity === 2 || fatal ? 'lint.error' : 'lint.warning',
          toolRule: str(m.ruleId) || (fatal ? 'parsing-error' : null),
          message: str(m.message),
          location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}) },
          anchor: { kind: 'code', value: '' },
        }));
      }
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (exit.exitCode === 2) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'eslint', code: 2, detail: firstErrorLine(stripAnsi(ctx.stderr || ctx.stdout)) }) };
    if (report.problems.length) return { kind: 'ok' };
    const errors = report.findings.filter((f) => f.rule === 'lint.error').length;
    if (exit.exitCode === 0) return errors ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'eslint', exit: 0, failed: errors }) } : { kind: 'ok' };
    // 1: errors, or warnings over the project's --max-warnings.
    if (exit.exitCode === 1) return errors || report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'eslint', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};

/** Ruff: `ruff check --output-format json --output-file <r>/ruff.json --no-cache` (no `.ruff_cache` in the project). */
export const ruff: Adapter = {
  id: 'ruff',
  tool: 'ruff',
  version: '1.0.0',
  tested: '>=0.16.0 <0.17.0',
  limitsKey: 'adapter.limits.lint',
  sources: [],
  packageName: 'ruff',
  recognizes: (program, args) => program === 'ruff' && args[0] === 'check',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--output-format', 'json', '--output-file', '{reports}/ruff.json', '--no-cache'], reports: ['ruff.json'] }));
  },
  parseReports(ctx, exit: ExitInfo) {
    const r = emptyReport(this, ['ruff-json']);
    if (exit.exitCode === 2) return r;
    const v = onlyReport(this, ctx, 'ruff.json', r);
    for (const d of arr(v).map(rec)) {
      const p = normalizePath(str(d.filename), ctx.root, ctx.cwd);
      const loc = rec(d.location);
      const line = int(loc.row);
      const column = int(loc.column);
      pushFinding(r, finding({ rule: 'lint.error', toolRule: str(d.code) || null, message: str(d.message), location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}) }, anchor: { kind: 'code', value: '' } }));
    }
    // Ruff says nothing when there was nothing to check (`ruff check .` with no Python file): AYAR counts its own.
    r.signals.noInputs = r.findings.length === 0 && ctx.countFiles(['.py', '.pyi']) === 0;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (exit.exitCode === 2) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'ruff', code: 2, detail: firstErrorLine(stripAnsi(ctx.stderr)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (report.signals.noInputs) return { kind: 'missing', reason: reason('adapter.reason.noInputFiles', { tool: 'ruff' }) };
    if (exit.exitCode === 0) return report.findings.length ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'ruff', exit: 0, failed: report.findings.length }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'ruff', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};

/** Biome 2: `biome lint --reporter=json --reporter-file=<r>/biome.json`; the result from the report (E-07). */
export const biome: Adapter = {
  id: 'biome',
  tool: 'biome',
  version: '1.0.0',
  tested: '>=2.0.0 <3.0.0',
  limitsKey: 'adapter.limits.lint',
  sources: [],
  packageName: '@biomejs/biome',
  recognizes: (program, args) => program === 'biome' && (args[0] === 'lint' || args[0] === 'check' || args[0] === 'ci'),
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--reporter=json', '--reporter-file={reports}/biome.json'], reports: ['biome.json'] }));
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['biome-json']);
    const f = filesNamed(ctx, 'biome.json')[0];
    // A configuration Biome refuses writes no report: the exit map reads the output.
    if (!f) return r;
    const v = onlyReport(this, ctx, 'biome.json', r);
    const root = rec(v);
    for (const d of arr(root.diagnostics).map(rec)) {
      const severity = str(d.severity);
      if (severity !== 'error' && severity !== 'warning' && severity !== 'fatal') continue;
      const loc = rec(d.location);
      const p = normalizePath(str(rec(loc.path).file, str(loc.path)), ctx.root, ctx.cwd);
      const line = int(rec(loc.start).line);
      const column = int(rec(loc.start).column);
      pushFinding(r, finding({ rule: severity === 'warning' ? 'lint.warning' : 'lint.error', toolRule: str(d.category) || null, message: str(d.message, str(d.description)), location: { path: p.path, ...(line ? { line } : {}), ...(column ? { column } : {}) }, anchor: { kind: 'code', value: '' } }));
    }
    const s = rec(root.summary);
    r.info.processed = num(s.changed) + num(s.unchanged);
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    const out = stripAnsi(`${ctx.stdout}\n${ctx.stderr}`);
    if (!filesNamed(ctx, 'biome.json').length) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'biome', code: exit.exitCode ?? -1, detail: firstErrorLine(out) }) };
    if (report.problems.length) return { kind: 'ok' };
    const errors = report.findings.filter((f) => f.rule === 'lint.error').length;
    // Exit 1 with nothing processed: Biome's own error «No files were processed» (E-07), the tool's.
    if (exit.exitCode === 1 && errors === 0 && report.info.processed === 0) return { kind: 'tool_error', reason: reason('adapter.reason.noFilesProcessed', { tool: 'biome' }) };
    if (exit.exitCode === 0) return errors ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'biome', exit: 0, failed: errors }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return errors || report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'biome', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};
