// تشغيلات السلامة لـ FX-ADAPTERS (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-ADAPTERS [نسخة...])
// لكل مكوّن أمره الأصلي، ولكل نسخة <أداة>--<نوع> رمز الخروج الفعلي المتوقع وما يظهر في الخرج.
const PNPM = 'pnpm install --frozen-lockfile';
const UV = 'UV_PYTHON_PREFERENCE=only-system uv sync --frozen';
const tools = {
  vitest: { setup: PNPM, cmd: 'pnpm exec vitest run', check: 'beh.unit' },
  jest: { setup: PNPM, cmd: 'pnpm exec jest --ci', check: 'beh.unit' },
  'node-test': { cmd: 'node --test', check: 'beh.unit' },
  playwright: { setup: PNPM, cmd: 'pnpm exec playwright test', check: 'beh.e2e' },
  eslint: { setup: PNPM, cmd: 'pnpm exec eslint src', check: 'code.lint' },
  biome: { setup: PNPM, cmd: 'pnpm exec biome lint src', check: 'code.lint' },
  tsc: { setup: PNPM, cmd: 'pnpm exec tsc --noEmit -p tsconfig.json --pretty false', check: 'code.types' },
  knip: { setup: PNPM, cmd: 'pnpm exec knip', check: 'code.unused' },
  pyright: { setup: PNPM, cmd: 'pnpm exec pyright', check: 'code.types' },
  pytest: { setup: UV, cmd: '.venv/bin/python -m pytest -p no:cacheprovider', check: 'beh.unit' },
  ruff: { setup: UV, cmd: '.venv/bin/ruff check --no-cache src', check: 'code.lint' },
  mypy: { setup: UV, cmd: '.venv/bin/python -m mypy --cache-dir=/dev/null', check: 'code.types' },
  semgrep: { cmd: 'semgrep scan --no-git-ignore --config .semgrep.yml --metrics=off --disable-version-check --quiet src', check: 'sec.sast' },
  // قاعدة OSV المصغرة (E-09): تُبنى وقت التشغيل من fixtures/tools/osv-mini-db إلى المجلد المؤقت، وتُقرأ دون اتصال
  osv: { cmd: 'node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c', check: 'sec.deps' },
  gitleaks: { cmd: 'gitleaks dir . --config .gitleaks.toml --redact=100 --no-banner --exit-code 42', check: 'sec.secrets.files' },
  lychee: { cmd: 'lychee --config lychee.toml README.md', check: 'code.refs.external', bg: 'node server.mjs' },
};

