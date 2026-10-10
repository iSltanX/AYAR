// E-07 (2): سلوك shims ومديري الإصدارات عند غياب النسخة، ومنع التثبيت التلقائي والشبكة (C-07، الخطوة 4).
//   - corepack مع packageManager غير مثبت: COREPACK_ENABLE_NETWORK=0 يمنع التنزيل.
//   - pnpm 12 نفسه مع packageManager مختلف: هل يبدّل نسخته (manage-package-manager-versions) أم يخطئ؟
//   - nvm مع .nvmrc يطلب نسخة غير مثبتة: nvm use لا يتصل بالشبكة. وقراءة ~/.nvm/alias/default من الملف.
//   - mise (منزَّل في ~/.cache/ayar-dev2/mise، مثبت الإصدار) في مجلد مؤقت مع .tool-versions لنسخة غير مثبتة:
//     MISE_*_AUTO_INSTALL=0 وMISE_OFFLINE=1 يمنعان التنزيل.
//   node spikes/E-07-toolchains/shims.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DEV2_CACHE, HOME, NVM_NODE, baseEnv, excerpt, materialize, resultsDir, rmrf, run, snapshot, diffSnapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const out = { at: new Date().toISOString(), cases: [] };
const rec = (name, r, extra = {}) => { const row = { name, code: r.code, signal: r.signal, ms: r.ms, timedOut: r.timedOut, out: excerpt(r.out, 600), err: excerpt(r.err, 600), ...extra }; out.cases.push(row); console.log(`• ${name}: exit=${r.code} ${r.ms}ms ${row.note ?? ''}`); return row; };

const NODE24 = path.join(NVM_NODE, 'v24.16.0', 'bin');

// ── corepack (FX-NOISY/pnpm-unpinned: packageManager = pnpm@9.15.4 غير مثبت) ──
{
  const { base, root } = await materialize('FX-NOISY', 'pnpm-unpinned');
  const cache = tmpdir('corepack-home');
  const env = baseEnv({ COREPACK_HOME: cache, PATH: `${NODE24}:/usr/bin:/bin` });
  const before = snapshot(cache);
  rec('corepack pnpm --version · COREPACK_ENABLE_NETWORK=0', await run('corepack pnpm --version', { cwd: root, env: { ...env, COREPACK_ENABLE_NETWORK: '0' }, timeout: 60 }), { note: 'يجب أن يفشل فورًا دون تنزيل', corepackHomeDiff: diffSnapshot(before, snapshot(cache)) });
  rec('corepack pnpm --version · COREPACK_ENABLE_STRICT=0 COREPACK_ENABLE_NETWORK=0', await run('corepack pnpm --version', { cwd: root, env: { ...env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_STRICT: '0' }, timeout: 60 }), { corepackHomeDiff: diffSnapshot(before, snapshot(cache)) });
  // pnpm 12.8.1 نفسه داخل المشروع: هل يحاول تبديل نسخته إلى 9.15.4 (manage-package-manager-versions)؟
  rec('pnpm --version داخل مشروع packageManager=pnpm@9.15.4 (الافتراضي)', await run('pnpm --version', { cwd: root, env: { ...env, COREPACK_ENABLE_NETWORK: '0' }, timeout: 60 }), { note: 'pnpm 12 يدير نسخه بنفسه؛ يُراقب هل يحاول التنزيل' });
  rec('pnpm --version · manage-package-manager-versions=false', await run('pnpm --config.manage-package-manager-versions=false --version', { cwd: root, env: { ...env, COREPACK_ENABLE_NETWORK: '0' }, timeout: 60 }));
  rec('pnpm --version · npm_config_manage_package_manager_versions=false', await run('pnpm --version', { cwd: root, env: { ...env, COREPACK_ENABLE_NETWORK: '0', npm_config_manage_package_manager_versions: 'false' }, timeout: 60 }));
  rec('pnpm install --frozen-lockfile --offline داخل المشروع نفسه (manage=false)', await run('pnpm install --frozen-lockfile --offline --config.manage-package-manager-versions=false', { cwd: root, env, timeout: 120 }), { note: 'المشروع بلا تبعيات: يثبت أن pnpm يعمل رغم اختلاف packageManager حين يُعطَّل التبديل' });
  rmrf(base); rmrf(cache);
}

