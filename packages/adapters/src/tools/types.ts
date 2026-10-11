// The type checkers of code.types (C-15): TypeScript (tsc 5, 6 and 7; vue-tsc the same; svelte-check by its machine
// output), mypy 2 and pyright 1.1. An error is a violation («صفر أخطاء أنواع»); a configuration diagnostic named in
// the map is the tool's. mypy's code 2 is the project's when a diagnostic points into a source file (a syntax error),
// the tool's otherwise; pyright with nothing analysed is «ناقص»: no input ran.
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { emptyReport, filesNamed, finding, firstErrorLine, oversize, projectTemplate, pushFinding, reason, unknownExit, type Adapter, type ExitInfo, type ParseContext } from '../framework.ts';
import { arr, int, num, readJsonInText, readJsonLines, rec, str } from '../read/guards.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';

/** The text a tool printed: the stdout report the executor captured, else the output tail. */
function stdoutOf(ctx: ParseContext, r: ParsedReport): string | null {
  const f = filesNamed(ctx, 'stdout.txt')[0];
  if (!f) return ctx.stdout;
  const big = oversize(f);
  if (big) {
    r.problems.push(big);
    return null;
  }
  return f.text;
}

/**
 * C-15: the diagnostics of tsc that are its configuration or its inputs, not the project's code — «خيار غير معروف»
 * (TS5023), «تعذرت قراءة ملف» (TS5083), «ملف غير موجود» (TS6053), «لا مدخلات» (TS18003) and their kin.
 */
export const TSC_CONFIG_CODES: ReadonlySet<number> = new Set([2688, 5023, 5024, 5025, 5033, 5042, 5047, 5051, 5052, 5053, 5055, 5056, 5057, 5058, 5059, 5069, 5070, 5083, 5095, 5101, 5102, 5107, 5110, 6046, 6053, 6054, 6059, 6304, 6305, 6306, 6307, 18002, 18003]);

const TSC_LINE = /^(.+?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.*)$/;
const TSC_GLOBAL = /^(error|warning) TS(\d+): (.*)$/;

export const tsc: Adapter = {
  id: 'tsc',
  tool: 'tsc',
  version: '1.0.0',
  tested: '>=5.0.0 <8.0.0',
  limitsKey: 'adapter.limits.types',
  sources: ['S-28'],
  packageName: 'typescript',
  recognizes: (program) => program === 'tsc' || program === 'vue-tsc',
  template(spec) {
    return projectTemplate(this, spec, (args) => ({ args: args.includes('--pretty') ? [] : ['--pretty', 'false'], reports: [], stdoutReport: true }));
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['tsc-text']);
    const text = stdoutOf(ctx, r);
    if (text === null) return r;
    const config: number[] = [];
    for (const raw of stripAnsi(text).split('\n')) {
      const line = raw.trimEnd();
      const m = TSC_LINE.exec(line);
      if (m) {
        const code = Number(m[5]);
        if (TSC_CONFIG_CODES.has(code)) config.push(code);
        const p = normalizePath(m[1]!, ctx.root, ctx.cwd);
        pushFinding(r, finding({ rule: 'types.error', toolRule: `TS${code}`, level: m[4] === 'warning' ? 'warning' : 'error', origin: TSC_CONFIG_CODES.has(code) ? 'tool' : 'project', message: m[6]!, location: { path: p.path, ...(p.outside ? { outside: true } : {}), line: Number(m[2]), column: Number(m[3]) }, anchor: { kind: 'code', value: '' } }));
        continue;
      }
      const g = TSC_GLOBAL.exec(line.trim());
      if (g) {
        const code = Number(g[2]);
        if (TSC_CONFIG_CODES.has(code)) config.push(code);
        else pushFinding(r, finding({ rule: 'types.error', toolRule: `TS${code}`, message: g[3]!, location: null, anchor: { kind: 'text', value: `TS${code}` } }));
      }
    }
    r.info.configCodes = config;
    r.signals.configError = config.length > 0;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    const config = (report.info.configCodes as number[] | undefined) ?? [];
    if (config.length) return { kind: 'tool_error', reason: reason('adapter.reason.tscConfig', { code: `TS${config[0]}`, detail: firstErrorLine(stripAnsi(ctx.stdout)) }) };
    if (report.problems.length) return { kind: 'ok' };
    const errors = report.findings.filter((f) => (f.level ?? 'error') === 'error').length;
    if (exit.exitCode === 0) return errors ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'tsc', exit: 0, failed: errors }) } : { kind: 'ok' };
    // 1 and 2: diagnostics present (with or without output written; --noEmit gives 2, E-07).
    if (exit.exitCode === 1 || exit.exitCode === 2) return errors ? { kind: 'ok' } : { kind: 'tool_error', reason: reason('adapter.reason.unparsedDiagnostics', { tool: 'tsc', code: exit.exitCode, detail: firstErrorLine(stripAnsi(ctx.stdout || ctx.stderr)) }) };
    return unknownExit(this, exit.exitCode);
  },
};

