// تشغيلات السلامة لـ FX-EXT (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-EXT)
const BUILD = 'pnpm build >/dev/null 2>&1';
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, ...extra });

const typecheck = run('types', 'pnpm exec tsc --noEmit', 'code.types: صفر أخطاء أنواع');
const lint = run('lint', 'pnpm exec eslint src e2e', 'code.lint: صفر أخطاء');
const unit = run('unit', 'pnpm exec vitest run', 'beh.unit: كل الاختبارات تمر', { match: ['Test Files .* passed'], nomatch: ['failed'] });
const build = run('build', 'pnpm build', 'code.build: يمر ويُنتج dist/', { match: ['built in'] });
const loads = run('ext-load', `${BUILD} && node $FX_TOOLS/chrome-load.mjs dist`, 'beh.ext.host: Chromium يحمّل الإضافة دون خطأ', { match: ['^LOADED$'], evidence: true });
const e2e = run('e2e', `${BUILD} && pnpm exec playwright test`, 'beh.e2e: ثلاث رحلات تمر (عامل الخدمة، النافذة، الخيارات)', { match: ['3 passed'], nomatch: ['flaky', 'failed'] });
const secrets = (exit, proves, match = []) => ({ id: 'secrets', cmd: 'gitleaks dir . --config $FX_TOOLS/gitleaks-fixtures.toml --redact=100 --no-banner --exit-code 42 --report-format json --report-path ../gl.json; c=$?; cat ../gl.json; exit $c', exit, proves, match, evidence: true });
const policy = (exit, proves, match = []) => ({ id: 'policy', cmd: 'node $FX_TOOLS/ext-policy-check.mjs public/manifest.json permissions-policy.json', exit, proves, match, evidence: true });
const axe = (exit, proves, match = []) => ({ id: 'a11y', cmd: `${BUILD} && node $FX_TOOLS/axe-check.mjs --ext dist --page popup.html --rules color-contrast`, exit, proves, match, evidence: true });
const rtl = (proves, match) => ({ id: 'rtl', cmd: `${BUILD} && node $FX_TOOLS/axe-check.mjs --ext dist --page popup.html --rules html-has-lang`, exit: 0, proves, match, evidence: true });
const loadFails = (proves, msg) => ({ id: 'ext-load', cmd: `${BUILD} && node $FX_TOOLS/chrome-load.mjs dist`, exit: 3, proves, match: [msg], evidence: true });
const e2eFails = (proves, match = []) => ({ id: 'e2e', cmd: `${BUILD} && pnpm exec playwright test --timeout=8000`, exit: 1, proves, match, evidence: true });
const cov = (exit, proves, match = []) => ({ id: 'coverage', cmd: 'pnpm exec vitest run --coverage', exit, proves, match });
const grep = (id, pattern, file, proves) => ({ id, cmd: `grep -n -F ${JSON.stringify(pattern)} ${file}`, exit: 0, proves, match: [pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], evidence: true });
const allGoodTools = [typecheck, lint, unit, build];
const withoutIds = (list, ...ids) => list.filter((r) => !ids.includes(r.id));

