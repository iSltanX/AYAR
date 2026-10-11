// C-15 for each adapter, on the shapes of the real reports (taken from the tools on FX-ADAPTERS, E-07): the choice of
// the adapter and its final command shown literally (flags after `--` for npm, as they are for pnpm; a composite
// script's suggestion), and its exit map with its report reading, row by row of AT-14's table. The real tools run in
// at14.test.ts; here the adapters alone, deterministic and fast.
import type { CheckSpec, ExitSignal, ParsedReport } from '@ayar/protocol';
import { describe, expect, it } from 'vitest';
import { adapterById, adapterFor, cvssSeverity, junitFlags, semgrepRuleId, splitScript, programOf, type Adapter, type ParseContext, type ReportFile, type SpecInput } from '../src/index.ts';

const ROOT = '/p';

function spec(o: Partial<SpecInput> & Pick<SpecInput, 'checkId'>): SpecInput {
  return { component: '.', section: 'behavior', command: null, tool: null, runner: { kind: 'adapter', ids: ['vitest', 'jest', 'node-test', 'pytest'] }, thresholds: null, customSuccess: null, references: [], referenceValues: {}, ...o };
}
const script = (pm: string, name: string, text: string): CheckSpec['command'] => ({ argv: [pm, 'run', name], cwd: '.', script: { name, text, pre: null, post: null, composite: /&&|\|\||;/.test(text), referenced: [] }, from: 'script' });
const tool = (...argv: string[]): CheckSpec['command'] => ({ argv, cwd: '.', script: null, from: 'tool' });

function ctx(o: { files?: Record<string, string>; stdout?: string; stderr?: string; project?: Record<string, string>; checkId?: string; thresholds?: Record<string, unknown> | null; customSuccess?: unknown; count?: number; cwd?: string; steps?: number }): ParseContext {
  const files: ReportFile[] = Object.entries(o.files ?? {}).map(([k, text]) => {
    const slash = k.indexOf('/');
    return { name: slash > 0 ? k.slice(slash + 1) : k, step: slash > 0 ? Number(k.slice(0, slash)) : 1, text, size: text.length, truncated: false };
  });
  const project = o.project ?? {};
  return { root: ROOT, cwd: o.cwd ?? ROOT, component: '.', checkId: o.checkId ?? 'beh.unit', files, stdout: o.stdout ?? '', stderr: o.stderr ?? '', read: (rel) => project[rel] ?? null, countFiles: () => o.count ?? 1, thresholds: o.thresholds ?? null, outputs: [], exists: (rel) => rel in project, customSuccess: (o.customSuccess ?? null) as CheckSpec['customSuccess'], projectReport: (rel) => (rel in project ? { text: project[rel]!, problem: null, size: project[rel]!.length } : { text: null, problem: 'missing', size: null }) };
}
const exitOf = (code: number | null, steps?: (number | null)[]) => ({ exitCode: code, signal: null, steps: (steps ?? [code]).map((c, i) => ({ n: i + 1, exitCode: c, ended: 'exited' })) });
function run(a: Adapter, c: ParseContext, code: number | null, steps?: (number | null)[]): { report: ParsedReport; exit: ExitSignal } {
  const e = exitOf(code, steps);
  const report = a.parseReports(c, e);
  return { report, exit: a.exitMap(e, report, c) };
}
const A = (id: string) => adapterById(id)!;

describe('the shell of a script (C-15 «السكربت المركب»)', () => {
  it('splits commands and finds the program under the wrappers', () => {
    expect(splitScript('node scripts/prepare.mjs && node --test --test-reporter=spec')).toEqual([['node', 'scripts/prepare.mjs'], ['node', '--test', '--test-reporter=spec']]);
    expect(splitScript(`FOO="a b" vitest run | tee out; echo 'x && y'`)).toEqual([['FOO=a b', 'vitest', 'run'], ['tee', 'out'], ['echo', 'x && y']]);
    expect(programOf(['cross-env', 'CI=1', 'npx', '--no-install', 'vitest', 'run'])).toEqual({ program: 'vitest', args: ['run'] });
    expect(programOf(['uv', 'run', '--no-sync', '--offline', '--', 'python', '-m', 'pytest'])).toEqual({ program: 'pytest', args: [] });
    expect(programOf(['.venv/bin/python', '-m', 'mypy', 'src'])).toEqual({ program: 'mypy', args: ['src'] });
    expect(programOf(['node', '--test'])).toEqual({ program: 'node-test', args: ['--test'] });
    expect(programOf(['pnpm', 'exec', 'eslint', '.'])).toEqual({ program: 'eslint', args: ['.'] });
  });
});

