// code.size and code.complexity (C-13). The size of the build output against the budgets the profile declares (in
// total, per entry, per type; raw and gzipped): a budget exceeded is a proven violation, the sizes and the largest
// files are always shown as information; with no budget, «ناقص إعداد», and a large bundle never proves unused code.
// The maintenance indicators: the cyclomatic complexity (counted as ESLint's `complexity` rule counts it) and the
// length of each function, parsed with @babel/parser (8.0.7, MIT) without running anything; suggestions only, and
// none without a threshold (10.3: «لا عتبة افتراضية، فلا اكتشافات دون إعداد»).
import { finding, pushFinding } from '@ayar/adapters';
import { parse } from '@babel/parser';
import { posix } from 'node:path';
import { checkCancel, factValues, OK, readOrSay, refValue, report, type Analyzer, type AnalyzerInput } from './common.ts';
import { globMatch } from './design.ts';

// ── code.size ───────────────────────────────────────────────────────────────────────────────────────────────

/** `200 KB`, `1.5 MiB`, `5000` (bytes): kB/KB are 1000, KiB 1024 (size-limit's units). */
export function parseSize(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v !== 'string') return null;
  const m = /^\s*([\d.]+)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? 'B';
  const mult: Record<string, number> = { B: 1, kB: 1000, KB: 1000, KiB: 1024, MB: 1e6, MiB: 1048576, GB: 1e9, GiB: 1073741824 };
  return Number.isFinite(n) ? Math.round(n * mult[unit]!) : null;
}

interface Budget {
  label: string;
  files: (f: string) => boolean;
  limit: number;
  gzip: boolean;
}

