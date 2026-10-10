// JUnit XML as AYAR reads it (Vitest, node:test, pytest, Playwright, and a custom check that declares one): the
// test cases, each passed, failed, errored or skipped, with its full name, its file and line when the report has
// them, and the failure's message. Counts come from the cases themselves, not from the attributes or the comments
// a reporter adds, so a report cannot claim more than it shows.
import { descendants, readXml, type XmlElement } from './xml.ts';
import { problem, type Read } from './guards.ts';

export interface JUnitCase {
  /** `classname › name`, or the name alone. */
  fullName: string;
  name: string;
  classname: string;
  file: string | null;
  line: number | null;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  /** The names of the suites around it, outermost first (the root's excluded). */
  suites: string[];
  /** The failure's or error's message attribute, else its text's first line. */
  message: string;
  /** The failure's or error's full text (a traceback). */
  detail: string;
}

export interface JUnit {
  cases: JUnitCase[];
  /** `<error>` outside any case (a suite that failed to load). */
  suiteErrors: string[];
  /** The name of the root and of the suites (Vitest's «vitest unhandled errors» suite). */
  suites: string[];
}

function caseOf(tc: XmlElement, suites: string[]): JUnitCase {
  const name = tc.attrs.name ?? '';
  const classname = tc.attrs.classname ?? '';
  const failure = tc.children.find((c) => c.name === 'failure');
  const error = tc.children.find((c) => c.name === 'error');
  const skipped = tc.children.some((c) => c.name === 'skipped');
  const bad = failure ?? error;
  const detail = bad ? bad.text.trim() : '';
  const line = Number(tc.attrs.line);
  return {
    fullName: classname && classname !== name ? `${classname} › ${name}` : name,
    name,
    classname,
    file: tc.attrs.file ?? null,
    line: Number.isInteger(line) && line > 0 ? line : null,
    status: failure ? 'failed' : error ? 'error' : skipped ? 'skipped' : 'passed',
    suites,
    message: bad ? (bad.attrs.message ?? detail.split('\n')[0] ?? '') : '',
    detail,
  };
}

export function readJUnit(text: string, file: string): Read<JUnit> {
  const x = readXml(text, file);
  if (!x.ok) return x;
  const root = x.value;
  if (root.name !== 'testsuites' && root.name !== 'testsuite') return problem('unsupported', file, `a JUnit report starts with <testsuites> or <testsuite>, not <${root.name}>`);
  const cases: JUnitCase[] = [];
  const walk = (el: XmlElement, path: string[]) => {
    for (const c of el.children) {
      if (c.name === 'testcase') cases.push(caseOf(c, path));
      else if (c.name === 'testsuite') walk(c, [...path, c.attrs.name ?? ''].filter(Boolean));
    }
  };
  walk(root, root.name === 'testsuite' && root.attrs.name ? [root.attrs.name] : []);
  const suites = [root, ...descendants(root, 'testsuite')].map((s) => s.attrs.name ?? '').filter(Boolean);
  const suiteErrors = [root, ...descendants(root, 'testsuite')].flatMap((s) => s.children.filter((c) => c.name === 'error').map((e) => (e.attrs.message ?? e.text).trim()));
  return { ok: true, value: { cases, suiteErrors, suites } };
}