// [النسخة, رمز الخروج الفعلي (أو 'timeout'), تعابير يجب أن تظهر في الخرج, ما يثبته]
const rows = [
  ['good', {}, '(انظر الصفوف المنفردة لكل أداة)'],
];
const T = (tool, kind, exit, match, proves, extra = {}) => ({ tool, kind, exit, match, proves, ...extra });
const matrix = [
  T('vitest', 'good', 0, ['1 passed'], 'beh.unit: اجتاز'),
  T('vitest', 'bad', 1, ['يجمع عددين', '1 failed'], 'beh.unit: أخفق (منشأ المشروع)'),
  T('vitest', 'config-error', 1, ['no-such-environment'], 'beh.unit: تعذّر (منشأ الأداة)'),
  T('vitest', 'no-inputs', 1, ['No test files found'], 'beh.unit: ناقص'),
  T('vitest', 'timeout', 'timeout', [], 'beh.unit: انتهت المهلة', { timeout_s: 12 }),
  T('vitest', 'conflict', 0, ['1 failed'], 'beh.unit: تعارض الأدلة (خروج 0 مع إخفاق)'),
  T('jest', 'good', 0, ['1 passed'], 'beh.unit: اجتاز'),
  T('jest', 'bad', 1, ['يجمع عددين', '1 failed'], 'beh.unit: أخفق'),
  T('jest', 'config-error', 1, ['no-such-environment'], 'beh.unit: تعذّر'),
  T('jest', 'no-inputs', 1, ['No tests found'], 'beh.unit: ناقص'),
  T('jest', 'timeout', 'timeout', [], 'beh.unit: انتهت المهلة', { timeout_s: 12 }),
  T('node-test', 'good', 0, ['pass 1'], 'beh.unit: اجتاز'),
  T('node-test', 'bad', 1, ['fail 1'], 'beh.unit: أخفق'),
  T('node-test', 'no-inputs', 0, ['tests 0'], 'beh.unit: ناقص (خروج 0 وصفر اختبار)'),
  T('node-test', 'timeout', 'timeout', [], 'beh.unit: انتهت المهلة', { timeout_s: 12 }),
  T('playwright', 'good', 0, ['1 passed'], 'beh.e2e: اجتاز'),
  T('playwright', 'bad', 1, ['يجمع عددين', '1 failed'], 'beh.e2e: أخفق'),
  T('playwright', 'config-error', 1, ['playwright.config.js'], 'beh.e2e: تعذّر'),
  T('playwright', 'no-inputs', 1, ['No tests found'], 'beh.e2e: ناقص'),
  T('playwright', 'timeout', 'timeout', [], 'beh.e2e: انتهت المهلة', { timeout_s: 12 }),
  T('eslint', 'good', 0, [], 'code.lint: اجتاز'),
  T('eslint', 'bad', 1, ['no-unused-vars', 'src/a.js'], 'code.lint: أخفق'),
  T('eslint', 'config-error', 2, ['no-such-rule-xyz'], 'code.lint: تعذّر (رمز 2)'),
  T('eslint', 'no-inputs', 2, ['ignored'], 'code.lint: تعذّر (لا مدخلات، رمز 2)'),
  T('eslint', 'timeout', 'timeout', [], 'code.lint: انتهت المهلة', { timeout_s: 12 }),
  T('biome', 'good', 0, ['Checked 1 file'], 'code.lint: اجتاز'),
  T('biome', 'bad', 1, ['noDebugger'], 'code.lint: أخفق'),
  T('biome', 'config-error', 1, ['rulez'], 'code.lint: تعذّر'),
  T('biome', 'no-inputs', 1, ['No files were processed'], 'code.lint: لا مدخلات (رمز 1)'),
  T('tsc', 'good', 0, [], 'code.types: اجتاز'),
  T('tsc', 'bad', 2, ['TS6133', "'unused'"], 'code.types: أخفق (TS6133)'),
  T('tsc', 'config-error', 2, ['TS5083', 'missing-base.json'], 'code.types: تعذّر (TS5083)'),
  T('tsc', 'no-inputs', 2, ['TS18003'], 'code.types: تعذّر (TS18003)'),
  T('knip', 'good', 0, [], 'code.unused: اجتاز'),
  T('knip', 'bad', 1, ['orphan.js'], 'code.unused: أخفق (ملف غير مستخدم)'),
  T('knip', 'config-error', 2, ['Invalid input'], 'code.unused: تعذّر (رمز 2)'),
  T('pyright', 'good', 0, ['0 errors'], 'code.types: اجتاز'),
  T('pyright', 'bad', 1, ['reportArgumentType'], 'code.types: أخفق'),
  T('pyright', 'config-error', 3, ['could not be parsed'], 'code.types: تعذّر (رمز 3)'),
  T('pyright', 'no-inputs', 0, ['0 errors'], 'code.types: ناقص (رمز 0 بلا ملفات مصدر)'),
  T('pytest', 'good', 0, ['1 passed'], 'beh.unit: اجتاز'),
  T('pytest', 'bad', 1, ['test_add', '1 failed'], 'beh.unit: أخفق'),
  T('pytest', 'collection-error', 2, ['SyntaxError', 'error'], 'beh.unit: أخفق (خطأ جمع، رمز 2، منشأ المشروع)'),
  T('pytest', 'usage-error', 4, ['no-such-option'], 'beh.unit: تعذّر (رمز 4)'),
  T('pytest', 'no-tests', 5, ['no tests ran'], 'beh.unit: ناقص (رمز 5)'),
  T('pytest', 'timeout', 'timeout', [], 'beh.unit: انتهت المهلة', { timeout_s: 12 }),
  T('pytest', 'conflict', 0, ['1 failed'], 'beh.unit: تعارض الأدلة (خروج 0 مع إخفاق)'),
  T('ruff', 'good', 0, ['All checks passed'], 'code.lint: اجتاز'),
  T('ruff', 'bad', 1, ['F401'], 'code.lint: أخفق'),
  T('ruff', 'config-error', 2, ['line-length'], 'code.lint: تعذّر (رمز 2)'),
  T('ruff', 'no-inputs', 0, ['No Python files found'], 'code.lint: ناقص (رمز 0 بلا ملفات)'),
  T('mypy', 'good', 0, ['Success'], 'code.types: اجتاز'),
  T('mypy', 'bad', 1, ['arg-type'], 'code.types: أخفق'),
  T('mypy', 'syntax-error', 2, ['src/a.py:1', 'syntax'], 'code.types: أخفق (رمز 2 مع تشخيص [syntax] بموضع ملف)'),
  T('mypy', 'config-error', 2, ['Missing target'], 'code.types: تعذّر (رمز 2 بلا تشخيص بموضع ملف مصدر)'),
  T('mypy', 'no-inputs', 2, ['no .py'], 'code.types: تعذّر (رمز 2)'),
  T('semgrep', 'good', 0, [], 'sec.sast: اجتاز (رمز 0 بلا نتائج)'),
  T('semgrep', 'bad', 0, ['ayar-test.no-eval', 'src/a.js'], 'sec.sast: رمز 0 مع نتائج (ليس اجتيازًا)'),
  T('semgrep', 'config-error', 7, [], 'sec.sast: تعذّر (رمز 7)'),
  T('semgrep', 'no-inputs', 0, [], 'sec.sast: غير منطبق (لا ملفات، رمز 0)'),
  T('osv', 'good', 0, ['found 1 package', '"results": \\[\\]'], 'sec.deps: اجتاز (left-pad وحدها؛ صفر ثغرات بقاعدة OSV المصغرة دون اتصال)'),
  T('osv', 'bad', 1, ['AYAR-2026-0001', 'ayar-vuln-fake'], 'sec.deps: أخفق (رمز 1) — الثغرة التجريبية AYAR-2026-0001 في ayar-vuln-fake@1.0.0'),
  T('osv', 'no-lockfiles', 128, ['No package sources found'], 'sec.deps: ناقص (رمز 128)'),
  T('osv', 'config-error', 128, ['Error during extraction'], 'sec.deps: تعذّر (رمز 128 مع Error during extraction)'),
  T('gitleaks', 'good', 0, ['no leaks found'], 'sec.secrets.files: اجتاز'),
  T('gitleaks', 'bad', 42, ['leaks found: 1'], 'sec.secrets.files: أخفق (رمز 42)'),
  T('gitleaks', 'config-error', 1, [], 'sec.secrets.files: تعذّر (رمز 1)'),
  T('lychee', 'good', 0, ['0 Errors'], 'code.refs.external: اجتاز'),
  T('lychee', 'bad', 2, ['gone', '404'], 'code.refs.external: أخفق (404)'),
  T('lychee', 'timeout', 2, ['hang', 'imeout'], 'code.refs.external: مهلة (ليست رابطًا مكسورًا)'),
  T('lychee', 'needs-review', 2, ['forbidden', '403'], 'code.refs.external: 403 يحتاج مراجعة'),
  T('lychee', 'config-error', 3, ['Failed to parse configuration file'], 'code.refs.external: تعذّر (رمز 3)'),
];
const variants = {};
for (const m of matrix) {
  const t = tools[m.tool];
  const name = m.kind === 'good' ? `good:${m.tool}` : `${m.tool}--${m.kind}`;
  variants[name] = {
    cwd: m.tool, setup: t.setup ?? '', bg: t.bg,
    runs: [{ id: m.tool, cmd: t.cmd, exit: m.exit, match: m.match, proves: m.proves, timeout_s: m.timeout_s, evidence: true, excerpt: 700 }],
    variant: m.kind === 'good' ? 'good' : name,
  };
}
export default { versions: { node: 'node --version', pnpm: 'pnpm --version', uv: 'uv --version', semgrep: 'semgrep --version', 'osv-scanner': 'osv-scanner --version | head -1', lychee: 'lychee --version', gitleaks: 'gitleaks version' }, variants, matrixRows: rows.length };
