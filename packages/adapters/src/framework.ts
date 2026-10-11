// C-15 «عقد المحول»: each adapter knows one tool — its id, the tool, the versions it was tested with, how to find
// and judge it (detect, readiness), the final command (buildInvocation: a template the approval shows literally),
// what its exits mean (exitMap), how to read its reports into AYAR's findings (parseReports), how a line of its
// output becomes progress (liveParser), and the key of its limits text with its sources. Adapters are pure: they
// neither run anything nor read the disk; the engine runs the template and hands them the reports it kept (already
// redacted, D-46) with a reader of project files for what a report only points at (a test's line, a secret's span).
import type { CheckSpec, ExitSignal, FindingAnchor, FindingLocation, InvocationTemplate, Origin, ParsedFinding, ParsedReport, Proof, Reason, ReportProblem, Severity } from '@ayar/protocol';
import { appendToScript, programOf, scriptShape } from './script.ts';
import { cleanMessage } from './read/text.ts';
import { REPORT_LIMITS } from './read/guards.ts';

/** The version of the adapters as a whole: part of every template, so a change of flags asks for approval again. */
export const ADAPTERS_VERSION = '1.0.0';

/** The spec as an adapter sees it. */
export type SpecInput = Pick<CheckSpec, 'checkId' | 'component' | 'section' | 'command' | 'tool' | 'runner' | 'thresholds' | 'customSuccess' | 'references' | 'referenceValues'>;

/** What discovery found that a template uses: the project's own configuration files of a tool, by tool key. */
export interface TemplateExtras {
  configs: Readonly<Record<string, string>>;
}

/** One report the engine kept for the execution: its name inside {reports}/<step>/, its text (redacted). */
export interface ReportFile {
  name: string;
  step: number;
  /** Null when it was over the limit and not read (C-15). */
  text: string | null;
  size: number;
  truncated: boolean;
}

/** How the process ended (rule 1 is the executor's: the adapter is asked only after an exit of its own). */
export interface ExitInfo {
  exitCode: number | null;
  signal: string | null;
  steps: { n: number; exitCode: number | null; ended: string }[];
}

export interface ParseContext {
  /** The project root, absolute. */
  root: string;
  /** The folder the tool ran in, absolute (the component, or AYAR's neutral folder). */
  cwd: string;
  component: string;
  checkId: string;
  files: readonly ReportFile[];
  /** The output, redacted, at most its last megabyte. */
  stdout: string;
  stderr: string;
  /** A project file's text, read without running anything; null when absent, unreadable or too large. */
  read(rel: string): string | null;
  /** Files of the run's inventory under the component with one of these extensions (AYAR's own count). */
  countFiles(exts: readonly string[]): number;
  thresholds: Record<string, unknown> | null;
  /** FR-36: the outputs the project declares (code.build). */
  outputs: readonly string[];
  exists(rel: string): boolean;
  customSuccess: CheckSpec['customSuccess'];
  /**
   * A report the tool writes into the project (Stryker's, a custom check's declared file): its text only when this
   * execution wrote it (modified since it started) and within the report limit (C-15); otherwise why not — a file
   * left from before never stands in for a report that was not written.
   */
  projectReport(rel: string): { text: string | null; problem: 'missing' | 'stale' | 'too_large' | null; size: number | null };
}

/** A line of output, read live (9.6 point 5): progress, and a provisional finding when it names one. */
export interface LiveSignal {
  testsSeen?: number;
  total?: number;
  provisional?: { rule: string; title: string; location: FindingLocation | null };
}

