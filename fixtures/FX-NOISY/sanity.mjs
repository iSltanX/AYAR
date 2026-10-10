// تشغيلات السلامة لـ FX-NOISY (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-NOISY)
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, evidence: true, ...extra });
export default {
  prepare: 'git init -q && git add -A && git -c user.name=fx -c user.email=fx@ayar.local commit -q -m base',
  versions: { node: 'node --version' },
  variants: {
    good: [
      run('status-before', 'git status --porcelain | wc -l | tr -d " "', 'قبل التشغيل: المستودع المؤقت نظيف', { match: ['^0$'] }),
      run('test', 'npm test', 'beh.unit: الاختباران ينجحان بالسكربت المركب', { match: ['pass 2', 'fail 0'] }),
      run('side-effects', 'git status --porcelain', 'C-17: ملفان جديدان وملف متتبع معدّل بعد التشغيل', { match: [' M data/runs\\.json', '\\?\\? \\.cache/', '\\?\\? reports/'] }),
      run('tracked-diff', 'git diff --stat', 'data/runs.json تعدّل (runs: 0 ← 1)', { match: ['data/runs\\.json'] }),
      run('nvmrc', 'cat .nvmrc && (ls "$HOME/.nvm/versions/node" | grep -c "^v22\\.11\\.0$" || true)', '.nvmrc يطلب 22.11.0 وهو غير مثبت (عدد النسخ المطابقة 0)', { match: ['^22\\.11\\.0$', '^0$'] }),
    ],
    'pnpm-unpinned': [
      run('declared', 'node -e "console.log(\'PM_DECLARED=\' + require(\'./package.json\').packageManager)"', 'packageManager يطلب pnpm@9.15.4 (والمثبت 12.8.1)', { match: ['PM_DECLARED=pnpm@9\\.15\\.4'] }),
      run('pnpm-offline', 'pnpm --version', 'pnpm (عبر Corepack) بلا شبكة لا ينزّل pnpm@9.15.4: يخرج بخطأ «Network access disabled» لا بتنزيل صامت (AT-31)', { exit: 1, env: { COREPACK_ENABLE_NETWORK: '0' }, match: ['Network access disabled by the environment', 'pnpm-9\\.15\\.4'] }),
    ],
  },
};