/** svelte-check `--output machine`: `<time> ERROR "<file>" <line>:<col> "<message>"`. */
const SVELTE_LINE = /^\d+\s+(ERROR|WARNING)\s+"(.+?)"\s+(\d+):(\d+)\s+"(.*)"/;

export const svelteCheck: Adapter = {
  id: 'svelte-check',
  tool: 'svelte-check',
  version: '1.0.0',
  tested: '>=4.0.0 <5.0.0',
  limitsKey: 'adapter.limits.types',
  sources: ['S-28'],
  packageName: 'svelte-check',
  recognizes: (program) => program === 'svelte-check',
  template(spec) {
    return projectTemplate(this, spec, (args) => ({ args: args.includes('--output') ? [] : ['--output', 'machine'], reports: [], stdoutReport: true }));
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['svelte-check-machine']);
    const text = stdoutOf(ctx, r);
    if (text === null) return r;
    let completed = false;
    for (const line of stripAnsi(text).split('\n')) {
      const done = /^\d+\s+COMPLETED\s+(\d+)\s+FILES/.exec(line);
      if (done) {
        completed = true;
        r.info.files = Number(done[1]);
      } else if (/^\d+\s+COMPLETED\s/.test(line)) completed = true;
      const m = SVELTE_LINE.exec(line);
      if (!m) continue;
      const p = normalizePath(m[2]!, ctx.root, ctx.cwd);
      pushFinding(r, finding({ rule: 'types.error', toolRule: null, level: m[1] === 'WARNING' ? 'warning' : 'error', message: m[5]!, location: { path: p.path, line: Number(m[3]) + 1, column: Number(m[4]) + 1 }, anchor: { kind: 'code', value: '' } }));
    }
    r.info.completed = completed;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (report.problems.length) return { kind: 'ok' };
    if (!report.info.completed) return { kind: 'tool_error', reason: reason('adapter.reason.stoppedBeforeTests', { tool: 'svelte-check', detail: firstErrorLine(stripAnsi(ctx.stderr || ctx.stdout)) }) };
    const errors = report.findings.filter((f) => f.level === 'error').length;
    if (exit.exitCode === 0 && report.info.files === 0) return { kind: 'missing', reason: reason('adapter.reason.noInputFiles', { tool: 'svelte-check' }) };
    if (exit.exitCode === 0) return errors ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'svelte-check', exit: 0, failed: errors }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return errors || report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'svelte-check', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};

/** mypy 2: `--show-column-numbers --no-error-summary --no-color-output --cache-dir <tmp> -O json` (E-07: works). */
export const mypy: Adapter = {
  id: 'mypy',
  tool: 'mypy',
  version: '1.0.0',
  tested: '>=2.0.0 <3.0.0',
  limitsKey: 'adapter.limits.types',
  sources: [],
  packageName: 'mypy',
  recognizes: (program) => program === 'mypy',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--show-column-numbers', '--no-error-summary', '--no-color-output', '--cache-dir', '{tmp}/mypy-cache', '-O', 'json'], reports: [], stdoutReport: true }));
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['mypy-json-lines']);
    const text = stdoutOf(ctx, r);
    if (text === null) return r;
    const lines = readJsonLines(text, 'stdout.txt');
    if (!lines.ok) {
      r.problems.push(lines.problem);
      return r;
    }
    for (const d of lines.value.values.map(rec)) {
      const severity = str(d.severity);
      if (severity !== 'error') continue; // a note belongs to the error before it
      const file = str(d.file);
      const p = file ? normalizePath(file, ctx.root, ctx.cwd) : { path: null, outside: false };
      const line = int(d.line);
      const column = typeof d.column === 'number' && d.column >= 0 ? d.column + 1 : undefined;
      pushFinding(r, finding({ rule: 'types.error', toolRule: str(d.code) || null, message: str(d.message), location: file ? { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}) } : null, anchor: { kind: 'code', value: '' } }));
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (report.problems.length) return { kind: 'ok' };
    const located = report.findings.filter((f) => f.location?.path).length;
    if (exit.exitCode === 0) return report.findings.length ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'mypy', exit: 0, failed: report.findings.length }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'mypy', exit: 1 }) };
    // 2: the project's when a diagnostic points into a source file (a syntax error), the tool's otherwise (C-15).
    if (exit.exitCode === 2) return located ? { kind: 'ok' } : { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'mypy', code: 2, detail: firstErrorLine(stripAnsi(`${ctx.stderr}\n${ctx.stdout}`)) }) };
    return unknownExit(this, exit.exitCode);
  },
};

