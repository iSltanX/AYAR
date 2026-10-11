// The inventory of tests and their gaps (C-13, last row): an analysis that feeds the task cards (C-20), never a
// counted check. Units with no test file of the same name (a suggestion: the name does not tell the level of a test,
// and its absence does not prove an untested case), and, from a coverage report the project already has
// (`coverage-final.json`, `lcov.info`, `coverage.xml`), the files and functions never executed (coverage shows what
// did not run; it is never a target). DEV-9 wires it to the cards (G-DEV8-03).
import { descendants, readXml } from '@ayar/adapters';
import { posix } from 'node:path';

export interface TestGap {
  file: string;
  kind: 'no-test-file' | 'not-executed' | 'function-not-executed';
  name?: string;
  line?: number;
}

const TEST_FILE = /(^|\/)(__tests__\/.*|.*\.(test|spec)\.[cm]?[jt]sx?|test_[^/]*\.py|[^/]*_test\.py)$/;
const LOGIC = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|py)$/;
const SKIP = /(^|\/)(node_modules|dist|build|coverage|\.venv|venv|__pycache__|e2e|tests?|scripts?|fixtures?|mocks?|stories)\/|\.d\.ts$|(^|\/)(vite|vitest|jest|playwright|eslint|babel|webpack|rollup|svelte|tailwind|postcss|knip|stryker)\.config\.|(^|\/)(conftest|setup|__init__)\.py$/;

/** The stem a test of a unit carries (`count.test.ts` → `count`, `test_text.py` → `text`). */
export function stemOf(file: string): string {
  return posix
    .basename(file)
    .replace(/\.(test|spec)(?=\.)/, '')
    .replace(/^test_/, '')
    .replace(/_test(?=\.py$)/, '')
    .replace(/\.[^.]+$/, '');
}

/** Units of logic with no test file of the same name anywhere in the component. */
export function untestedUnits(files: readonly string[]): TestGap[] {
  const tests = new Set(files.filter((f) => TEST_FILE.test(f)).map(stemOf));
  return files.filter((f) => LOGIC.test(f) && !TEST_FILE.test(f) && !SKIP.test(f) && !tests.has(stemOf(f)) && stemOf(f) !== 'index').map((file) => ({ file, kind: 'no-test-file' as const }));
}

/** Istanbul's `coverage-final.json`: files with no statement executed, and functions never called. */
export function coverageGaps(json: unknown, root: string): TestGap[] {
  const out: TestGap[] = [];
  if (!json || typeof json !== 'object') return out;
  for (const [abs, cov] of Object.entries(json as Record<string, unknown>)) {
    if (!cov || typeof cov !== 'object') continue;
    const c = cov as { s?: Record<string, number>; f?: Record<string, number>; fnMap?: Record<string, { name?: string; loc?: { start?: { line?: number } } }> };
    const file = abs.startsWith(root) ? posix.relative(root, abs) : abs;
    const statements = Object.values(c.s ?? {});
    if (statements.length && statements.every((n) => n === 0)) out.push({ file, kind: 'not-executed' });
    else for (const [id, n] of Object.entries(c.f ?? {})) if (n === 0) out.push({ file, kind: 'function-not-executed', name: c.fnMap?.[id]?.name ?? id, ...(c.fnMap?.[id]?.loc?.start?.line ? { line: c.fnMap[id].loc.start.line } : {}) });
  }
  return out;
}

/** An lcov report: files whose lines were never hit, and functions with no hit (FNDA:0). */
export function lcovGaps(text: string, root: string): TestGap[] {
  const out: TestGap[] = [];
  let file = '';
  let hit = 0;
  let found = 0;
  const fnLines = new Map<string, number>();
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      file = line.slice(3).trim();
      if (file.startsWith(root)) file = posix.relative(root, file);
      hit = 0;
      found = 0;
      fnLines.clear();
    } else if (line.startsWith('FN:')) {
      const [l, name] = line.slice(3).split(',');
      if (name) fnLines.set(name, Number(l));
    } else if (line.startsWith('FNDA:')) {
      const [n, name] = line.slice(5).split(',');
      if (name && Number(n) === 0) out.push({ file, kind: 'function-not-executed', name, ...(fnLines.get(name) ? { line: fnLines.get(name)! } : {}) });
    } else if (line.startsWith('LH:')) hit = Number(line.slice(3));
    else if (line.startsWith('LF:')) found = Number(line.slice(3));
    else if (line.startsWith('end_of_record') && found > 0 && hit === 0) out.push({ file, kind: 'not-executed' });
  }
  return out;
}

/** A Cobertura `coverage.xml` (coverage.py): files (classes) whose line rate is zero. */
export function coberturaGaps(text: string): TestGap[] {
  const x = readXml(text, 'coverage.xml');
  if (!x.ok) return [];
  return descendants(x.value, 'class')
    .filter((c) => Number(c.attrs['line-rate']) === 0 && c.attrs.filename)
    .map((c) => ({ file: c.attrs.filename!, kind: 'not-executed' as const }));
}