// ── nvm: .nvmrc يطلب 22.11.0 (غير مثبتة)، و.nvmrc آخر يطلب 24 (مثبتة) ──
{
  const { base, root } = await materialize('FX-NOISY', 'good');
  const nvmSh = path.join(HOME, '.nvm', 'nvm.sh');
  const env = baseEnv({ NVM_DIR: path.join(HOME, '.nvm'), PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  rec(`nvm use (.nvmrc = ${nvmrc}، غير مثبتة)`, await run(`. "${nvmSh}" --no-use >/dev/null 2>&1; cd "${root}" && nvm use 2>&1; echo "nvm_exit=$?"`, { env, timeout: 30 }), { note: 'يجب ألا ينزّل شيئًا: nvm use لا يثبّت' });
  rec('nvm version 24 (حل الاسم المستعار من الملفات)', await run(`. "${nvmSh}" --no-use >/dev/null 2>&1; nvm version 24; nvm version default; nvm which 24 2>&1`, { env, timeout: 30 }));
  // القراءة من الملفات دون nvm (C-07، الخطوة 3): alias/default ثم أعلى v24.x في المجلد
  const alias = fs.readFileSync(path.join(HOME, '.nvm', 'alias', 'default'), 'utf8').trim();
  const versions = fs.readdirSync(NVM_NODE).filter((v) => /^v\d+/.test(v));
  const resolve = (want) => versions.filter((v) => v.startsWith(`v${want}.`) || v === `v${want}`).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) ?? null;
  const fileRead = { aliasDefault: alias, versions, resolvedDefault: resolve(alias), resolvedNvmrc: resolve(nvmrc.replace(/^v/, '').split('.')[0]) === null ? null : (versions.includes(`v${nvmrc}`) ? `v${nvmrc}` : `غير مثبتة بالضبط؛ الأقرب في الرئيسي نفسه: ${resolve(nvmrc.split('.')[0])}`) };
  out.cases.push({ name: 'قراءة nvm من الملفات (بلا تشغيل nvm)', ...fileRead });
  console.log('• قراءة nvm من الملفات:', JSON.stringify(fileRead));
  rmrf(base);
}

// ── mise في مجلد مؤقت ──
{
  const mise = path.join(DEV2_CACHE, 'mise', 'mise', 'bin', 'mise');
  const home = tmpdir('mise-home');
  const proj = path.join(home, 'proj'); fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, '.tool-versions'), 'nodejs 99.99.99\n');
  const env = baseEnv({ MISE_DATA_DIR: path.join(home, 'data'), MISE_CACHE_DIR: path.join(home, 'cache'), MISE_CONFIG_DIR: path.join(home, 'cfg'), MISE_STATE_DIR: path.join(home, 'state'), MISE_TRUSTED_CONFIG_PATHS: proj, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const off = { MISE_AUTO_INSTALL: '0', MISE_EXEC_AUTO_INSTALL: '0', MISE_NOT_FOUND_AUTO_INSTALL: '0', MISE_OFFLINE: '1', MISE_YES: '0' };
  const before = snapshot(home);
  rec('mise --version', await run(mise, { args: ['--version'], cwd: proj, env, timeout: 20 }));
  rec('mise exec -- node -v (nodejs 99.99.99 غير مثبتة) · التثبيت التلقائي معطل وOFFLINE', await run(mise, { args: ['exec', '--', 'node', '-v'], cwd: proj, env: { ...env, ...off }, timeout: 60 }), { note: 'يجب أن يفشل دون تنزيل', homeDiff: diffSnapshot(before, snapshot(home)) });
  rec('mise which node · التثبيت التلقائي معطل', await run(mise, { args: ['which', 'node'], cwd: proj, env: { ...env, ...off }, timeout: 60 }));
  rec('mise ls --current', await run(mise, { args: ['ls', '--current'], cwd: proj, env: { ...env, ...off }, timeout: 60 }));
  const shims = path.join(home, 'data', 'shims');
  rec('mise reshim ثم جرد مجلد shims', await run(`"${mise}" reshim; ls -la "${shims}" 2>&1 | head`, { cwd: proj, env: { ...env, ...off }, timeout: 60 }), { shimsExist: fs.existsSync(shims) });
  // الحالة الافتراضية (التثبيت التلقائي مفعّل) مع OFFLINE وحده: هل يحاول التنزيل؟
  rec('mise exec -- node -v · الإعدادات الافتراضية + MISE_OFFLINE=1', await run(mise, { args: ['exec', '--', 'node', '-v'], cwd: proj, env: { ...env, MISE_OFFLINE: '1', MISE_YES: '0' }, timeout: 60 }), { homeDiff: diffSnapshot(before, snapshot(home)) });
  rmrf(home);
}

writeJson(path.join(results, 'shims.json'), out);
console.log(`\nكُتب ${path.join(results, 'shims.json')}`);
