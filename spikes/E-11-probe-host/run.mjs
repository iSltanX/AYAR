// E-11: استضافة المسبار (الخطة 22، C-14): playwright-core داخل utilityProcess بنسخة Electron المحسومة في E-01 (44.7.0)،
// وتحميل FX-EXT (مبنية) بسياق دائم خفي وظاهر، وفحص axe، وثبات اللقطات في ثلاثة تشغيلات.
// الخطوات: بناء FX-EXT في مجلد مؤقت → تغليف التطبيق المشترك بوضع e11 → فتحه عبر LaunchServices (open) بمعاملات في ملف JSON →
// انتظار <userData>/e11.json → مقارنة اللقطات (sha256 ثم pixelmatch إن اختلفت) → النتائج في results/.
//   node spikes/E-11-probe-host/run.mjs [--skip-package]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { NVM_NODE, REPO, TC_HOME, baseEnv, excerpt, materialize, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const skipPackage = process.argv.includes('--skip-package');
const APP_DIR = path.join(REPO, 'spikes', 'E-01-electron-forge');
const NAME = 'AYAR Spike E11';
const APP = path.join(APP_DIR, 'out', `${NAME}-darwin-arm64`, `${NAME}.app`);
// userData للتطبيق المشترك «AYAR Spike» مهما كان productName (كما في E-06 وE-23)
const USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'AYAR Spike');
const NODE24 = path.join(NVM_NODE, 'v24.16.0', 'bin');
const out = { at: new Date().toISOString(), steps: {} };

// 1) FX-EXT مبنية
const { base, root } = await materialize('FX-EXT', 'good', 'ayar-e11');
const envP = baseEnv({ PATH: `${NODE24}:${baseEnv().PATH}` });
const inst = await run('pnpm install --frozen-lockfile --silent', { cwd: root, env: envP, timeout: 600 });
const build = await run('pnpm build', { cwd: root, env: envP, timeout: 600 });
out.steps.fxext = { install: inst.code, build: build.code, dist: fs.existsSync(path.join(root, 'dist', 'manifest.json')) };
console.log('• FX-EXT build:', JSON.stringify(out.steps.fxext));

// 2) Chromium وaxe وplaywright-core من صندوق DEV-1
const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
const chromiumDir = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const executablePath = path.join(cache, chromiumDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
const playwrightCorePath = path.join(TC_HOME, 'node', 'node_modules', 'playwright-core');
const axePath = path.join(TC_HOME, 'node', 'node_modules', 'axe-core', 'axe.min.js');
const du = await run(`du -sm "${path.join(cache, chromiumDir)}" | cut -f1`);
out.steps.chromium = { dir: chromiumDir, sizeMB: Number(du.out.trim()), executablePath: executablePath.replaceAll(os.homedir(), '~') };
const params = { playwrightCorePath, dist: path.join(root, 'dist'), executablePath, axePath, modes: ['headless', 'headed'], viewport: { width: 420, height: 640 } };
const paramsFile = path.join(base, 'e11-params.json');
fs.writeFileSync(paramsFile, JSON.stringify(params));

// 3) التغليف بوضع e11 (توقيع osxSign بهوية "-" مع DLV كما في E-06)
if (!skipPackage) {
  const envB = { ...envP, PATH: `/opt/homebrew/bin:${envP.PATH}`, SPIKE_MODE: 'e11', SPIKE_NAME: NAME, SPIKE_BUNDLE_ID: 'com.bysltan.ayar.spike.e11', SPIKE_IDENTITY: '-', SPIKE_DLV: '1' };
  const t0 = Date.now();
  const pk = await run('node_modules/.bin/electron-forge package', { cwd: APP_DIR, env: envB, timeout: 900 });
  out.steps.package = { exit: pk.code, ms: Date.now() - t0, tail: excerpt(pk.out.split('\n').slice(-4).join('\n') + pk.err.split('\n').slice(-4).join('\n'), 600) };
  console.log('• package:', pk.code, `${Math.round((Date.now() - t0) / 1000)}s`);
  if (pk.code !== 0) { console.error(pk.err.slice(-2000)); rmrf(base); process.exit(1); }
}

// 4) الفتح عبر LaunchServices ببيئة دنيا + المعاملات
rmrf(path.join(USER_DATA, 'e11.json'));
const t0 = Date.now();
const op = await run('/usr/bin/open', { args: ['-n', '-W', APP, '--args', '--no-selftest'], env: { HOME: os.homedir(), USER: os.userInfo().username, LOGNAME: os.userInfo().username, SHELL: '/bin/zsh', TMPDIR: os.tmpdir(), PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SPIKE_E11_PARAMS: paramsFile }, timeout: 900 });
out.steps.open = { exit: op.code, waitedMs: Date.now() - t0, err: excerpt(op.err, 300) };
const reportFile = path.join(USER_DATA, 'e11.json');
for (let i = 0; i < 60 && !fs.existsSync(reportFile); i++) await new Promise((r) => setTimeout(r, 1000));
if (!fs.existsSync(reportFile)) { console.error('لا تقرير e11.json'); rmrf(base); process.exit(1); }
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));

