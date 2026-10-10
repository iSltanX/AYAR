// E-15: اكتشاف **للقراءة فقط** لمشاريع المالك الحقيقية (Rasd وTars وWasl) بسكربت تجربة يطبّق افتراضات C-06، دون تشغيل أي
// أمر فيها ودون كتابة شيء (ولا .ayar/) ودون نسخ محتوياتها: يُسجَّل ما اكتُشف وصفًا (المدير والإطار والسكربتات بأسمائها وتصنيفها
// والفروق عن الافتراضات). ملفات الأسرار (.env* و.npmrc وأمثالها) تُسجَّل بأسمائها فقط ولا تُقرأ. وجرد (الحجم والوقت) قبل وبعد
// لإثبات عدم التغيير. والمخرج results/<project>.json وresults/summary.md.
//   node spikes/E-15-owner-projects/discover.mjs
import fs from 'node:fs';
import path from 'node:path';
import { resultsDir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const OWNERS = { Rasd: '/Volumes/iSltanXx/Projects/Brave/Rasd', Tars: '/Volumes/iSltanXx/Projects/Tars', Wasl: '/Volumes/iSltanXx/Projects/Plugins/Wasl' };
const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'coverage', 'target', 'Pods', 'DerivedData', '.gradle']);
const OUTPUT_DIRS = new Set(['dist', 'build', 'out', '.output']);
const LIMITS = { depth: 12, entries: 100000, configBytes: 2 * 1024 * 1024 };
const SECRET_NAME = /^\.env(\..*)?$|^\.npmrc$|^\.pypirc$|^\.netrc$|\.(pem|key|p12|cer|keychain)$|^id_(rsa|ed25519|ecdsa)$/i;
const TEST_PATTERNS = { vitestOrJest: /\.(test|spec)\.[cm]?[jt]sx?$/, playwright: /\.spec\.[cm]?[jt]s$/, pytest: /^(test_.*|.*_test)\.py$/, e2eDir: /^(e2e|tests?\/e2e)\//, storybook: /\.stories\.[cm]?[jt]sx?$/ };
const CONFIG_FILES = ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.base.json', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.json', '.eslintrc.cjs', '.eslintrc.js', 'biome.json', 'biome.jsonc', '.prettierrc', 'prettier.config.js', 'vite.config.ts', 'vite.config.js', 'vite.config.mts', 'svelte.config.js', 'next.config.js', 'next.config.mjs', 'astro.config.mjs', 'nuxt.config.ts', 'wxt.config.ts', 'playwright.config.ts', 'playwright.config.js', 'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'jest.config.js', 'jest.config.ts', 'knip.json', 'knip.config.ts', 'pyproject.toml', 'requirements.txt', 'uv.lock', 'poetry.lock', 'Pipfile', 'Cargo.toml', 'Cargo.lock', 'go.mod', 'Package.swift', '.nvmrc', '.node-version', '.tool-versions', 'mise.toml', '.python-version', '.gitattributes', '.gitmodules', 'lychee.toml', '.gitleaks.toml', 'osv-scanner.toml', '.semgrep.yml', 'manifest.json', 'esbuild.config.mjs', 'rollup.config.js', 'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', '.editorconfig', 'README.md', 'LICENSE'];

function walk(root) {
  const inv = new Map(); const files = []; const warnings = []; let entries = 0; let partial = false; const outputs = [];
  const rec = (dir, depth) => {
    if (partial) return;
    if (depth > LIMITS.depth) { partial = true; warnings.push(`تجاوز العمق ${LIMITS.depth} عند ${path.relative(root, dir)}`); return; }
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { warnings.push(`تعذّرت قراءة ${path.relative(root, dir)}: ${e.code}`); return; }
    for (const e of es) {
      if (++entries > LIMITS.entries) { partial = true; return; }
      const p = path.join(dir, e.name); const rel = path.relative(root, p);
      if (e.isSymbolicLink()) { let target = null; try { target = fs.realpathSync(p); } catch { /* معطوب */ } files.push({ rel, symlink: true, insideRoot: target ? target.startsWith(root + path.sep) : null }); continue; }
      if (e.isDirectory()) { if (SKIP.has(e.name)) { inv.set(rel + '/', 'skipped'); continue; } if (OUTPUT_DIRS.has(e.name) && depth <= 1) { outputs.push({ rel, sizeBytes: dirSize(p) }); continue; } rec(p, depth + 1); continue; }
      if (!e.isFile()) continue;
      const st = fs.statSync(p); inv.set(rel, `${st.size}:${st.mtimeMs}`);
      files.push({ rel, name: e.name, size: st.size });
    }
  };
  rec(root, 0);
  return { inv, files, warnings, partial, entries, outputs };
}
function dirSize(d) { let n = 0; const rec = (x) => { let es; try { es = fs.readdirSync(x, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(x, e.name); if (e.isDirectory()) rec(p); else if (e.isFile()) { try { n += fs.statSync(p).size; } catch { /* */ } } } }; rec(d); return n; }
function fullInventory(root) { const m = new Map(); const rec = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isSymbolicLink()) { try { const st = fs.lstatSync(p); m.set(path.relative(root, p), `L:${st.mtimeMs}`); } catch { /* */ } continue; } if (e.isDirectory()) rec(p); else if (e.isFile()) { try { const st = fs.statSync(p); m.set(path.relative(root, p), `${st.size}:${st.mtimeMs}`); } catch { /* */ } } } }; rec(root); return m; }
const readJsonSafe = (p) => { try { const st = fs.statSync(p); if (st.size > LIMITS.configBytes) return { _tooLarge: st.size }; return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { _invalid: e.message.slice(0, 80) }; } };
const readTextHead = (p, n = 4000) => { try { return fs.readFileSync(p, 'utf8').slice(0, n); } catch { return ''; } };
const classifyScript = (name, cmd) => { const composite = /&&|;|\|\|?|\$\(/.test(cmd); const first = cmd.trim().split(/\s+/)[0]; const kind = /^(test|test:.*)$/.test(name) || /\b(vitest|jest|playwright|mocha|node --test|pytest|cypress)\b/.test(cmd) ? 'اختبار' : /typecheck|tsc|svelte-check|vue-tsc|check/.test(name + ' ' + cmd) ? 'فحص أنواع' : /lint|eslint|biome/.test(name + ' ' + cmd) ? 'تدقيق' : /^build|\b(vite build|tsc -b|esbuild|rollup|webpack|cargo build|tauri build)\b/.test(name + ' ' + cmd) ? 'بناء' : /format|prettier/.test(name + ' ' + cmd) ? 'تنسيق' : /e2e|wdio|cypress/.test(name) ? 'رحلات' : /^dev|start|serve|preview|watch/.test(name) ? 'تشغيل' : 'أخرى'; return { name, kind, tool: first, composite, length: cmd.length }; };

const summary = [];
for (const [name, root] of Object.entries(OWNERS)) {
  if (!fs.existsSync(root)) { summary.push(`| ${name} | غير موجود | | |`); continue; }
  const invBefore = fullInventory(root);
  const t0 = Date.now();
  const w = walk(root);
  const names = new Set(w.files.map((f) => f.name));
  const byRel = new Map(w.files.map((f) => [f.rel, f]));
  const facts = { project: name, root, scannedAt: new Date().toISOString(), entries: w.entries, partial: w.partial, warnings: w.warnings, outputDirs: w.outputs, symlinks: w.files.filter((f) => f.symlink).map((f) => ({ rel: f.rel, insideRoot: f.insideRoot })), configFilesPresent: CONFIG_FILES.filter((c) => byRel.has(c)), secretFilesByName: w.files.filter((f) => f.name && SECRET_NAME.test(f.name)).map((f) => f.rel), ayarDir: fs.existsSync(path.join(root, '.ayar')) };
  // الحزمة والمدير
  const pkg = byRel.has('package.json') ? readJsonSafe(path.join(root, 'package.json')) : null;
  if (pkg) {
    facts.package = { name: pkg.name, private: pkg.private ?? null, type: pkg.type ?? 'commonjs', packageManager: pkg.packageManager ?? null, enginesNode: pkg.engines?.node ?? null, workspaces: pkg.workspaces ?? null, hasBin: !!pkg.bin, hasExportsOrMain: !!(pkg.exports || pkg.main), depCount: Object.keys(pkg.dependencies ?? {}).length, devDepCount: Object.keys(pkg.devDependencies ?? {}).length, scripts: Object.entries(pkg.scripts ?? {}).map(([k, v]) => classifyScript(k, String(v))), notableDeps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => /^(vite|vitest|jest|@playwright\/test|playwright|eslint|@biomejs\/biome|prettier|typescript|svelte|@sveltejs\/kit|react|vue|next|astro|wxt|@crxjs\/vite-plugin|plasmo|esbuild|rollup|webpack|knip|tailwindcss|@tauri-apps\/cli|@tauri-apps\/api|electron|obsidian|@types\/chrome|webextension-polyfill|storybook|@storybook\/.*|msw|fast-check|@stryker-mutator\/core|cypress|mocha|husky|lint-staged|size-limit|@size-limit\/.*)$/.test(d)) };
  }
  facts.lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb', 'uv.lock', 'poetry.lock', 'Cargo.lock'].filter((l) => byRel.has(l));
  facts.runtimeFiles = Object.fromEntries(['.nvmrc', '.node-version', '.tool-versions', 'mise.toml', '.python-version'].filter((f) => byRel.has(f)).map((f) => [f, readTextHead(path.join(root, f), 60).trim()]));
  // النوع (C-06): manifest.json أين؟ وأطر الإضافات
  const manifests = w.files.filter((f) => f.name === 'manifest.json').map((f) => { const j = readJsonSafe(path.join(root, f.rel)); return { rel: f.rel, manifest_version: j.manifest_version ?? null, hasDefaultLocale: !!j.default_locale, hasLocalesDir: fs.existsSync(path.join(root, path.dirname(f.rel), '_locales')), permissions: Array.isArray(j.permissions) ? j.permissions.length : null, hostPermissions: Array.isArray(j.host_permissions) ? j.host_permissions.length : null, isObsidian: 'minAppVersion' in j, hasCsp: !!j.content_security_policy }; });
  facts.manifests = manifests;
  facts.typeSignals = { browserExtension: manifests.some((m) => m.manifest_version === 3), obsidianPlugin: manifests.some((m) => m.isObsidian) || names.has('main.ts') && byRel.has('manifest.json'), tauri: fs.existsSync(path.join(root, 'src-tauri', 'tauri.conf.json')), cargoToml: w.files.filter((f) => f.name === 'Cargo.toml').map((f) => f.rel), electron: !!(pkg?.devDependencies?.electron || pkg?.dependencies?.electron), svelte: byRel.has('svelte.config.js'), vite: facts.configFilesPresent.some((c) => c.startsWith('vite.config')), wxt: byRel.has('wxt.config.ts'), esbuild: byRel.has('esbuild.config.mjs') };
  // الاختبار والجودة
  const testFiles = { unit: w.files.filter((f) => f.name && TEST_PATTERNS.vitestOrJest.test(f.name) && !TEST_PATTERNS.e2eDir.test(f.rel)).length, e2eDir: w.files.filter((f) => TEST_PATTERNS.e2eDir.test(f.rel)).length, pytest: w.files.filter((f) => f.name && TEST_PATTERNS.pytest.test(f.name)).length, stories: w.files.filter((f) => f.name && TEST_PATTERNS.storybook.test(f.name)).length, rust: w.files.filter((f) => f.rel.endsWith('.rs')).length };
  facts.tests = testFiles;
  facts.quality = { eslint: facts.configFilesPresent.filter((c) => /eslint/.test(c)), biome: facts.configFilesPresent.filter((c) => /biome/.test(c)), prettier: facts.configFilesPresent.filter((c) => /prettier/.test(c)), tsconfig: facts.configFilesPresent.filter((c) => /tsconfig/.test(c)), knip: facts.configFilesPresent.filter((c) => /knip/.test(c)), secretsConfig: facts.configFilesPresent.filter((c) => /gitleaks|semgrep|osv|lychee/.test(c)) };
  // workflows
  const wfDir = path.join(root, '.github', 'workflows');
  facts.workflows = fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => { const t = readTextHead(path.join(wfDir, f), 20000); return { file: f, runSteps: (t.match(/^\s+-?\s*run:/gm) ?? []).length, usesSecrets: /\$\{\{\s*secrets\./.test(t), usesExpressions: (t.match(/\$\{\{/g) ?? []).length, nodeVersions: [...new Set((t.match(/node-version:\s*['"]?([\w.]+)/g) ?? []).map((s) => s.split(':')[1].replace(/['"\s]/g, '')))] }; }) : [];
  // المراجع (رموز وخطوط وOpenAPI وسياسات)
  facts.references = { tokensFiles: w.files.filter((f) => /\.tokens\.json$|^tokens\.json$|style-dictionary/.test(f.rel)).map((f) => f.rel).slice(0, 5), cssRootVars: w.files.filter((f) => /\.css$/.test(f.rel) && !/node_modules/.test(f.rel)).slice(0, 40).filter((f) => /:root\s*\{[^}]*--/.test(readTextHead(path.join(root, f.rel), 20000))).map((f) => f.rel).slice(0, 5), tailwindTheme: w.files.filter((f) => /\.css$/.test(f.rel)).slice(0, 40).some((f) => /@theme/.test(readTextHead(path.join(root, f.rel), 20000))), openapi: w.files.filter((f) => /openapi|swagger/i.test(f.name)).map((f) => f.rel).slice(0, 3), locales: w.files.filter((f) => /(^|\/)_locales\//.test(f.rel)).length, i18nFiles: w.files.filter((f) => /(^|\/)(i18n|locales|lang)\/.*\.(json|ts|js)$/.test(f.rel)).length, rtlOrArabic: w.files.filter((f) => /\.(html|svelte|vue|tsx|jsx)$/.test(f.rel)).slice(0, 60).some((f) => /dir=["']rtl["']|lang=["']ar/.test(readTextHead(path.join(root, f.rel), 20000))), permissionsPolicy: w.files.filter((f) => /permissions?-policy|PERMISSIONS\.md/i.test(f.name)).map((f) => f.rel).slice(0, 3) };
  facts.gitAttributes = byRel.has('.gitattributes') ? readTextHead(path.join(root, '.gitattributes'), 500).split('\n').filter(Boolean).length + ' سطر' : null;
  facts.hooksDirs = ['.husky', '.githooks', 'lefthook.yml', '.pre-commit-config.yaml'].filter((h) => fs.existsSync(path.join(root, h)));
  facts.durationMs = Date.now() - t0;
  // ما يختلف عن افتراضات C-06 وما لا يُدعم
  const diffs = [];
  if (manifests.length && !manifests.some((m) => /^(manifest\.json|src\/manifest\.json|public\/manifest\.json|static\/manifest\.json)$/.test(m.rel))) diffs.push(`manifest.json في موضع غير المواضع الأربعة المفترضة: ${manifests.map((m) => m.rel).join('، ')}`);
  if (manifests.some((m) => /^(dist|build|out)\//.test(m.rel))) diffs.push('manifest.json داخل مجلد مخرجات (مولَّد بالبناء)، فيعتمد sec.ext.manifest على code.build');
  if (facts.typeSignals.obsidianPlugin) diffs.push('إضافة Obsidian: manifest.json لها minAppVersion لا manifest_version، فلا يُصنف إضافة متصفح');
  if (pkg?.packageManager && facts.lockfiles.length && !facts.lockfiles.some((l) => l.startsWith(pkg.packageManager.split('@')[0]))) diffs.push(`packageManager=${pkg.packageManager.split('@')[0]} لكن القفل ${facts.lockfiles.join('، ')}`);
  if (pkg && !pkg.packageManager && facts.lockfiles.length === 0) diffs.push('لا packageManager ولا ملف قفل: المدير يُستنتج تخمينًا');
  if (facts.package?.scripts?.some((s) => s.composite && s.kind === 'اختبار')) diffs.push('سكربت الاختبار مركب (&& أو ;) فإضافة الوسائط غير مضمونة (C-15)');
  if (facts.typeSignals.tauri) diffs.push('تطبيق Tauri: الجزء الأصلي Rust (Cargo) اكتشاف وفحوص مخصصة فقط (17)');
  if (testFiles.rust) diffs.push(`${testFiles.rust} ملف Rust: اختباراته (cargo test) غير مدعومة محولًا؛ فحص مخصص`);
  if (facts.workflows.some((x) => x.usesSecrets)) diffs.push('workflow يستخدم secrets: خطواته «غير قابلة للتشغيل محليًّا كما هي»');
  if (!facts.quality.eslint.length && !facts.quality.biome.length) diffs.push('لا مدقق معلن (ESLint/Biome): code.lint غير منطبق مع بطاقة اقتراح');
  if (!testFiles.unit && !testFiles.pytest) diffs.push('لا ملفات اختبار بأنماط الأطر: beh.unit «ناقص»');
  if (facts.runtimeFiles['.nvmrc'] || facts.runtimeFiles['.node-version']) diffs.push(`يطلب Node ${facts.runtimeFiles['.nvmrc'] ?? facts.runtimeFiles['.node-version']} (يُقارن بالمثبت في E-07)`);
  facts.divergences = diffs;
  const invAfter = fullInventory(root);
  const changed = [...invAfter].filter(([k, v]) => invBefore.get(k) !== v).map(([k]) => k).concat([...invBefore.keys()].filter((k) => !invAfter.has(k)));
  facts.readOnlyProof = { filesInventoried: invBefore.size, changedAfterDiscovery: changed, ayarDirCreated: fs.existsSync(path.join(root, '.ayar')) };
  writeJson(path.join(results, `${name}.json`), facts);
  summary.push(`| ${name} | ${facts.package?.packageManager ?? '—'} / ${facts.lockfiles.join('، ') || 'لا قفل'} | ${Object.entries(facts.typeSignals).filter(([, v]) => v === true || (Array.isArray(v) && v.length)).map(([k]) => k).join('، ')} | ${facts.package?.scripts?.length ?? 0} سكربت (${facts.package?.scripts?.filter((s) => s.composite).length ?? 0} مركب) | ${testFiles.unit}/${testFiles.e2eDir}/${testFiles.rust} | ${facts.secretFilesByName.length} | ${diffs.length} | ${changed.length} |`);
  console.log(`• ${name}: entries=${w.entries} ${facts.durationMs}ms manager=${facts.package?.packageManager ?? '—'} locks=${facts.lockfiles.join(',')} type=${JSON.stringify(facts.typeSignals)} scripts=${facts.package?.scripts?.length} tests=${JSON.stringify(testFiles)} secrets=${facts.secretFilesByName.length} diffs=${diffs.length} changed=${changed.length}`);
  for (const d of diffs) console.log(`    - ${d}`);
}
fs.writeFileSync(path.join(results, 'summary.md'), ['| المشروع | المدير / القفل | إشارات النوع | السكربتات | اختبارات وحدة/رحلات/Rust | ملفات أسرار (بالاسم) | فروق عن C-06 | ملفات تغيّرت بعد الاكتشاف |', '|---|---|---|---|---|---|---|---|', ...summary].join('\n') + '\n');
console.log(`\nكُتب ${results}/summary.md`);
