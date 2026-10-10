// تشغيلات السلامة لـ FX-MONO (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-MONO)
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, ...extra });
export default {
  setup: 'pnpm install --frozen-lockfile',
  versions: { node: 'node --version', pnpm: 'pnpm --version' },
  variants: {
    good: [run('root-test', 'pnpm test', 'beh.unit@packages/core وbeh.unit@packages/web: الاختباران يمران', { match: ['Tests\\s+3 passed', 'Tests\\s+1 passed'], evidence: true }),
      run('core', 'pnpm --filter @mono/core test', 'beh.unit@packages/core منفردًا', { match: ['3 passed'] }), run('web', 'pnpm --filter @mono/web test', 'beh.unit@packages/web منفردًا', { match: ['1 passed'] })],
    'failing-core': [
      run('core', 'pnpm --filter @mono/core test', 'beh.unit@packages/core: يفشل اختبار «يحسب المتوسط»', { exit: 1, match: ['يحسب المتوسط', '1 failed'], evidence: true }),
      run('web', 'pnpm --filter @mono/web test', 'beh.unit@packages/web: يمر رغم فشل core', { match: ['1 passed'] }),
      run('root-test', 'pnpm test', 'سكربت الجذر ينتهي بإخفاق من core', { exit: 1, match: ['يحسب المتوسط'] })],
  },
};