// 5) مقارنة اللقطات
const require = createRequire(import.meta.url);
let pixelmatch = null, PNG = null;
try { pixelmatch = require(path.join(TC_HOME, 'node', 'node_modules', 'pixelmatch')); PNG = require(path.join(TC_HOME, 'node', 'node_modules', 'pngjs')).PNG; pixelmatch = pixelmatch.default ?? pixelmatch; } catch { /* يُقارن بالبصمة فقط */ }
const modes = report.runs?.modes ?? [];
for (const m of modes) {
  const pngs = (m.pngs ?? []).map((b) => Buffer.from(b, 'base64'));
  delete m.pngs;
  m.stability = { identicalHashes: new Set(m.steps.screenshots?.map((s) => s.sha256)).size === 1, pairs: [] };
  if (pngs.length === 3) {
    for (let i = 0; i < pngs.length; i++) fs.writeFileSync(path.join(results, `popup-${m.mode}-${i + 1}.png`), pngs[i]);
    if (PNG && pixelmatch) for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
      const A = PNG.sync.read(pngs[a]), B = PNG.sync.read(pngs[b]);
      if (A.width !== B.width || A.height !== B.height) { m.stability.pairs.push({ a, b, sizeMismatch: true }); continue; }
      const diff = pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.1 });
      m.stability.pairs.push({ a: a + 1, b: b + 1, differingPixels: diff, pct: +((diff / (A.width * A.height)) * 100).toFixed(4) });
    }
  }
}
const headless = modes.find((m) => m.mode === 'headless'), headed = modes.find((m) => m.mode === 'headed');
if (headless?.steps?.screenshots?.[0] && headed?.steps?.screenshots?.[0] && PNG && pixelmatch) {
  const A = PNG.sync.read(fs.readFileSync(path.join(results, 'popup-headless-1.png'))), B = PNG.sync.read(fs.readFileSync(path.join(results, 'popup-headed-1.png')));
  out.headlessVsHeaded = A.width === B.width && A.height === B.height ? { differingPixels: pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.1 }), size: `${A.width}x${A.height}` } : { sizeMismatch: `${A.width}x${A.height} vs ${B.width}x${B.height}` };
}
out.report = report;
writeJson(path.join(results, 'run.json'), out);
for (const m of modes) console.log(`• ${m.mode}: launch=${m.steps.launchMs}ms sw=${m.steps.serviceWorker?.extensionId ? 'ok' : 'no'} axe=${JSON.stringify(m.steps.axe?.violations)} shots=${m.stability.identicalHashes ? 'identical' : JSON.stringify(m.stability.pairs)} optErrors=${m.steps.options?.consoleErrors?.length} errors=${m.errors.length} total=${m.totalMs}ms`);
console.log('• engine:', JSON.stringify(report.engine), 'headlessVsHeaded:', JSON.stringify(out.headlessVsHeaded));
rmrf(base);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
