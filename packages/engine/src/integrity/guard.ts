// C-22 the integrity guard, as a pure function (D-12, FR-48, 10.3 `integ.guard`): two inventories of the project —
// the base (the last full round, or the run a resolved finding was first seen in) and the current one — and the
// text of the files that changed between them. In the added and changed lines it looks for the known ways a check
// is passed without a fix: a rule silenced, a test skipped or deleted, a reference or snapshot changed, a threshold
// lowered, an AYAR file edited. Each effect names the check it touches (C-22 «الربط»), so that check becomes
// «يحتاج مراجعة» (7.3 rule 8) until a human accepts the change with a note. The guard knows the known patterns, not
// every trick (its limits text says so). The first round has no base: it records the markers that exist as a
// baseline, and changes nothing.
import type { Manifest, ManifestEntry } from '../evidence/snapshot.ts';

export type GuardRule = 'guard.silenced-rule' | 'guard.skipped-test' | 'guard.snapshot-changed' | 'guard.threshold-lowered' | 'guard.reference-changed';

export interface GuardFinding {
  rule: GuardRule;
  path: string;
  line: number | null;
  /** The line (or the marker) the effect sits on, trimmed and bounded: the anchor of its fingerprint. */
  anchor: string;
  /** What changed: the added marker, the lowered threshold with both values, the deleted file. */
  message: string;
  before: string | null;
  after: string | null;
  /** The check the effect touches (C-22 «الربط»), or null for the round's summary («ما لا يُعرف فحصه»). */
  check: string | null;
  /** The pattern that matched (for the evidence). */
  pattern: string;
}

/** A marker that exists in a file (the first round's inventory, 10.3: «تسجل جردة فقط»). */
export interface GuardMarker {
  path: string;
  line: number;
  kind: 'silenced' | 'skipped';
  text: string;
}

export interface GuardInput {
  base: Manifest;
  current: Manifest;
  /** The text of a file in the base or the current inventory, or null when not kept (binary, large, sensitive). */
  baseText: (path: string) => Promise<string | null>;
  currentText: (path: string) => Promise<string | null>;
  /** Paths the project may write (declared outputs): changes there are not the guard's concern. */
  declared: (path: string) => boolean;
  /** The project's own reference images (the design's baselines folder), relative paths. */
  referencePaths?: readonly string[];
  /** At most this many findings (the evidence keeps the count beyond). */
  limit?: number;
}

export interface GuardResult {
  findings: GuardFinding[];
  /** Files compared (text on both sides), files changed, files deleted. */
  compared: number;
  changed: string[];
  deleted: string[];
  truncated: boolean;
}

const TEST_FILE = /(^|\/)(__tests__\/.*|.*\.(test|spec)\.[cm]?[jt]sx?|test_[^/]*\.py|[^/]*_test\.py)$/;
const E2E_PATH = /(^|\/)(e2e|playwright|tests\/e2e)\//;
const SNAPSHOT_FILE = /(^|\/)__snapshots__\/.*\.snap$|\.snap$|(^|\/)[^/]*-snapshots\/[^/]*\.(png|jpe?g|webp|txt)$/;
const CONFIG_FILE = /(^|\/)(vitest|jest|playwright|stryker|size-limit|\.size-limit|k6|axe)\.config\.[cm]?[jt]sx?$|(^|\/)(\.size-limit\.(json|js|cjs)|package\.json|pyproject\.toml|setup\.cfg|\.coveragerc|stryker\.conf(ig)?\.(json|js|mjs|cjs))$/;
const AYAR_FILE = /^\.ayar\/(profile\.json|.*\.json)$/;
const MAX_FILE_CHARS = 2 * 1024 * 1024;
const MAX_ANCHOR = 200;