/** pyright 1.1: `--outputjson` on the output; 0, 1 by the errors; 2, 3, 4 the tool's. */
export const pyright: Adapter = {
  id: 'pyright',
  tool: 'pyright',
  version: '1.0.0',
  tested: '>=1.1.0 <1.2.0',
  limitsKey: 'adapter.limits.types',
  sources: [],
  packageName: 'pyright',
  recognizes: (program) => program === 'pyright',
  template(spec) {
    return projectTemplate(this, spec, (args) => ({ args: args.includes('--outputjson') ? [] : ['--outputjson'], reports: [], stdoutReport: true }));
  },
  parseReports(ctx, exit: ExitInfo) {
    const r = emptyReport(this, ['pyright-json']);
    if (exit.exitCode !== null && exit.exitCode >= 2) return r;
    const text = stdoutOf(ctx, r);
    if (text === null) return r;
    const j = readJsonInText(text, 'stdout.txt');
    if (!j.ok) {
      r.problems.push(j.problem);
      return r;
    }
    const root = rec(j.value);
    for (const d of arr(root.generalDiagnostics).map(rec)) {
      const severity = str(d.severity);
      if (severity !== 'error' && severity !== 'warning') continue;
      const p = normalizePath(str(d.file), ctx.root, ctx.cwd);
      const start = rec(rec(d.range).start);
      pushFinding(r, finding({ rule: 'types.error', toolRule: str(d.rule) || null, level: severity === 'warning' ? 'warning' : 'error', message: str(d.message), location: { path: p.path, ...(p.outside ? { outside: true } : {}), line: num(start.line) + 1, column: num(start.character) + 1 }, anchor: { kind: 'code', value: '' } }));
    }
    const analyzed = num(rec(root.summary).filesAnalyzed, -1);
    r.info.filesAnalyzed = analyzed;
    r.signals.noInputs = analyzed === 0;
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (exit.exitCode !== null && exit.exitCode >= 2 && exit.exitCode <= 4) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'pyright', code: exit.exitCode, detail: firstErrorLine(stripAnsi(ctx.stderr || ctx.stdout)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (report.signals.noInputs) return { kind: 'missing', reason: reason('adapter.reason.noInputFiles', { tool: 'pyright' }) };
    const errors = report.findings.filter((f) => f.level === 'error').length;
    if (exit.exitCode === 0) return errors ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'pyright', exit: 0, failed: errors }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return errors ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'pyright', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};

/** Knip 5 and 6: `--reporter json`; the unlisted and unresolved are proven, the unused a suspicion (S-29). */
export const knip: Adapter = {
  id: 'knip',
  tool: 'knip',
  version: '1.0.0',
  tested: '>=5.0.0 <7.0.0',
  limitsKey: 'adapter.limits.unused',
  sources: ['S-29'],
  packageName: 'knip',
  recognizes: (program) => program === 'knip',
  template(spec) {
    return projectTemplate(this, spec, () => ({ args: ['--reporter', 'json'], reports: [], stdoutReport: true }));
  },
  parseReports(ctx, exit: ExitInfo) {
    const r = emptyReport(this, ['knip-json']);
    if (exit.exitCode === 2) return r;
    const text = stdoutOf(ctx, r);
    if (text === null) return r;
    const j = readJsonInText(text, 'stdout.txt');
    if (!j.ok) {
      r.problems.push(j.problem);
      return r;
    }
    const PROVEN: Record<string, string> = { unlisted: 'unused.unlisted', unresolved: 'unused.unresolved', binaries: 'unused.unlisted' };
    for (const issue of arr(rec(j.value).issues).map(rec)) {
      const file = str(issue.file);
      const p = normalizePath(file, ctx.root, ctx.cwd);
      for (const [kind, items] of Object.entries(issue)) {
        if (kind === 'file' || kind === 'owner' || !Array.isArray(items)) continue;
        for (const it of items.map(rec)) {
          const name = str(it.name);
          const line = int(it.line);
          const where = kind === 'files' ? normalizePath(name, ctx.root, ctx.cwd) : p;
          pushFinding(r, finding({ rule: PROVEN[kind] ?? 'unused.item', toolRule: kind, message: `${kind}: ${name}`, location: { path: where.path, ...(line ? { line } : {}) }, anchor: { kind: 'text', value: `${kind}:${name}:${where.path ?? ''}` } }));
        }
      }
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    if (exit.exitCode === 2) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'knip', code: 2, detail: firstErrorLine(stripAnsi(`${ctx.stdout}\n${ctx.stderr}`)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (exit.exitCode === 0) return report.findings.length ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'knip', exit: 0, failed: report.findings.length }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'knip', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};