export default {
  setup: 'pnpm install --frozen-lockfile',
  versions: { node: 'node --version', pnpm: 'pnpm --version', vitest: 'pnpm --version >/dev/null; echo vitest 5.0.3', chromium: 'echo "Chromium 156.0.8078.4 (Playwright 1.64.0)"', gitleaks: 'gitleaks version' },
  variants: {
    good: [...allGoodTools, cov(0, 'تغطية الوحدة 100% فوق عتبات 90/90/80', ['100']), loads, e2e, secrets(0, 'sec.secrets.files: لا تسريبات'), policy(0, 'sec.ext.permissions: كل الصلاحيات في السياسة', ['POLICY_TOTAL 0']), axe(0, 'design.a11y: صفر مخالفات تباين', ['AXE_TOTAL 0']),
      rtl('design.rtl.static: جذر popup.html يعلن dir وlang', ['DIR attr=rtl lang=ar computed=rtl']),
      { id: 'sec.deps', pending: true, proves: 'sec.deps: صفر ثغرات', reason: 'ينتظر E-09 (قاعدة OSV المصغرة في DEV-2)' }],
    'failing-test': [typecheck, lint, build, run('unit', 'pnpm exec vitest run', 'beh.unit: اختبار «يفصل الكلمات بعلامات الترقيم» يفشل', { exit: 1, match: ['يفصل الكلمات بعلامات الترقيم', '1 failed'], evidence: true })],
    secret: [typecheck, lint, unit, build, secrets(42, 'sec.secrets.files: generic-api-key في src/config.ts', ['"RuleID": "generic-api-key"', '"File": "src/config.ts"'])],
    'all-urls': [typecheck, loads, policy(1, 'sec.ext.permissions: <all_urls> خارج السياسة', ['POLICY_VIOLATION host_permissions <all_urls>'])],
    'missing-icon': [typecheck, loadFails('sec.ext.manifest/beh.ext.host: Chromium يرفض لأن الأيقونة مفقودة', "Could not load icon 'assets/icon128.png'")],
    'msg-undefined': [typecheck, loadFails('sec.ext.manifest/beh.ext.host: Chromium يرفض لأن __MSG_extTagline__ غير معرّف', 'Variable __MSG_extTagline__ used but not defined')],
    'manifest-csp': [typecheck, loadFails("sec.ext.manifest/beh.ext.host: Chromium يرفض 'unsafe-eval' فلا تُحمَّل الإضافة", "Insecure CSP value \"'unsafe-eval'\""), e2eFails('beh.e2e: لا رحلة تعمل لأن الإضافة لا تُحمَّل')],
    'low-contrast': [typecheck, unit, axe(0, 'design.a11y: axe color-contrast بأثر serious (نسبة 1.98:1)', ['AXE color-contrast serious', '1\\.98'])],
    'missing-dir': [typecheck, rtl('design.rtl.static: الجذر بلا dir فاتجاهه المحسوب ltr مع lang=ar', ['DIR attr=null lang=ar computed=ltr'])],
    'vuln-dep': [typecheck, unit, run('dep-installed', 'ls node_modules/ayar-vuln-fake/package.json && node -e "console.log(require(\'ayar-vuln-fake/package.json\').version)"', 'sec.deps: التبعية ayar-vuln-fake@1.0.0 مثبتة من قفل pnpm', { match: ['1\\.0\\.0'] }),
      { id: 'sec.deps', pending: true, proves: 'sec.deps: ثغرة تجريبية في ayar-vuln-fake@1.0.0', reason: 'ينتظر E-09 (قاعدة OSV المصغرة في DEV-2)' }],
    'flaky-vitest': [run('stability', 'for i in 1 2 3 4 5; do pnpm exec vitest run src/lib/flaky.test.ts >/dev/null 2>&1; echo "run$i=$?"; done', 'beh.stability: تناوب إخفاق/نجاح عبر خمسة تكرارات', { match: ['run1=1', 'run2=0', 'run3=1', 'run4=0', 'run5=1'], evidence: true })],
    'flaky-playwright': [run('flaky', `${BUILD} && pnpm exec playwright test e2e/flaky.spec.ts --reporter=json`, 'beh.e2e: Playwright يسجل الحالة flaky بعد إعادة', { match: ['"status": "flaky"', '"flaky": 1'], evidence: true, excerpt: 600 })],
    'options-console-error': [typecheck, lint, build, e2eFails('beh.ext.host/beh.e2e: خطأ TypeError في وحدة تحكم options.html', ['صفحة الخيارات تُفتح دون أخطاء', 'Cannot set properties of null'])],
    'unresolved-cause': [run('unit', 'pnpm exec vitest run src/lib/remote.test.ts', 'beh.unit: إخفاق ثابت سببه غير محسوم', { exit: 1, match: ['expected undefined to be defined'], evidence: true })],
    'secret-in-test-log': [run('unit', 'pnpm exec vitest run src/lib/connect.test.ts', 'beh.unit: إخفاق يطبع السر في السجل', { exit: 1, match: ['connecting with key ayr_live_8f3c1a77d02e4b58a6c1e0d94f7b2a35d0c4'], evidence: true }), secrets(42, 'sec.secrets.files: السر في ملف الاختبار', ['"File": "src/lib/connect.test.ts"'])],
    'env-leak': [
      // بيئة نظيفة (env -i): لا يُطبع في الخرج إلا ما نمرره؛ فلا تتسرب بيئة جهاز المنفّذ إلى النتائج المحفوظة
      run('env-printed', 'env -i PATH="$PATH" MY_API_TOKEN=ayr_fakelogin_9a8b7c6d5e4f NPM_TOKEN=ayr_fakenpm_1f2e3d4c5b6a pnpm exec vitest run src/lib/env.test.ts', 'AT-48: السكربت يطبع البيئة (القيمتان المصطنعتان ظاهرتان في الخرج حين تمرران إليه)', { exit: 1, match: ['MY_API_TOKEN=ayr_fakelogin_9a8b7c6d5e4f', 'NPM_TOKEN=ayr_fakenpm_1f2e3d4c5b6a'], evidence: true }),
      run('json-report', 'env -i PATH="$PATH" pnpm exec vitest run src/lib/env.test.ts --reporter=json --outputFile=../report.json >/dev/null 2>&1; grep -o "ayr_envleak_5d2e9b1f7a3c4086b9e1d2c7a4f50e83" ../report.json | head -1', 'AT-48: السر المصطنع يصل إلى تقرير JSON للأداة', { match: ['ayr_envleak_5d2e9b1f7a3c4086b9e1d2c7a4f50e83'], evidence: true }),
      secrets(0, 'sec.secrets.files: السر لا يظهر حرفيًّا في الملفات (مبني وقت التشغيل)')],
    'integrity-real-fix': [typecheck, lint, unit, cov(0, 'التغطية فوق العتبات', ['100'])],
    'integrity-baseline': [typecheck,
      run('unit', 'pnpm exec vitest run', 'beh.unit: اختبار الوسيط واختبار اللقطة يفشلان', { exit: 1, match: ['الوسيط لأعداد متعددة الخانات', 'يصوغ الناتج بالأرقام العربية', '2 failed'], evidence: true }),
      run('lint', 'pnpm exec eslint src e2e', 'code.lint: no-console في src/popup.ts', { exit: 1, match: ['src/popup.ts', 'no-console'], evidence: true }),
      ],
    'integrity-skip': [typecheck, lint, run('unit', 'pnpm exec vitest run', 'beh.unit: يمر مع اختبار متخطًّى (1 skipped) بينما العيب باقٍ', { match: ['1 skipped', 'passed'], evidence: true }), grep('skip-present', 'it.skip', 'src/lib/stats.test.ts', 'integ.guard: it.skip في الملف'), grep('bug-present', '.sort()', 'src/lib/stats.ts', 'العيب الأصلي (sort نصّي) لم يُصلح')],
    'integrity-eslint-disable': [typecheck, run('lint', 'pnpm exec eslint src e2e', 'code.lint: يمر لأن الخطأ أُسكت', {}), unit, grep('disable-present', 'eslint-disable-next-line no-console', 'src/popup.ts', 'integ.guard: eslint-disable مضاف')],
    'integrity-snapshot-update': [typecheck, lint, run('unit', 'pnpm exec vitest run', 'beh.unit: يمر لأن اللقطة حُدّثت', { match: ['passed'], nomatch: ['failed'] }), grep('snap-changed', '| الحروف', 'src/lib/__snapshots__/count.test.ts.snap', 'integ.guard: ملف اللقطة يحمل الفاصل الجديد')],
    'integrity-threshold-lowered': [typecheck, lint, unit, cov(0, 'التغطية تمر لأن العتبة خُفضت', ['passed']), run('coverage-original-thresholds', 'pnpm exec vitest run --coverage --coverage.thresholds.lines=90 --coverage.thresholds.functions=90 --coverage.thresholds.branches=80 --coverage.thresholds.statements=90', 'العتبات الأصلية (90/90/80) لم تكن لتمر: mean بلا اختبار', { exit: 1, match: ['does not meet global threshold'], evidence: true }), grep('threshold-lowered', 'lines: 60', 'vitest.config.ts', 'integ.guard: العتبة 60 بدل 90')],
  },
};
void withoutIds;