/** A silencing marker and the check it touches (C-22 «الربط»: a rule's silencing goes to the check of that rule). */
const SILENCERS: { re: RegExp; check: string; pattern: string }[] = [
  { re: /eslint-disable(?:-next-line|-line)?\b/, check: 'code.lint', pattern: 'eslint-disable' },
  { re: /biome-ignore\b/, check: 'code.lint', pattern: 'biome-ignore' },
  { re: /@ts-(?:ignore|expect-error|nocheck)\b/, check: 'code.types', pattern: '@ts-ignore' },
  { re: /#\s*noqa\b/, check: 'code.lint', pattern: 'noqa' },
  { re: /#\s*type:\s*ignore\b/, check: 'code.types', pattern: 'type: ignore' },
  { re: /#\s*pyright:\s*ignore\b/, check: 'code.types', pattern: 'pyright: ignore' },
  { re: /\bnosemgrep\b/, check: 'sec.sast', pattern: 'nosemgrep' },
  { re: /\bnosec\b/, check: 'sec.sast', pattern: 'nosec' },
  { re: /\/\*\s*istanbul ignore\b|\/\/\s*istanbul ignore\b|\bc8 ignore\b|\bv8 ignore\b/, check: 'beh.unit', pattern: 'istanbul ignore' },
  { re: /\bgitleaks:allow\b/, check: 'sec.secrets.files', pattern: 'gitleaks:allow' },
  { re: /\bknip-ignore\b|\bknip:\s*ignore\b/, check: 'code.unused', pattern: 'knip-ignore' },
];

/** Ignore files whose additions silence a scanner (C-22: «إضافات إلى .gitleaksignore و.semgrepignore واستثناءات Knip»). */
const IGNORE_FILES: { re: RegExp; check: string; pattern: string }[] = [
  { re: /(^|\/)\.gitleaksignore$/, check: 'sec.secrets.files', pattern: '.gitleaksignore' },
  { re: /(^|\/)\.gitleaks\.toml$/, check: 'sec.secrets.files', pattern: '.gitleaks.toml allowlist' },
  { re: /(^|\/)\.semgrepignore$/, check: 'sec.sast', pattern: '.semgrepignore' },
  { re: /(^|\/)knip\.(json|jsonc|ts|js|mjs|cjs)$/, check: 'code.unused', pattern: 'knip ignore' },
  { re: /(^|\/)\.eslintignore$/, check: 'code.lint', pattern: '.eslintignore' },
];

/** Test-skipping markers (JS and Python). */
const SKIPPERS: { re: RegExp; pattern: string }[] = [
  { re: /\b(?:it|test|describe|suite|context)\s*\.\s*(?:skip|only|todo)\s*\(/, pattern: '.skip/.only/.todo' },
  { re: /\b(?:xit|xtest|xdescribe|xcontext)\s*\(/, pattern: 'xit/xdescribe' },
  { re: /\btest\s*\.\s*(?:fixme|fail)\s*\(/, pattern: 'test.fixme' },
  { re: /@pytest\.mark\.(?:skip|skipif|xfail)\b/, pattern: 'pytest.mark.skip' },
  { re: /\bpytest\.skip\s*\(|\bunittest\.skip\b|@skip(?:If|Unless)?\b/, pattern: 'pytest.skip' },
];

/** Threshold keys whose numeric value going down lowers a bar (coverage, size, k6, Stryker, axe). */
const THRESHOLD_KEYS: { re: RegExp; check: string; pattern: string }[] = [
  { re: /\b(?:lines|functions|branches|statements|perFile|autoUpdate|threshold|thresholds)\b/, check: 'beh.unit', pattern: 'coverage threshold' },
  { re: /\b(?:break|high|low|mutationScore|score)\b/, check: 'beh.mutation', pattern: 'stryker threshold' },
  { re: /\b(?:limit|maxSize|budget|gzip|brotli)\b/, check: 'code.size', pattern: 'size budget' },
  { re: /\b(?:thresholds|p\(\d+\)|rate|http_req_duration|http_req_failed)\b/, check: 'perf.load', pattern: 'k6 threshold' },
];
const AXE_DISABLE = /disableRules|\brules\s*:\s*\{[^}]*enabled\s*:\s*false/;

const bounded = (s: string): string => s.trim().replace(/\s+/g, ' ').slice(0, MAX_ANCHOR);
const isTestFile = (p: string): boolean => TEST_FILE.test(p);
const testCheckOf = (p: string): string => (E2E_PATH.test(p) || /\.e2e\./.test(p) ? 'beh.e2e' : 'beh.unit');

/** The markers in a text (the first round's inventory). */
export function markersIn(path: string, text: string): GuardMarker[] {
  const out: GuardMarker[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (SILENCERS.some((s) => s.re.test(line))) out.push({ path, line: i + 1, kind: 'silenced', text: bounded(line) });
    if (isTestFile(path) && SKIPPERS.some((s) => s.re.test(line))) out.push({ path, line: i + 1, kind: 'skipped', text: bounded(line) });
  }
  return out;
}

/** Lines of `after` not in `before` (multiset difference), with their line numbers in `after`. */
export function addedLines(before: string, after: string): { line: number; text: string }[] {
  const have = new Map<string, number>();
  for (const l of before.split('\n')) have.set(l, (have.get(l) ?? 0) + 1);
  const out: { line: number; text: string }[] = [];
  after.split('\n').forEach((text, i) => {
    const n = have.get(text) ?? 0;
    if (n > 0) have.set(text, n - 1);
    else out.push({ line: i + 1, text });
  });
  return out;
}

/** Numbers that went down between two lines sharing a threshold key: `{ lines: 90 }` → `{ lines: 60 }`. */
export function loweredNumbers(before: string, after: string): { key: string; from: number; to: number }[] {
  const grab = (s: string): Map<string, number[]> => {
    const m = new Map<string, number[]>();
    for (const x of s.matchAll(/([A-Za-z_][A-Za-z0-9_()]*)\s*[:=]\s*(?:['"]?)(\d+(?:\.\d+)?)/g)) {
      const k = x[1]!;
      m.set(k, [...(m.get(k) ?? []), Number(x[2])]);
    }
    return m;
  };
  const a = grab(before);
  const b = grab(after);
  const out: { key: string; from: number; to: number }[] = [];
  for (const [k, afterValues] of b) {
    const beforeValues = a.get(k);
    if (!beforeValues) continue;
    const from = Math.min(...beforeValues);
    const to = Math.min(...afterValues);
    if (to < from) out.push({ key: k, from, to });
  }
  return out;
}

/** The lines of `after` that differ from `before` at the same position (for thresholds: a value edited in place). */
function changedPairs(before: string, after: string): { line: number; before: string; after: string }[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: { line: number; before: string; after: string }[] = [];
  // Pair by the key on the line, so an inserted line above does not shift every pair.
  const keyOf = (l: string) => /^\s*([A-Za-z_][A-Za-z0-9_().]*)\s*[:=]/.exec(l)?.[1] ?? null;
  const byKey = new Map<string, string[]>();
  for (const l of a) {
    const k = keyOf(l);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), l]);
  }
  b.forEach((l, i) => {
    const k = keyOf(l);
    const prev = k ? byKey.get(k) : undefined;
    if (!prev?.length) return;
    const p = prev.shift()!;
    if (p !== l) out.push({ line: i + 1, before: p, after: l });
  });
  return out;
}

export async function guard(input: GuardInput): Promise<GuardResult> {
  const limit = input.limit ?? 500;
  const base = new Map<string, ManifestEntry>(input.base.files.map((f) => [f[0], f]));
  const current = new Map<string, ManifestEntry>(input.current.files.map((f) => [f[0], f]));
  const findings: GuardFinding[] = [];
  const changed: string[] = [];
  const deleted: string[] = [];
  let compared = 0;
  let truncated = false;
  const push = (f: GuardFinding) => {
    if (findings.length >= limit) truncated = true;
    else findings.push(f);
  };

  // Deleted files: a test file gone is «نقص الاختبارات»; a snapshot or a reference gone is a changed reference.
  for (const [path, entry] of base) {
    if (current.has(path) || input.declared(path)) continue;
    deleted.push(path);
    if (isTestFile(path)) push({ rule: 'guard.skipped-test', path, line: null, anchor: `deleted ${path}`, message: `test file deleted: ${path}`, before: `${entry[1]} bytes`, after: null, check: testCheckOf(path), pattern: 'deleted test file' });
    else if (SNAPSHOT_FILE.test(path)) push({ rule: 'guard.snapshot-changed', path, line: null, anchor: `deleted ${path}`, message: `snapshot deleted: ${path}`, before: `${entry[1]} bytes`, after: null, check: /-snapshots\//.test(path) ? 'beh.e2e' : testCheckOf(path), pattern: 'deleted snapshot' });
    else if (input.referencePaths?.includes(path)) push({ rule: 'guard.reference-changed', path, line: null, anchor: `deleted ${path}`, message: `reference image deleted: ${path}`, before: `${entry[1]} bytes`, after: null, check: 'design.visual', pattern: 'deleted reference' });
  }

  for (const [path, now] of current) {
    if (input.declared(path)) continue;
    const prev = base.get(path);
    const isNew = !prev;
    if (prev && prev[5] === now[5]) continue; // unchanged content
    if (!isNew) changed.push(path);
    // References and snapshots: any change of content is a changed reference (a new one is not).
    if (!isNew && SNAPSHOT_FILE.test(path)) {
      const check = /-snapshots\//.test(path) ? 'beh.e2e' : testCheckOf(path);
      const [b, a] = await Promise.all([input.baseText(path), input.currentText(path)]);
      const first = b !== null && a !== null ? (changedPairs(b, a)[0] ?? addedLines(b, a)[0] ?? null) : null;
      const line = first ? ('line' in first ? first.line : null) : null;
      const anchor = first ? bounded('after' in first ? first.after : first.text) : `changed ${path}`;
      push({ rule: 'guard.snapshot-changed', path, line, anchor, message: `snapshot changed: ${path}`, before: first && 'before' in first ? bounded(first.before) : null, after: first ? bounded('after' in first ? first.after : first.text) : null, check, pattern: 'snapshot changed' });
      continue;
    }
    if (!isNew && input.referencePaths?.includes(path)) {
      push({ rule: 'guard.reference-changed', path, line: null, anchor: `changed ${path}`, message: `reference image changed: ${path}`, before: prev[5], after: now[5], check: 'design.visual', pattern: 'reference changed' });
      continue;
    }
    if (AYAR_FILE.test(path)) {
      push({ rule: 'guard.reference-changed', path, line: null, anchor: isNew ? `added ${path}` : `changed ${path}`, message: `AYAR file ${isNew ? 'added' : 'changed'} in the repository: ${path}`, before: prev?.[5] ?? null, after: now[5], check: null, pattern: 'ayar file' });
      continue;
    }
    if (now[6] !== 'text' || now[1] > MAX_FILE_CHARS) continue;
    const after = await input.currentText(path);
    if (after === null) continue;
    const before = isNew ? '' : await input.baseText(path);
    if (before === null) continue;
    compared++;
    const added = addedLines(before, after);
    // Silenced rules, in any file; additions to ignore files.
    const ignoreFile = IGNORE_FILES.find((i) => i.re.test(path));
    for (const l of added) {
      if (!l.text.trim()) continue;
      const s = SILENCERS.find((x) => x.re.test(l.text));
      if (s) push({ rule: 'guard.silenced-rule', path, line: l.line, anchor: bounded(l.text), message: `rule silenced with ${s.pattern}`, before: null, after: bounded(l.text), check: s.check, pattern: s.pattern });
      else if (ignoreFile && !l.text.trim().startsWith('#')) push({ rule: 'guard.silenced-rule', path, line: l.line, anchor: bounded(l.text), message: `entry added to ${ignoreFile.pattern}`, before: null, after: bounded(l.text), check: ignoreFile.check, pattern: ignoreFile.pattern });
      if (isTestFile(path)) {
        const k = SKIPPERS.find((x) => x.re.test(l.text));
        if (k) push({ rule: 'guard.skipped-test', path, line: l.line, anchor: bounded(l.text), message: `test skipped with ${k.pattern}`, before: null, after: bounded(l.text), check: testCheckOf(path), pattern: k.pattern });
      }
    }
    // Thresholds lowered in configuration files (and in the test files that declare them).
    if (!isNew && (CONFIG_FILE.test(path) || isTestFile(path))) {
      for (const pair of changedPairs(before, after)) {
        const key = THRESHOLD_KEYS.find((t) => t.re.test(pair.before) || t.re.test(pair.after));
        if (!key) continue;
        const lowered = loweredNumbers(pair.before, pair.after);
        if (!lowered.length) continue;
        const check = /vitest|jest|\.coveragerc|pyproject|setup\.cfg/.test(path) ? 'beh.unit' : /stryker/.test(path) ? 'beh.mutation' : /size-limit/.test(path) ? 'code.size' : /k6/.test(path) ? 'perf.load' : key.check;
        push({ rule: 'guard.threshold-lowered', path, line: pair.line, anchor: bounded(pair.after), message: lowered.map((x) => `${x.key} ${x.from} → ${x.to}`).join(', '), before: bounded(pair.before), after: bounded(pair.after), check, pattern: key.pattern });
      }
      // Thresholds that moved as a block (an object rewritten): compare the whole file's numbers too.
      if (CONFIG_FILE.test(path) && !findings.some((f) => f.path === path && f.rule === 'guard.threshold-lowered')) {
        const lowered = loweredNumbers(before, after).filter((x) => THRESHOLD_KEYS.some((t) => t.re.test(x.key)));
        if (lowered.length) {
          const line = after.split('\n').findIndex((l) => lowered.some((x) => l.includes(x.key))) + 1;
          const check = /vitest|jest|\.coveragerc|pyproject|setup\.cfg/.test(path) ? 'beh.unit' : /stryker/.test(path) ? 'beh.mutation' : /size-limit/.test(path) ? 'code.size' : /k6/.test(path) ? 'perf.load' : null;
          push({ rule: 'guard.threshold-lowered', path, line: line || null, anchor: bounded(after.split('\n')[line - 1] ?? 'thresholds'), message: lowered.map((x) => `${x.key} ${x.from} → ${x.to}`).join(', '), before: null, after: null, check, pattern: 'thresholds' });
        }
      }
      if (AXE_DISABLE.test(after) && !AXE_DISABLE.test(before)) push({ rule: 'guard.threshold-lowered', path, line: after.split('\n').findIndex((l) => AXE_DISABLE.test(l)) + 1 || null, anchor: 'disableRules', message: 'axe rules disabled', before: null, after: null, check: 'design.a11y', pattern: 'axe disableRules' });
    }
  }
  return { findings, compared, changed, deleted, truncated };
}