describe('the final command, literally (C-15 buildInvocation)', () => {
  it('appends after `--` for npm, as they are for pnpm (pnpm 12 passes a literal `--` on)', () => {
    const npm = adapterFor(spec({ checkId: 'beh.unit', command: script('npm', 'test', 'vitest run') }));
    expect(npm?.adapter?.id).toBe('vitest');
    expect(npm && 'template' in npm && npm.template.argv).toEqual(['npm', 'run', 'test', '--', '--reporter=default', '--reporter=json', '--reporter=junit', '--outputFile.json={reports}/vitest.json', '--outputFile.junit={reports}/junit.xml', '--update=none']);
    const pnpm = adapterFor(spec({ checkId: 'beh.unit', command: script('pnpm', 'test', 'vitest') }));
    expect(pnpm && 'template' in pnpm && pnpm.template.argv.slice(0, 5)).toEqual(['pnpm', 'run', 'test', '--run', '--reporter=default']);
  });

  it('reaches the tool of a composite script when it is the last command, and suggests the direct call (AT-34)', () => {
    const c = adapterFor(spec({ checkId: 'beh.unit', command: script('npm', 'test', 'node scripts/prepare.mjs && node --test --test-reporter=spec') }));
    expect(c && 'template' in c && c.adapter.id).toBe('node-test');
    if (!c || !('template' in c)) throw new Error('no template');
    expect(c.template.argv).toEqual(['npm', 'run', 'test', '--', '--test-reporter-destination=stdout', '--test-reporter=junit', '--test-reporter-destination={reports}/junit.xml']);
    expect(c.template.suggestion).toEqual({ argv: ['node', '--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', '--test-reporter-destination={reports}/junit.xml'], reason: 'adapter.suggest.directCall' });
    // The tool is not last: the script runs as approved and asks for no report; the direct call is suggested.
    const u = adapterFor(spec({ checkId: 'beh.unit', command: script('pnpm', 'test', 'vitest run && echo done') }));
    if (!u || !('template' in u)) throw new Error('no template');
    expect(u.template).toMatchObject({ argv: ['pnpm', 'run', 'test'], reports: [], suggestion: { argv: ['vitest', 'run', '--reporter=default', '--reporter=json', '--reporter=junit', '--outputFile.json={reports}/vitest.json', '--outputFile.junit={reports}/junit.xml', '--update=none'] } });
  });

  it('extends a tool call, and repeats beh.stability\'s attempts (5 by default)', () => {
    const py = adapterFor(spec({ checkId: 'beh.unit', command: tool('.venv/bin/python', '-m', 'pytest') }));
    expect(py && 'template' in py && py.template.argv).toEqual(['.venv/bin/python', '-m', 'pytest', '--junit-xml={reports}/junit.xml', '-p', 'no:cacheprovider']);
    const st = adapterFor(spec({ checkId: 'beh.stability', command: tool('pnpm', 'exec', 'vitest', 'run') }));
    expect(st && 'template' in st && st.template.repeat).toBe(5);
    const st3 = adapterFor(spec({ checkId: 'beh.stability', command: tool('pnpm', 'exec', 'vitest', 'run'), thresholds: { repeats: 3 } }));
    expect(st3 && 'template' in st3 && st3.template.repeat).toBe(3);
  });

  it('builds the managed tools\' invocations whole, from a neutral folder for Semgrep and OSV (D-DEV2-01, E-09)', () => {
    const sg = adapterFor(spec({ checkId: 'sec.sast', section: 'security', runner: { kind: 'adapter', ids: ['semgrep'] }, tool: { key: 'semgrep', source: 'managed', runtime: null, path: null } }), { configs: { semgrep: '.semgrep.yml' } });
    if (!sg || !('template' in sg)) throw new Error('no template');
    expect(sg.template).toMatchObject({ cwd: '{tmp}', prepare: ['semgrep-rules', 'nogit'], targets: { batchBytes: 524288 }, env: { PATH: '{nogit}:{path}', HOME: '{tmp}/home' } });
    expect(sg.template.argv).toEqual(['{tool}', 'scan', '--no-git-ignore', '--config', '{tmp}/ayar-rules.yml', '--config', '{root}/.semgrep.yml', '--metrics=off', '--disable-version-check', '--json-output={reports}/semgrep.json', '--sarif-output={reports}/semgrep.sarif', '--quiet', '{targets}']);
    const os = adapterFor(spec({ checkId: 'sec.deps', section: 'security', runner: { kind: 'adapter', ids: ['osv-scanner'] }, tool: { key: 'osv-scanner', source: 'managed', runtime: null, path: null } }));
    expect(os && 'template' in os && os.template).toMatchObject({ cwd: '{tmp}', env: { OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: '{osvdb}' }, argv: ['{tool}', 'scan', 'source', '-r', '{root}', '--offline', '--no-call-analysis=all', '--format', 'json', '--output-file', '{reports}/osv.json'] });
    const hist = adapterFor(spec({ checkId: 'sec.secrets.history', section: 'security', runner: { kind: 'adapter', ids: ['betterleaks', 'gitleaks'] }, tool: { key: 'betterleaks', source: 'managed', runtime: null, path: null } }));
    expect(hist && 'template' in hist && hist.template).toMatchObject({ cwd: '{tmp}', prepare: ['git-shadow'], env: { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, argv: ['{tool}', 'git', '{shadow}', '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', '{reports}/betterleaks.json', '--exit-code', '42'] });
  });

  it('says why when no adapter knows the tool (mocha runs as a custom check, 10.3)', () => {
    expect(adapterFor(spec({ checkId: 'beh.unit', command: script('npm', 'test', 'mocha') }))).toEqual({ adapter: null, reason: { key: 'adapter.reason.noAdapter', params: { tool: 'mocha' } } });
    expect(adapterFor(spec({ checkId: 'code.refs.local', runner: { kind: 'analyzer', ids: ['refs-local'] } }))).toBeNull();
  });

  it('pairs node:test\'s reporters with destinations (E-07)', () => {
    expect(junitFlags(['--test'])).toEqual(['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', '--test-reporter-destination={reports}/junit.xml']);
    expect(junitFlags(['--test', '--test-reporter=tap', '--test-reporter-destination=out.tap'])).toEqual(['--test-reporter=junit', '--test-reporter-destination={reports}/junit.xml']);
    expect(junitFlags(['--test', '--test-reporter=tap', '--test-reporter=spec'])).toBeNull();
  });
});

// ── AT-14, row by row, on the reports' shapes ────────────────────────────────────────────────────────────────

const vitestJson = (tests: { title: string; status: string; msg?: string }[], fileStatus = 'passed') =>
  JSON.stringify({ numTotalTests: tests.length, numFailedTests: tests.filter((t) => t.status === 'failed').length, testResults: tests.length ? [{ name: `${ROOT}/test/add.test.js`, status: fileStatus, message: '', assertionResults: tests.map((t) => ({ ancestorTitles: [], title: t.title, status: t.status, failureMessages: t.msg ? [t.msg] : [] })) }] : [] });
const TEST_FILE = { 'test/add.test.js': "import { it } from 'vitest';\n\nit('يجمع عددين', () => {\n  expect(1).toBe(2);\n});\n" };

describe('Vitest (AT-14)', () => {
  const v = A('vitest');
  it('two tests of one name in one run, one failing: a failure, never «متذبذب» (review M2)', () => {
    const { report } = run(v, ctx({ files: { 'vitest.json': vitestJson([{ title: 'x', status: 'passed' }, { title: 'x', status: 'failed', msg: 'boom' }]) } }), 1);
    expect(report).toMatchObject({ signals: { flaky: false }, tests: { total: 2, passed: 1, failed: 1, flaky: 0 } });
    expect(report.findings.map((x) => x.rule)).toEqual(['test.failed']);
  });
  it('the only test file failing to load is the project\'s failure, not the tool\'s (review minor 3)', () => {
    const broken = JSON.stringify({ numTotalTests: 0, testResults: [{ name: `${ROOT}/test/add.test.js`, status: 'failed', message: 'Failed to parse source for import analysis', assertionResults: [] }] });
    const r = run(v, ctx({ files: { 'vitest.json': broken } }), 1);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings.map((x) => [x.rule, x.location?.path])).toEqual([['test.collection-error', 'test/add.test.js']]);
  });
  it('a test that prints «No test files found» does not hide its report (review M3)', () => {
    const r = run(v, ctx({ files: { 'vitest.json': vitestJson([{ title: 'a', status: 'failed', msg: 'x' }]) }, stdout: 'No test files found' }), 1);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.signals.noInputs).toBe(false);
  });
  it('a failing test is a failure, at its line', () => {
    const { report, exit } = run(v, ctx({ files: { 'vitest.json': vitestJson([{ title: 'يجمع عددين', status: 'failed', msg: 'expected 5 to be 6' }]) }, project: TEST_FILE }), 1);
    expect(exit).toEqual({ kind: 'ok' });
    expect(report.findings).toEqual([expect.objectContaining({ rule: 'test.failed', location: { path: 'test/add.test.js', line: 3 }, anchor: { kind: 'test', value: 'test/add.test.js › يجمع عددين' } })]);
  });
  it('«No test files found» is «ناقص»', () => {
    expect(run(v, ctx({ files: { 'vitest.json': vitestJson([]) }, stderr: '\u001b[31mNo test files found, exiting with code 1\u001b[39m' }), 1).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.noTestFiles' } });
  });
  it('a run that stopped before any test (an environment that does not load) is the tool\'s', () => {
    const junit = '<testsuites><testsuite name="vitest unhandled errors"><testcase classname="vitest unhandled errors" name="Unhandled Error"><error message="Failed to start forks worker">x</error></testcase></testsuite></testsuites>';
    expect(run(v, ctx({ files: { 'vitest.json': vitestJson([]), 'junit.xml': junit } }), 1).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.stoppedBeforeTests' } });
  });
  it('exit 0 with a failure in the report is «تعارض الأدلة»; exit 1 with all passing too', () => {
    expect(run(v, ctx({ files: { 'vitest.json': vitestJson([{ title: 'a', status: 'failed' }]) } }), 0).exit).toMatchObject({ kind: 'conflict', reason: { key: 'adapter.reason.conflictExitPass' } });
    expect(run(v, ctx({ files: { 'vitest.json': vitestJson([{ title: 'a', status: 'passed' }]) } }), 1).exit).toMatchObject({ kind: 'conflict', reason: { key: 'adapter.reason.conflictExitFail' } });
  });
  it('a report that is missing, or over the limit, is a problem (the classifier: «تعذّر»)', () => {
    expect(run(v, ctx({}), 1).report.problems).toEqual([expect.objectContaining({ code: 'missing', file: 'vitest.json' })]);
    const c = ctx({ files: { 'vitest.json': '{}' } });
    (c.files as ReportFile[])[0] = { name: 'vitest.json', step: 1, text: null, size: 60 * 1024 * 1024, truncated: true };
    expect(run(v, c, 0).report.problems).toEqual([expect.objectContaining({ code: 'too_large' })]);
  });
  it('beh.stability: attempts that disagree are flaky; a failure in every attempt is a failure (AT-15)', () => {
    const pass = vitestJson([{ title: 'x', status: 'passed' }]);
    const fail = vitestJson([{ title: 'x', status: 'failed' }]);
    const flaky = run(v, ctx({ checkId: 'beh.stability', files: { '1/vitest.json': fail, '2/vitest.json': pass, '3/vitest.json': fail } }), 1, [1, 0, 1]);
    expect(flaky.exit).toEqual({ kind: 'ok' });
    expect(flaky.report).toMatchObject({ signals: { flaky: true }, tests: { total: 1, flaky: 1, failed: 0 } });
    expect(flaky.report.findings.map((f) => f.rule)).toEqual(['test.flaky']);
    const steady = run(v, ctx({ checkId: 'beh.stability', files: { '1/vitest.json': fail, '2/vitest.json': fail } }), 1, [1, 1]);
    expect(steady.report).toMatchObject({ signals: { flaky: false }, tests: { failed: 1 } });
    expect(run(v, ctx({ checkId: 'beh.stability', files: { '1/vitest.json': fail, '2/vitest.json': pass } }), 0, [0, 0]).exit).toMatchObject({ kind: 'conflict' });
  });
});

describe('Jest, node:test, Playwright, pytest (AT-14)', () => {
  it('Jest: «No tests found» is «ناقص»; no report without it is the tool\'s configuration', () => {
    expect(run(A('jest'), ctx({ stdout: 'No tests found, exiting with code 1' }), 1).exit).toMatchObject({ kind: 'missing' });
    expect(run(A('jest'), ctx({ stderr: '● Validation Error: Test environment no-such-environment cannot be found.' }), 1).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.configError' } });
  });
  it('node:test: exit 0 with no test is «ناقص» (7.3 rule 3); a failure at its line', () => {
    expect(run(A('node-test'), ctx({ files: { 'junit.xml': '<testsuites>\n<!-- tests 0 -->\n</testsuites>' } }), 0).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.noTestsRan' } });
    const junit = `<testsuites><testcase name="يجمع عددين" classname="test" file="${ROOT}/test/add.test.js"><failure message="5 !== 6">x</failure></testcase></testsuites>`;
    const r = run(A('node-test'), ctx({ files: { 'junit.xml': junit }, project: TEST_FILE }), 1);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings[0]).toMatchObject({ rule: 'test.failed', location: { path: 'test/add.test.js', line: 3 } });
  });
  it('Playwright: flaky is a signal; «No tests found» is «ناقص»; no report is the configuration', () => {
    const pw = (tests: { status: string }[], errors: unknown[] = []) => JSON.stringify({ config: { rootDir: `${ROOT}/tests` }, suites: [{ title: 'a.spec.js', file: 'a.spec.js', specs: [{ title: 'رحلة', file: 'a.spec.js', line: 4, tests: tests.map((t) => ({ projectName: '', status: t.status, results: [{ status: t.status === 'flaky' ? 'failed' : 'passed', retry: 0 }] })) }] }], errors });
    const f = run(A('playwright'), ctx({ files: { 'playwright.json': pw([{ status: 'flaky' }]) } }), 0);
    expect(f.exit).toEqual({ kind: 'ok' });
    expect(f.report).toMatchObject({ signals: { flaky: true }, tests: { flaky: 1 } });
    expect(f.report.findings[0]).toMatchObject({ rule: 'test.flaky', location: { path: 'tests/a.spec.js', line: 4 } });
    expect(run(A('playwright'), ctx({ files: { 'playwright.json': JSON.stringify({ suites: [], errors: [{ message: 'Error: No tests found' }] }) } }), 1).exit).toMatchObject({ kind: 'missing' });
    expect(run(A('playwright'), ctx({ stderr: 'SyntaxError: playwright.config.js: Unexpected token (6:13)' }), 1).exit).toMatchObject({ kind: 'tool_error' });
    // A beforeAll above the test that timed out: shown where it failed; an assertion inside the test: at the test.
    const hook = (errorLine: number) => JSON.stringify({ config: { rootDir: `${ROOT}/tests` }, suites: [{ title: 'a.spec.js', file: 'a.spec.js', specs: [{ title: 'رحلة', file: 'a.spec.js', line: 23, tests: [{ projectName: '', status: 'unexpected', results: [{ status: 'timedOut', error: { message: 'timeout', location: { file: `${ROOT}/tests/a.spec.js`, line: errorLine, column: 6 } } }] }] }] }], errors: [] });
    expect(run(A('playwright'), ctx({ files: { 'playwright.json': hook(9) } }), 1).report.findings[0]).toMatchObject({ rule: 'test.failed', location: { path: 'tests/a.spec.js', line: 9 } });
    expect(run(A('playwright'), ctx({ files: { 'playwright.json': hook(24) } }), 1).report.findings[0]).toMatchObject({ rule: 'test.failed', location: { path: 'tests/a.spec.js', line: 23 } });
  });
  it('pytest: 1 failures, 2 with a collection error the project\'s, 4 and 3 the tool\'s, 5 «ناقص», 0 with a failure a conflict', () => {
    const py = { 'tests/test_add.py': 'from add import add\n\n\ndef test_add() -> None:\n    assert add(2, 3) == 6\n' };
    const fail = '<testsuites><testsuite name="pytest" tests="1"><testcase classname="tests.test_add" name="test_add"><failure message="assert 5 == 6">tests/test_add.py:5: AssertionError</failure></testcase></testsuite></testsuites>';
    const p1 = run(A('pytest'), ctx({ files: { 'junit.xml': fail }, project: py }), 1);
    expect(p1.exit).toEqual({ kind: 'ok' });
    expect(p1.report.findings[0]).toMatchObject({ rule: 'test.failed', location: { path: 'tests/test_add.py', line: 4 } });
    const coll = '<testsuites><testsuite name="pytest" errors="1"><testcase classname="" name="tests.test_add"><error message="collection failure">E     File "/p/tests/test_add.py", line 4</error></testcase></testsuite></testsuites>';
    const p2 = run(A('pytest'), ctx({ files: { 'junit.xml': coll }, project: py }), 2);
    expect(p2.exit).toEqual({ kind: 'ok' });
    expect(p2.report.findings[0]).toMatchObject({ rule: 'test.collection-error', location: { path: 'tests/test_add.py', line: 4 } });
    expect(run(A('pytest'), ctx({}), 4).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.pytestUsage' } });
    expect(run(A('pytest'), ctx({}), 3).exit).toMatchObject({ kind: 'tool_error' });
    expect(run(A('pytest'), ctx({ files: { 'junit.xml': '<testsuites><testsuite name="pytest" tests="0"/></testsuites>' } }), 5).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.pytestNoTests' } });
    expect(run(A('pytest'), ctx({ files: { 'junit.xml': fail }, project: py }), 0).exit).toMatchObject({ kind: 'conflict' });
    expect(run(A('pytest'), ctx({ files: { 'junit.xml': '<testsuites><testsuite name="pytest" tests="1"><testcase classname="tests.test_add" name="test_add"/></testsuite></testsuites>' }, project: py }), 2).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.pytestInterrupted' } });
  });
});

describe('the linters and type checkers (AT-14)', () => {
  it('ESLint: 2 is the tool\'s; errors fail, warnings are the policy\'s', () => {
    expect(run(A('eslint'), ctx({ stderr: 'Oops! Something went wrong!' }), 2).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.configError', params: { tool: 'eslint', code: 2 } } });
    const r = run(A('eslint'), ctx({ files: { 'eslint.json': JSON.stringify([{ filePath: `${ROOT}/src/a.js`, messages: [{ ruleId: 'no-unused-vars', severity: 2, message: 'x', line: 2, column: 9 }, { ruleId: 'no-console', severity: 1, message: 'y', line: 3, column: 1 }] }]) } }), 1);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings.map((f) => [f.rule, f.toolRule, f.location])).toEqual([['lint.error', 'no-unused-vars', { path: 'src/a.js', line: 2, column: 9 }], ['lint.warning', 'no-console', { path: 'src/a.js', line: 3, column: 1 }]]);
  });
  it('Ruff: 2 is the tool\'s; nothing to check is «ناقص» by AYAR\'s own count', () => {
    expect(run(A('ruff'), ctx({ stderr: 'ruff failed' }), 2).exit).toMatchObject({ kind: 'tool_error' });
    expect(run(A('ruff'), ctx({ files: { 'ruff.json': '[]' }, count: 0 }), 0).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.noInputFiles' } });
    expect(run(A('ruff'), ctx({ files: { 'ruff.json': '[]' }, count: 3 }), 0).exit).toEqual({ kind: 'ok' });
    const bad = run(A('ruff'), ctx({ files: { 'ruff.json': JSON.stringify([{ code: 'F401', message: '`os` imported but unused', filename: `${ROOT}/src/a.py`, location: { row: 1, column: 8 } }]) } }), 1);
    expect(bad.report.findings[0]).toMatchObject({ rule: 'lint.error', toolRule: 'F401', location: { path: 'src/a.py', line: 1, column: 8 } });
  });
  it('Biome: no report is the configuration; nothing processed is the tool\'s (E-07)', () => {
    expect(run(A('biome'), ctx({ stderr: '× Found an unknown key `rulez`.' }), 1).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.configError' } });
    expect(run(A('biome'), ctx({ files: { 'biome.json': JSON.stringify({ summary: { changed: 0, unchanged: 0 }, diagnostics: [] }) } }), 1).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.noFilesProcessed' } });
    const bad = run(A('biome'), ctx({ files: { 'biome.json': JSON.stringify({ summary: { unchanged: 1 }, diagnostics: [{ severity: 'error', message: 'debugger', category: 'lint/suspicious/noDebugger', location: { path: 'src/a.js', start: { line: 2, column: 3 } } }] }) } }), 1);
    expect(bad.report.findings[0]).toMatchObject({ toolRule: 'lint/suspicious/noDebugger', location: { path: 'src/a.js', line: 2, column: 3 } });
  });
  it('tsc: TS6133 fails (the project); TS18003 and TS5083 are the tool\'s (C-15)', () => {
    const bad = run(A('tsc'), ctx({ files: { 'stdout.txt': "src/index.ts(2,9): error TS6133: 'unused' is declared but its value is never read.\n" } }), 2);
    expect(bad.exit).toEqual({ kind: 'ok' });
    expect(bad.report.findings[0]).toMatchObject({ rule: 'types.error', toolRule: 'TS6133', origin: 'project', location: { path: 'src/index.ts', line: 2, column: 9 } });
    expect(run(A('tsc'), ctx({ files: { 'stdout.txt': "error TS18003: No inputs were found in config file '/p/tsconfig.json'.\n" } }), 2).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.tscConfig', params: { code: 'TS18003' } } });
    expect(run(A('tsc'), ctx({ files: { 'stdout.txt': "error TS5083: Cannot read file '/p/missing-base.json'.\n" } }), 2).exit).toMatchObject({ kind: 'tool_error' });
  });
  it('mypy: 2 with a diagnostic in a source file is the project\'s; 2 without one is the tool\'s', () => {
    const syntax = run(A('mypy'), ctx({ files: { 'stdout.txt': '{"file": "src/a.py", "line": 1, "column": 26, "message": "Expected `:`", "code": "syntax", "severity": "error"}\n' } }), 2);
    expect(syntax.exit).toEqual({ kind: 'ok' });
    expect(syntax.report.findings[0]).toMatchObject({ toolRule: 'syntax', location: { path: 'src/a.py', line: 1, column: 27 } });
    expect(run(A('mypy'), ctx({ files: { 'stdout.txt': '' }, stderr: 'mypy.ini: File contains no section headers.' }), 2).exit).toMatchObject({ kind: 'tool_error' });
  });
  it('pyright: nothing analysed is «ناقص»; 3 is the tool\'s', () => {
    expect(run(A('pyright'), ctx({ files: { 'stdout.txt': '$ pyright --outputjson\n{"generalDiagnostics": [], "summary": {"filesAnalyzed": 0}}\n' } }), 0).exit).toMatchObject({ kind: 'missing' });
    expect(run(A('pyright'), ctx({ files: { 'stdout.txt': '{"generalDiagnostics": [], "summary": {"filesAnalyzed": 1}}' } }), 3).exit).toMatchObject({ kind: 'tool_error' });
    const bad = run(A('pyright'), ctx({ files: { 'stdout.txt': JSON.stringify({ generalDiagnostics: [{ file: `${ROOT}/src/a.py`, severity: 'error', message: 'x', range: { start: { line: 4, character: 16 } }, rule: 'reportArgumentType' }], summary: { filesAnalyzed: 1 } }) } }), 1);
    expect(bad.report.findings[0]).toMatchObject({ toolRule: 'reportArgumentType', location: { path: 'src/a.py', line: 5, column: 17 } });
  });
  it('Knip: the unused are suspicions, the unlisted proven; 2 the tool\'s (S-29)', () => {
    const r = run(A('knip'), ctx({ files: { 'stdout.txt': JSON.stringify({ issues: [{ file: 'src/orphan.js', files: [{ name: 'src/orphan.js' }], unlisted: [{ name: 'lodash', line: 1 }] }] }) } }), 1);
    expect(r.report.findings.map((f) => f.rule).sort()).toEqual(['unused.item', 'unused.unlisted']);
    expect(run(A('knip'), ctx({ stdout: 'ERROR: Invalid input (location: entry)' }), 2).exit).toMatchObject({ kind: 'tool_error' });
  });
});

describe('the managed tools (AT-14)', () => {
  it('Semgrep: exit 0 with results is judged by the report; 2 and above the tool\'s; the ids recovered', () => {
    expect(semgrepRuleId('private.tmp.x.sg.ayar.js.eval-dynamic', '/p')).toEqual({ ayar: true, id: 'ayar.js.eval-dynamic' });
    expect(semgrepRuleId('p.rules.no-md5', '/p')).toEqual({ ayar: false, id: 'rules.no-md5' });
    const r = run(A('semgrep'), ctx({ checkId: 'sec.sast', cwd: '/tmp/x', files: { 'semgrep.json': JSON.stringify({ results: [{ check_id: 'ayar.js.eval-dynamic', path: `${ROOT}/src/a.js`, start: { line: 2, col: 10 }, extra: { message: 'eval', severity: 'ERROR', lines: 'requires login' } }], errors: [], paths: { scanned: ['x'] } }) } }), 0);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings[0]).toMatchObject({ rule: 'ayar.js.eval-dynamic', location: { path: 'src/a.js', line: 2, column: 10 }, anchor: { kind: 'code' } });
    expect(run(A('semgrep'), ctx({ checkId: 'sec.sast', stderr: 'invalid configuration' }), 7).exit).toMatchObject({ kind: 'tool_error' });
  });
  it('OSV: 128 «ناقص: لا ملفات قفل» by the output; an extraction error the tool\'s (G-DEV1-03); 127 «ناقص» (E-09)', () => {
    expect(run(A('osv-scanner'), ctx({ stderr: 'No package sources found, --help for usage information.' }), 128).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.noLockfiles' } });
    expect(run(A('osv-scanner'), ctx({ stderr: 'Error during extraction: (extracting as javascript/packagelockjson) x: unexpected end of JSON input\nNo package sources found' }), 128).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.osvExtraction' } });
    expect(run(A('osv-scanner'), ctx({}), 127).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.osvDbMissing' } });
    const osvJson = JSON.stringify({ results: [{ source: { path: `${ROOT}/package-lock.json` }, packages: [{ package: { name: 'ayar-vuln-fake', version: '1.0.0' }, groups: [{ ids: ['AYAR-2026-0001'], max_severity: '9.8' }], vulnerabilities: [{ id: 'AYAR-2026-0001', summary: 's', affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] }] }] }] });
    const r = run(A('osv-scanner'), ctx({ checkId: 'sec.deps', files: { 'osv.json': osvJson }, project: { 'package.json': '{\n  "dependencies": {\n    "ayar-vuln-fake": "1.0.0"\n  }\n}\n' } }), 1);
    expect(r.report.findings[0]).toMatchObject({ rule: 'vuln.known', toolRule: 'AYAR-2026-0001', severity: 'critical', level: 'error', location: { path: 'package.json', line: 3 }, anchor: { kind: 'dependency', value: 'ayar-vuln-fake@1.0.0#AYAR-2026-0001' }, expected: '1.0.1' });
    expect(cvssSeverity(7, '').severity).toBe('high');
    expect(cvssSeverity(null, 'MODERATE').severity).toBe('medium');
    expect(cvssSeverity(null, '')).toEqual({ severity: 'medium', unrated: true });
  });
  it('the secrets scanner: 42 leaks, 0 none, 1 the tool\'s; a leak anchored by its span, never its value', () => {
    const leak = JSON.stringify([{ RuleID: 'generic-api-key', File: 'src/a.js', StartLine: 2, StartColumn: 15, EndColumn: 71, Secret: 'REDACTED', Fingerprint: 'src/a.js:generic-api-key:2' }]);
    const r = run(A('betterleaks'), ctx({ checkId: 'sec.secrets.files', files: { 'betterleaks.json': leak } }), 42);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings[0]).toMatchObject({ rule: 'secret.detected', toolRule: 'generic-api-key', location: { path: 'src/a.js', line: 2, column: 15 }, anchor: { kind: 'secret', value: 'span:2:15:71' } });
    expect(run(A('gitleaks'), ctx({ checkId: 'sec.secrets.files', stderr: 'config error' }), 1).exit).toMatchObject({ kind: 'tool_error' });
    expect(run(A('gitleaks'), ctx({ checkId: 'sec.secrets.files', files: { 'gitleaks.json': leak } }), 0).exit).toMatchObject({ kind: 'conflict' });
    const h = run(A('betterleaks'), ctx({ checkId: 'sec.secrets.history', files: { 'betterleaks.json': JSON.stringify([{ RuleID: 'generic-api-key', File: 'config/old-credentials.js', StartLine: 2, Commit: '29cc486a1a6f00000000', Fingerprint: '29cc486a:config/old-credentials.js:generic-api-key:2' }]) } }), 42);
    expect(h.report.findings[0]).toMatchObject({ location: { path: 'config/old-credentials.js', line: 2, commit: '29cc486a1a6f00000000' }, anchor: { kind: 'secret', value: 'fp:29cc486a:config/old-credentials.js:generic-api-key:2' } });
  });
  it('lychee: 404 proven broken, 403 and a timeout for review, 3 the tool\'s (10.3)', () => {
    const links = JSON.stringify({ error_map: { 'README.md': [{ url: 'http://127.0.0.1:1/gone', status: { text: '404', code: 404 }, span: { line: 3 } }, { url: 'http://127.0.0.1:1/forbidden', status: { text: '403', code: 403 }, span: { line: 4 } }] }, timeout_map: { 'README.md': [{ url: 'http://127.0.0.1:1/hang', status: { text: 'Timeout' }, span: { line: 5 } }] } });
    const r = run(A('lychee'), ctx({ checkId: 'code.refs.external', files: { 'links.json': links } }), 2);
    expect(r.exit).toEqual({ kind: 'ok' });
    expect(r.report.findings.map((f) => [f.rule, f.toolRule, f.location?.line])).toEqual([['link.broken', '404', 3], ['link.unverified', '403', 4], ['link.unverified', 'timeout', 5]]);
    expect(run(A('lychee'), ctx({ checkId: 'code.refs.external' }), 3).exit).toMatchObject({ kind: 'tool_error' });
  });
});

describe('build and custom (AT-14)', () => {
  it('the build: 0 with its outputs passes; anything else fails with the errors from the log', () => {
    expect(run(A('build-command'), ctx({ checkId: 'code.build' }), 0).exit).toEqual({ kind: 'ok' });
    const f = run(A('build-command'), ctx({ checkId: 'code.build', stderr: 'src/a.ts:1:1 - error TS2304: Cannot find name x.\nnoise' }), 1);
    expect(f.exit).toMatchObject({ kind: 'project_failure', reason: { key: 'adapter.reason.buildFailed' } });
    expect(f.report.findings[0]).toMatchObject({ rule: 'build.failed', message: expect.stringContaining('TS2304') as string });
  });
  it('a custom check by its mandatory criterion: the exit code, and a text it must print', () => {
    expect(run(A('custom-command'), ctx({ checkId: 'custom.x', customSuccess: { exitCode: 0, outputContains: 'OK' }, stdout: 'all OK' }), 0).report.findings).toEqual([]);
    expect(run(A('custom-command'), ctx({ checkId: 'custom.x', customSuccess: { exitCode: 0 } }), 3).report.findings[0]).toMatchObject({ rule: 'custom.failed', expected: '0', actual: '3' });
    expect(run(A('custom-command'), ctx({ checkId: 'custom.x', customSuccess: null }), 0).exit).toMatchObject({ kind: 'tool_error', reason: { key: 'adapter.reason.noSuccessCriterion' } });
  });
});

describe('reports the project writes (StrykerJS, a custom check\'s declared file)', () => {
  const mutation = JSON.stringify({ files: { 'src/a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived', mutatorName: 'BooleanLiteral', replacement: 'false', location: { start: { line: 3 } } }] } } });
  const at = (problem: 'missing' | 'stale' | 'too_large' | null, text: string | null = null): ParseContext => ({ ...ctx({ checkId: 'beh.mutation', thresholds: { mutationScore: 60 } }), projectReport: () => ({ text, problem, size: text?.length ?? 60_000_000 }) });
  it('reads a report written in this run, and decides by the declared threshold only', () => {
    const r = run(A('stryker'), at(null, mutation), 0);
    expect(r.report.info).toMatchObject({ score: 50, threshold: 60 });
    expect(r.report.findings.map((f) => f.rule)).toEqual(['mutant.survived', 'mutation.score-below']);
    // A threshold that is not a number is none: «ناقص إعداد», never an invented 0 (7.4).
    expect(run(A('stryker'), { ...at(null, mutation), thresholds: { mutationScore: null } }, 0).exit).toMatchObject({ kind: 'missing', reason: { key: 'adapter.reason.noThreshold' } });
  });
  it('never takes a report left from before, nor one over the limit', () => {
    expect(run(A('stryker'), at('stale'), 0).report.problems).toEqual([expect.objectContaining({ code: 'missing', detail: expect.stringContaining('from before') as string })]);
    expect(run(A('stryker'), at('too_large'), 0).report.problems).toEqual([expect.objectContaining({ code: 'too_large' })]);
    const custom = { ...at('stale'), customSuccess: { exitCode: 0, report: 'out/junit.xml' } as CheckSpec['customSuccess'], checkId: 'custom.x' };
    expect(run(A('custom-command'), custom, 0).report.problems).toEqual([expect.objectContaining({ code: 'missing' })]);
  });
});
