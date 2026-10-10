// E-07 (6): أثر حجب المتغيرات الحساسة (G-35): أنماط C-18 (SESSION وAUTH وKEY وTOKEN وSECRET وPASSWORD وCREDENTIAL) تحجب
// متغيرات عادية مثل SSH_AUTH_SOCK وTERM_SESSION_ID وAPPLE_… هل تتأثر الأدوات؟ نشغّل vitest وpytest وgit وpnpm وuv ببيئة
// الدخول الحقيقية ثم بالبيئة نفسها بعد الحجب، ونقارن رموز الخروج. ونسجّل أسماء ما حُجب (لا قيمه).
//   node spikes/E-07-toolchains/env-mask.mjs
import path from 'node:path';
import { HOME, NVM_NODE, baseEnv, excerpt, materialize, resultsDir, rmrf, run, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const SENSITIVE = /SESSION|AUTH|KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE/i; // أنماط C-18 المقترحة
// بيئة الدخول كما يقرؤها C-07: zsh -ilc env -0 (E-06)
const login = await run('/bin/zsh', { args: ['-ilc', 'env -0'], env: { HOME, USER: process.env.USER, LOGNAME: process.env.USER, SHELL: '/bin/zsh', TERM: 'dumb', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', AYAR_RESOLVING_ENVIRONMENT: '1' }, timeout: 15 });
// البيئة الفعلية للمحرك = بيئة جلسة المستخدم الرسومية (launchd: SSH_AUTH_SOCK و__CF_USER_TEXT_ENCODING …) التي يرثها التطبيق،
// زائد ما تضيفه صدفة الدخول. هنا تمثّل بيئة هذه العملية جلسةَ المستخدم (تحمل SSH_AUTH_SOCK وأمثاله)؛ تُسجَّل الأسماء فقط.
const loginEnv = Object.fromEntries(login.out.split('\0').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
const full = { ...process.env, ...loginEnv };
const masked = Object.fromEntries(Object.entries(full).filter(([k]) => !SENSITIVE.test(k)));
const hidden = Object.keys(full).filter((k) => SENSITIVE.test(k)).sort();
const NODE24 = path.join(NVM_NODE, 'v24.16.0', 'bin');
const withPath = (e) => ({ ...e, PATH: `${NODE24}:${baseEnv().PATH}:${e.PATH ?? ''}`, NO_COLOR: '1', CI: '1' });

const out = { at: new Date().toISOString(), loginEnvCount: Object.keys(full).length, hiddenNames: hidden, cases: [] };
const compare = async (name, cmd, cwd, extra = {}) => {
  const a = await run(cmd, { cwd, env: withPath({ ...full, ...extra }), timeout: 300 });
  const b = await run(cmd, { cwd, env: withPath({ ...masked, ...extra }), timeout: 300 });
  const row = { name, full: { code: a.code, ms: a.ms }, masked: { code: b.code, ms: b.ms, stderr: excerpt(b.err, 300) }, same: a.code === b.code };
  out.cases.push(row);
  console.log(`• ${name}: full=${a.code} masked=${b.code} ${row.same ? 'متطابق' : 'مختلف'}`);
};

{
  const { base, root } = await materialize('FX-ADAPTERS', 'good', 'ayar-e07env');
  await compare('pnpm install --frozen-lockfile (vitest)', 'pnpm install --frozen-lockfile --silent', path.join(root, 'vitest'));
  await compare('vitest run', 'pnpm exec vitest run', path.join(root, 'vitest'));
  await compare('uv sync --frozen (pytest)', 'uv sync --frozen -q', path.join(root, 'pytest'), { UV_PYTHON_PREFERENCE: 'only-system' });
  await compare('pytest', '.venv/bin/python -m pytest -p no:cacheprovider -q', path.join(root, 'pytest'));
  await compare('git init + commit في مجلد مؤقت', 'git init -q t && cd t && git -c user.name=a -c user.email=a@b commit -q --allow-empty -m x', root);
  await compare('ssh-add -l (يحتاج SSH_AUTH_SOCK)', 'ssh-add -l', root);
  rmrf(base);
}
writeJson(path.join(results, 'env-mask.json'), out);
console.log(`\nحُجب ${hidden.length} متغيرًا من ${out.loginEnvCount}: ${hidden.join('، ')}`);