function budgetsOf(i: AnalyzerInput, outDir: string): Budget[] | null {
  const v = refValue(i, 'budgets');
  const rel = (f: string) => posix.relative(outDir, f);
  // Discovered: a size-limit configuration ([{ path, limit, gzip }], gzip by default).
  if (typeof v === 'string') {
    const text = i.read(v);
    let list: unknown = null;
    try {
      list = text === null ? null : (v.endsWith('package.json') ? (JSON.parse(text) as Record<string, unknown>)['size-limit'] : JSON.parse(text));
    } catch {
      return null;
    }
    if (!Array.isArray(list)) return null;
    return list.flatMap((e: unknown) => {
      const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {};
      const paths = (Array.isArray(o.path) ? o.path : [o.path]).filter((p): p is string => typeof p === 'string');
      const limit = parseSize(o.limit);
      if (!paths.length || limit === null) return [];
      return [{ label: typeof o.name === 'string' ? o.name : paths.join(', '), files: (f: string) => paths.some((p) => globMatch(p.replace(/^\.\//, ''), f) || globMatch(p.replace(/^\.\//, ''), rel(f))), limit, gzip: o.gzip !== false }];
    });
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const gzip = o.gzip === true;
  const out: Budget[] = [];
  const total = parseSize(o.total);
  if (total !== null) out.push({ label: 'total', files: () => true, limit: total, gzip });
  for (const [type, lim] of Object.entries(o.byType && typeof o.byType === 'object' ? (o.byType as Record<string, unknown>) : {})) {
    const n = parseSize(lim);
    if (n !== null) out.push({ label: `*.${type}`, files: (f) => f.toLowerCase().endsWith(`.${type.toLowerCase()}`), limit: n, gzip });
  }
  for (const [glob, lim] of Object.entries(o.entries && typeof o.entries === 'object' ? (o.entries as Record<string, unknown>) : {})) {
    const n = parseSize(lim);
    if (n !== null) out.push({ label: glob, files: (f) => globMatch(glob, rel(f)) || globMatch(glob, f), limit: n, gzip });
  }
  return out.length ? out : null;
}

export const sizeAnalyzer: Analyzer = {
  id: 'size',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.size',
  run(i) {
    const r = report(this, ['sizes']);
    const out = factValues(i, 'references.buildOutput').map((f) => f.dir).find((d): d is string => typeof d === 'string') ?? (i.component === '.' ? 'dist' : `${i.component}/dist`);
    const budgets = budgetsOf(i, out);
    if (!budgets) return { report: r, exit: { kind: 'missing', reason: { key: 'analyzer.reason.noBudgets' } } };
    const files = i.listDir(out);
    if (!files || !files.length) return { report: r, exit: { kind: 'tool_error', reason: { key: 'analyzer.reason.noOutput', params: { path: out } } } };
    const sizes = files.map((f) => ({ f, raw: i.size(f) ?? 0, gz: null as number | null }));
    const gz = (s: (typeof sizes)[number]) => (s.gz ??= i.gzipSize(s.f) ?? s.raw);
    for (const b of budgets) {
      checkCancel(i);
      const matched = sizes.filter((s) => b.files(s.f));
      const actual = matched.reduce((n, s) => n + (b.gzip ? gz(s) : s.raw), 0);
      if (actual > b.limit) pushFinding(r, finding({ rule: 'size.over-budget', message: `${b.label}: ${actual} bytes${b.gzip ? ' gzipped' : ''}, over the budget of ${b.limit}`, location: { path: out }, anchor: { kind: 'text', value: `budget:${b.label}` }, expected: String(b.limit), actual: String(actual) }));
    }
    // Information, always: the sizes and the largest files.
    const total = sizes.reduce((n, s) => n + s.raw, 0);
    const top = [...sizes].sort((a, b) => b.raw - a.raw).slice(0, 5);
    pushFinding(r, finding({ rule: 'size.info', message: `${files.length} files, ${total} bytes; largest: ${top.map((s) => `${posix.relative(out, s.f)} ${s.raw}`).join(', ')}`, location: { path: out }, anchor: { kind: 'text', value: 'sizes' } }));
    r.info.totalBytes = total;
    r.info.files = files.length;
    return { report: r, exit: OK };
  },
};

// ── code.complexity ─────────────────────────────────────────────────────────────────────────────────────────

type Node = { type: string; loc?: { start: { line: number; column: number }; end: { line: number } }; [k: string]: unknown };

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);

/** What adds a path (ESLint's `complexity`): branches, loops, catch, logical operators, defaults, optional chains. */
function adds(n: Node): number {
  switch (n.type) {
    case 'IfStatement':
    case 'ConditionalExpression':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'CatchClause':
    case 'AssignmentPattern':
      return 1;
    case 'SwitchCase':
      return n.test ? 1 : 0;
    case 'LogicalExpression':
      return 1;
    case 'AssignmentExpression':
      return ['&&=', '||=', '??='].includes(String(n.operator)) ? 1 : 0;
    case 'OptionalMemberExpression':
    case 'OptionalCallExpression':
      return n.optional ? 1 : 0;
    default:
      return 0;
  }
}

export interface FunctionMeasure {
  name: string;
  line: number;
  complexity: number;
  lines: number;
}

function nameOf(fn: Node, parent: Node | null): string {
  const id = fn.id as Node | null | undefined;
  if (id && typeof id.name === 'string') return id.name;
  const key = fn.key as Node | undefined;
  if (key && typeof key.name === 'string') return key.name;
  if (parent?.type === 'VariableDeclarator' && typeof (parent.id as Node | undefined)?.name === 'string') return String((parent.id as Node).name);
  if (parent?.type === 'ObjectProperty' && typeof (parent.key as Node | undefined)?.name === 'string') return String((parent.key as Node).name);
  return '(anonymous)';
}

/** Each function of a JS or TS source with its complexity and length; null when the source cannot be parsed. */
export function measureFunctions(code: string, file: string): FunctionMeasure[] | null {
  let ast: Node;
  try {
    const plugins: ('typescript' | 'jsx')[] = /\.tsx$/.test(file) ? ['typescript', 'jsx'] : /\.(ts|mts|cts)$/.test(file) ? ['typescript'] : ['jsx'];
    ast = parse(code, { sourceType: 'unambiguous', plugins, errorRecovery: false }) as unknown as Node;
  } catch {
    return null;
  }
  const out: FunctionMeasure[] = [];
  // A function counts what is inside it and not inside a nested function (ESLint measures each one apart).
  const walk = (node: unknown, parent: Node | null, current: { m: FunctionMeasure } | null): void => {
    if (Array.isArray(node)) {
      for (const c of node) walk(c, parent, current);
      return;
    }
    if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') return;
    const n = node as Node;
    let here = current;
    if (FUNCTIONS.has(n.type) && n.loc) {
      const m: FunctionMeasure = { name: nameOf(n, parent), line: n.loc.start.line, complexity: 1, lines: n.loc.end.line - n.loc.start.line + 1 };
      out.push(m);
      here = { m };
    } else if (here) here.m.complexity += adds(n);
    for (const [k, v] of Object.entries(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
      if (v && typeof v === 'object') walk(v, n, here);
    }
  };
  walk(ast, null, null);
  return out;
}

export const complexityAnalyzer: Analyzer = {
  id: 'complexity',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.complexity',
  run(i) {
    const r = report(this, ['babel-ast']);
    const t = i.thresholds ?? {};
    const maxComplexity = Number(t.complexity ?? t.cyclomatic);
    const maxLines = Number(t.maxLines ?? t.length);
    const hasC = Number.isFinite(maxComplexity) && maxComplexity > 0;
    const hasL = Number.isFinite(maxLines) && maxLines > 0;
    const files = i.files.filter((f) => /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(f) && !/\.d\.ts$/.test(f) && !/(^|\/)(node_modules|dist|build|coverage)\//.test(f));
    r.info.thresholds = { complexity: hasC ? maxComplexity : null, maxLines: hasL ? maxLines : null };
    if (!hasC && !hasL) {
      r.info.files = files.length;
      return { report: r, exit: OK };
    }
    for (const file of files) {
      checkCancel(i);
      const code = readOrSay(i, r, file);
      if (code === null) continue;
      const measures = measureFunctions(code, file);
      if (!measures) {
        pushFinding(r, finding({ rule: 'analysis.unparsable-file', origin: 'tool', message: `${file} could not be parsed`, location: { path: file }, anchor: { kind: 'text', value: file } }));
        continue;
      }
      for (const m of measures) {
        if (hasC && m.complexity > maxComplexity) pushFinding(r, finding({ rule: 'complexity.cyclomatic', toolRule: 'complexity', message: `${m.name}: complexity ${m.complexity} above ${maxComplexity}`, location: { path: file, line: m.line }, anchor: { kind: 'code', value: '' }, expected: String(maxComplexity), actual: String(m.complexity) }));
        if (hasL && m.lines > maxLines) pushFinding(r, finding({ rule: 'complexity.length', toolRule: 'max-lines-per-function', message: `${m.name}: ${m.lines} lines above ${maxLines}`, location: { path: file, line: m.line }, anchor: { kind: 'code', value: '' }, expected: String(maxLines), actual: String(m.lines) }));
      }
    }
    r.info.files = files.length;
    return { report: r, exit: OK };
  },
};
