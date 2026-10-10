// تشغيلات السلامة لـ FX-REPORTS (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-REPORTS)
// الفاحص المرجعي fixtures/tools/reports-check.mjs يطبق حماية القراءة (حجم، وعمق JSON، وXML سليم عبر xmllint، وSARIF الجزئي، وتعارض الرمز مع التقرير).
const run = (id, proves, match, extra = {}) => ({ id, cmd: 'node $FX_TOOLS/reports-check.mjs .', exit: 0, proves, match, evidence: true, ...extra });
const ok = (id) => `CASE ${id} OK`;
export default {
  versions: { node: 'node --version', xmllint: 'xmllint --version 2>&1 | head -1' },
  variants: {
    good: [run('reports', 'التقارير الأربعة تُقرأ سليمة', [ok('vitest-json'), ok('pytest-junit'), ok('eslint-json'), ok('semgrep-sarif')], { nomatch: ['BAD'] })],
    'junit-corrupt': [run('reports', 'beh.unit: JUnit تالف ← تعذّر', ['CASE pytest-junit BAD malformed-xml'], { nomatch: ['CASE (vitest-json|eslint-json|semgrep-sarif) BAD'] })],
    'sarif-incomplete': [run('reports', 'sec.sast: SARIF ناقص ← تعذّر', ['CASE semgrep-sarif BAD sarif-incomplete missing runs\\[0\\]\\.tool\\.driver\\.name'])],
    'json-too-deep': [run('reports', 'code.lint: JSON أعمق من الحد ← تعذّر', ['CASE eslint-json BAD json-too-deep 5000 > 64'])],
    oversize: [run('reports', 'beh.unit: تقرير أكبر من الحد ← تعذّر', ['CASE vitest-json BAD report-too-large'])],
    'exit0-with-failures': [run('reports', 'beh.unit: خروج 0 مع إخفاق في التقرير ← تعذّر (تعارض الأدلة)', ['CASE vitest-json BAD evidence-conflict exit_code=0 numFailedTests=1'])],
  },
};