export interface Adapter {
  readonly id: string;
  readonly tool: string;
  readonly version: string;
  /** C-15 «نطاق الإصدارات المختبر»: e.g. `>=5.0.0 <6.0.0`. Outside it: «يحتاج اعتمادًا» once, the result marked. */
  readonly tested: string;
  /** The key of its limits text (C-15 «مفتاح نص الحدود»), and its sources. */
  readonly limitsKey: string;
  readonly sources: readonly string[];
  /** The npm package (or Python distribution) the project installs it as, to read its version from the files. */
  readonly packageName?: string;
  /** detect: is this program (with its arguments) the tool? */
  recognizes(program: string, args: readonly string[]): boolean;
  /** buildInvocation: the final command as a template, or null when it cannot be run by this adapter. */
  template(spec: SpecInput, extras: TemplateExtras): InvocationTemplate | null;
  /** readiness: what this tool still lacks for this spec (none, usually; the engine's readiness covers the rest). */
  readiness?(spec: SpecInput): Reason[];
  parseReports(ctx: ParseContext, exit: ExitInfo): ParsedReport;
  exitMap(exit: ExitInfo, report: ParsedReport, ctx: ParseContext): ExitSignal;
  liveParser?(line: string): LiveSignal | null;
}

// ── report helpers ───────────────────────────────────────────────────────────────────────────────────────────

export function emptyReport(a: Pick<Adapter, 'id' | 'version'>, formats: string[] = []): ParsedReport {
  return { reader: a.id, readerVersion: a.version, formats, tests: null, findings: [], findingsDropped: 0, signals: { noInputs: false, collectionError: false, configError: false, flaky: false, unresolved: 0 }, problems: [], info: {} };
}

/** Adds findings within the limit; the rest are counted (C-15: a report cannot flood the store). */
export function pushFinding(r: ParsedReport, f: ParsedFinding): void {
  if (r.findings.length >= REPORT_LIMITS.maxFindings) r.findingsDropped++;
  else r.findings.push(f);
}

export function finding(o: {
  rule: string;
  toolRule?: string | null;
  severity?: Severity | null;
  proof?: Proof | null;
  level?: 'error' | 'warning' | null;
  origin?: Origin;
  message: string;
  location: FindingLocation | null;
  anchor: FindingAnchor;
  expected?: string | null;
  actual?: string | null;
}): ParsedFinding {
  return {
    rule: o.rule,
    toolRule: o.toolRule ? o.toolRule.slice(0, 256) : null,
    severity: o.severity ?? null,
    proof: o.proof ?? null,
    level: o.level ?? null,
    origin: o.origin ?? 'project',
    message: cleanMessage(o.message, REPORT_LIMITS.maxMessage),
    location: o.location,
    anchor: { kind: o.anchor.kind, value: o.anchor.value.slice(0, 4096) },
    expected: o.expected ? cleanMessage(o.expected, 2000) : null,
    actual: o.actual ? cleanMessage(o.actual, 2000) : null,
  };
}

/** The reports of a given name, step by step (a single execution has step 1). */
export function filesNamed(ctx: ParseContext, name: string): ReportFile[] {
  return ctx.files.filter((f) => f.name === name).sort((a, b) => a.step - b.step);
}

/** A report that was over the limit is a problem of its own, before anything is read from it. */
export function oversize(f: ReportFile): ReportProblem | null {
  if (f.text === null || f.truncated || f.size > REPORT_LIMITS.maxBytes) return { code: 'too_large', file: f.name, detail: `${f.size} bytes; the limit is ${REPORT_LIMITS.maxBytes}` };
  return null;
}

export const reason = (key: string, params?: Record<string, string | number>): Reason => (params ? { key, params } : { key });

/** The 1-based line of the first occurrence of `needle` in `text` (from `from`), or null. */
export function lineOf(text: string | null, needle: string, from = 1): number | null {
  if (!text || !needle) return null;
  const lines = text.split('\n');
  for (let i = Math.max(0, from - 1); i < lines.length; i++) if (lines[i]!.includes(needle)) return i + 1;
  return null;
}

/**
 * Where a test is declared, when the report does not say (Vitest's JSON, pytest's xunit2): the line that names it
 * in a test call (`it('…'`, `test("…"`) or a `def <name>(` in Python. The fingerprint does not need it (a test is
 * anchored by its full name); the user does.
 */
