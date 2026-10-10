// تشغيلات السلامة لـ FX-PY (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-PY)
// جذر التشغيل هو المسار العربي «مشاريع تجريبية/مكتبة «النصوص»» نفسه.
const PY = '.venv/bin/python';
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, ...extra });
const types = run('types', `${PY} -m mypy --cache-dir=/dev/null`, 'code.types: mypy strict بلا أخطاء', { match: ['Success: no issues found'] });
const lint = run('lint', '.venv/bin/ruff check --no-cache --output-format concise .', 'code.lint: Ruff بلا مخالفات', { match: ['All checks passed'] });
const unit = run('unit', `${PY} -m pytest -p no:cacheprovider`, 'beh.unit: pytest يمر', { match: ['10 passed'] });
const build = run('build', `${PY} -m build --no-isolation --outdir "$TMPDIR/ayar-fx-py-dist"`, 'code.build: build --no-isolation ينتج sdist وwheel', { match: ['Successfully built nusus-1.0.0'] });
const secrets = (exit, proves, match = []) => ({ id: 'secrets', cmd: 'gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42', exit, proves, match });
// قاعدة OSV المصغرة (E-09، DEV-2): تُبنى وقت التشغيل إلى المجلد المؤقت وتُقرأ دون اتصال؛ الهدف uv.lock في الجذر العربي
const osv = (exit, proves, match = [], nomatch = []) => ({ id: 'sec.deps', cmd: 'node $FX_TOOLS/osv-mini-db/build.mjs --out "$TMPDIR/ayar-osv-mini-db" >/dev/null && OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY="$TMPDIR/ayar-osv-mini-db" osv-scanner scan source -r . --offline --no-call-analysis=all --format json --output-file ../osv.json; c=$?; cat ../osv.json 2>/dev/null; exit $c', exit, proves, match, nomatch, evidence: true, excerpt: 900 });
const common = [types, lint, unit, build, secrets(0, 'sec.secrets.files: لا تسريبات')];

export default {
  setup: 'UV_PYTHON_PREFERENCE=only-system uv sync --frozen',
  versions: { python: '.venv/bin/python --version || python3.12 --version', uv: 'uv --version', pytest: 'echo pytest 9.1.1', ruff: 'echo ruff 0.16.10', mypy: 'echo mypy 2.4.0' },
  variants: {
    good: [...common, osv(0, 'sec.deps: صفر ثغرات (قاعدة OSV المصغرة دون اتصال)', ['"results"'], ['AYAR-2026', 'ayar-vuln-fake']),
      run('arabic-path', 'pwd', 'الجذر مسار عربي بمسافات وعلامات تنصيص', { match: ['مشاريع تجريبية/مكتبة «النصوص»$'], evidence: true })],
    'failing-test': [types, lint, run('unit', `${PY} -m pytest -p no:cacheprovider`, 'beh.unit: test_normalize_taa_marbuta يفشل', { exit: 1, match: ['test_normalize_taa_marbuta', '1 failed, 10 passed'], evidence: true })],
    'no-tests': [run('unit', `${PY} -m pytest -p no:cacheprovider`, 'beh.unit: pytest برمز 5 (ناقص)', { exit: 5, match: ['no tests ran'], evidence: true }), lint],
    'usage-error': [run('unit', `${PY} -m pytest -p no:cacheprovider`, 'beh.unit: pytest برمز 4 (خطأ استخدام ← تعذّر)', { exit: 4, match: ['no-such-option'], evidence: true })],
    'ruff-violation': [types, unit, run('lint', '.venv/bin/ruff check --no-cache --output-format concise .', 'code.lint: F401 في src/nusus/text.py', { exit: 1, match: ['src/nusus/text.py:\\d+:\\d+: F401'], evidence: true })],
    'vuln-dep': [types, lint, run('unit', `${PY} -m pytest -p no:cacheprovider`, 'beh.unit: يمر والتبعية مثبتة', { match: ['10 passed'] }),
      run('dep-locked', 'grep -n -A2 \'name = "ayar-vuln-fake"\' uv.lock', 'sec.deps: ayar-vuln-fake@1.0.0 في uv.lock', { match: ['version = "1.0.0"'], evidence: true }),
      osv(1, 'sec.deps: أخفق (رمز 1) — AYAR-2026-0002 في ayar-vuln-fake@1.0.0 (تبعية directory من uv.lock)', ['AYAR-2026-0002', 'ayar-vuln-fake'])],
    'nfd-path': [...common, run('nfd-path', `python3 -c "import os,unicodedata as u; p=os.getcwd(); print('PATH_IS_NFD' if u.is_normalized('NFD',p) and not u.is_normalized('NFC',p) else 'PATH_NOT_NFD')"`, 'الجذر مكتوب بصيغة NFD فعلًا ويختلف عن NFC', { match: ['PATH_IS_NFD'], evidence: true })],
  },
};
