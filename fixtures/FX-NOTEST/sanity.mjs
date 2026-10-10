// تشغيلات السلامة لـ FX-NOTEST (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-NOTEST)
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, ...extra });
const REFS = 'lychee --offline --no-progress --include-fragments README.md docs/index.html docs/guide.md';
const refsOk = run('refs', REFS, 'code.refs.local: كل المراجع المحلية والمراسي سليمة', { match: ['0 Errors'], evidence: true });
const refsBad = (proves, match) => run('refs', REFS, proves, { exit: 2, match, evidence: true });
const complexity = (exit, proves, match = []) => run('complexity', `eslint --no-config-lookup --rule '{"complexity":["error",10]}' src`, proves, { exit, match, evidence: exit !== 0 });
const imports = run('imports', `node --input-type=module -e "import fs from 'node:fs'; let n = 0; for (const f of fs.readdirSync('src')) { await import('./src/' + f); n++; } console.log('IMPORTED ' + n);"`, 'الوحدات الأربع عشرة تُحمَّل دون خطأ', { match: ['IMPORTED 14'], evidence: true });
const facts = run('facts', `echo "logic_files=$(ls src/*.js | wc -l | tr -d ' ') test_files=$(find . -name '*.test.*' -o -name '*.spec.*' | wc -l | tr -d ' ')"`, 'حقائق AT-44: 14 ملف منطق و0 ملف اختبار', { match: ['logic_files=14 test_files=0'], evidence: true });

export default {
  versions: { node: 'node --version', eslint: 'eslint --version', lychee: 'lychee --version' },
  variants: {
    good: [imports, facts, refsOk, complexity(0, 'code.complexity: لا دالة تتجاوز 10')],
    'broken-md-link': [imports, refsBad('code.refs.local: docs/usage.md غير موجود', ['usage\\.md'])],
    'missing-image': [imports, refsBad('code.refs.local: img/logo-large.png غير موجود', ['logo-large\\.png'])],
    'broken-anchor': [imports, refsBad('code.refs.local: المرسى #setup غير موجود في guide.md', ['setup'])],
    'complex-function': [imports, complexity(1, 'code.complexity: validatePayload تتجاوز العتبة 10', ['validatePayload', 'complexity of 1\\d'])],
  },
};