export function locateTest(text: string | null, title: string, python: boolean): number | null {
  if (!text || !title) return null;
  const lines = text.split('\n');
  if (python) {
    const name = title.replace(/\[.*\]$/, '');
    const re = new RegExp(`^\\s*(async\\s+)?def\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
    const i = lines.findIndex((l) => re.test(l));
    return i >= 0 ? i + 1 : null;
  }
  const quoted = [`'${title}'`, `"${title}"`, `\`${title}\``];
  const i = lines.findIndex((l) => quoted.some((q) => l.includes(q)));
  return i >= 0 ? i + 1 : null;
}

// ── templates ────────────────────────────────────────────────────────────────────────────────────────────────

export interface ProjectFlags {
  /** Flags appended to the tool's command (after the script's name for a script). */
  args: string[];
  env?: Record<string, string>;
  reports: string[];
  stdoutReport?: boolean;
  repeat?: number;
}

const cwdOf = (spec: SpecInput): string => {
  const c = spec.command?.cwd ?? spec.component;
  return c === '.' || c === '' ? '{root}' : `{root}/${c}`;
};

/**
 * The template of an adapter for a project command (a script or a tool call): the approved command with the flags
 * appended where they reach the tool. A composite script whose last command is not the tool runs as approved and
 * asks for no report (its adapter then reads nothing: «تعذّر» with the suggestion); either way, a composite script
 * gets the direct call suggested, with the tool's own arguments from the script.
 */
export function projectTemplate(a: Adapter, spec: SpecInput, flags: (programArgs: readonly string[]) => ProjectFlags): InvocationTemplate | null {
  const cmd = spec.command;
  if (!cmd) return null;
  const isTool = (program: string, args: readonly string[]) => a.recognizes(program, args);
  let argv: string[];
  let suggestion: InvocationTemplate['suggestion'] = null;
  let f: ProjectFlags;
  if (cmd.script) {
    const shape = scriptShape(cmd.script.text, isTool);
    if (shape.toolAt < 0) return null;
    const toolCmd = shape.commands[shape.toolAt]!;
    f = flags(programOf(toolCmd)?.args ?? []);
    if (shape.composite) suggestion = { argv: [...toolCmd, ...f.args], reason: 'adapter.suggest.directCall' };
    if (!shape.reachable) {
      // Runs as approved: no flag would reach the tool, so no report is asked for.
      return { adapter: a.id, adapterVersion: ADAPTERS_VERSION, argv: [...cmd.argv], cwd: cwdOf(spec), env: {}, repeat: f.repeat ?? 1, prepare: [], targets: null, reports: [], stdoutReport: false, suggestion };
    }
    argv = appendToScript(cmd.argv, f.args);
  } else {
    const p = programOf(cmd.argv);
    if (!p || !isTool(p.program, p.args)) return null;
    f = flags(p.args);
    argv = [...cmd.argv, ...f.args];
  }
  return { adapter: a.id, adapterVersion: ADAPTERS_VERSION, argv, cwd: cwdOf(spec), env: f.env ?? {}, repeat: f.repeat ?? 1, prepare: [], targets: null, reports: f.reports, stdoutReport: f.stdoutReport ?? false, suggestion };
}

/** An exit code the adapter's map does not know: «تعذّر», never a guess. */
export function unknownExit(a: Pick<Adapter, 'tool'>, code: number | null): ExitSignal {
  return { kind: 'tool_error', reason: reason('adapter.reason.unknownExit', { tool: a.tool, code: code ?? -1 }) };
}

/** A report the template asked for and the tool did not write (C-15: «تقرير متوقع غاب»). */
export function reportMissing(a: Pick<Adapter, 'tool'>, name: string): ReportProblem {
  return { code: 'missing', file: name, detail: `${a.tool} did not write ${name}` };
}

/** The first lines of an output that look like an error, for a reason (best effort; the full log is the evidence). */
export function firstErrorLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => /error|failed|cannot|invalid|unexpected|not found/i.test(l)) ?? text.trim().split('\n')[0] ?? '';
  return cleanMessage(line, 300);
}
