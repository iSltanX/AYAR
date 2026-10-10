// E-07 (1): جرد للقراءة لسلاسل الأدوات ومديري الإصدارات على جهاز المالك، مع --version لكل أداة موجودة.
// لا يثبّت شيئًا ولا يغيّر شيئًا. يقرأ مجلدات مديري الإصدارات كما في C-07 (الخطوة 3) دون تشغيلها.
//   node spikes/E-07-toolchains/inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { HOME, NVM_NODE, run, resultsDir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);

// مجلدات PATH الاحتياطية في C-07 (الخطوة 2) ومجلدات نسخ nvm (لأنها ليست في PATH قبل تحميل nvm)
const fallbackDirs = ['/opt/homebrew/bin', '/usr/local/bin', '~/.local/share/mise/shims', '~/.asdf/shims', '~/.volta/bin', '~/.local/bin', '~/.cargo/bin', '~/.bun/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  .map((d) => d.replace(/^~/, HOME));
const nvmDirs = fs.existsSync(NVM_NODE) ? fs.readdirSync(NVM_NODE).sort().map((v) => path.join(NVM_NODE, v, 'bin')) : [];

const tools = {
  node: '--version', npm: '--version', npx: '--version', pnpm: '--version', yarn: '--version', bun: '--version', corepack: '--version',
  python3: '--version', 'python3.12': '--version', 'python3.13': '--version', uv: '--version', uvx: '--version', poetry: '--version', pipx: '--version', pyenv: '--version',
  mise: '--version', asdf: 'version', fnm: '--version', volta: '--version',
  git: '--version', gh: '--version', brew: '--version', xed: '--version', xcodebuild: '-version',
  semgrep: '--version', gitleaks: 'version', betterleaks: 'version', 'osv-scanner': '--version', lychee: '--version', k6: 'version', lighthouse: '--version',
  ruff: '--version', mypy: '--version', pyright: '--version', tsc: '--version', vitest: '--version', jest: '--version', playwright: '--version', eslint: '--version', biome: '--version', knip: '--version',
  code: '--version', cursor: '--version', zed: '--version',
};

const found = {};
for (const [tool, flag] of Object.entries(tools)) {
  const hits = [];
  for (const dir of [...fallbackDirs, ...nvmDirs]) {
    const p = path.join(dir, tool);
    if (!fs.existsSync(p)) continue;
    let real = p;
    try { real = fs.realpathSync(p); } catch { /* رابط معطوب */ }
    const r = await run(p, { args: flag.split(' '), timeout: 8 });
    hits.push({ path: p, realpath: real === p ? undefined : real, version: (r.out || r.err).split('\n').find((l) => l.trim())?.trim().slice(0, 100) ?? null, code: r.code, ms: r.ms, timedOut: r.timedOut });
  }
  if (hits.length) found[tool] = hits;
}

// مديرو الإصدارات: قراءة المجلدات فقط (C-07، الخطوة 3)
const vmDirs = {
  nvm: '~/.nvm/versions/node', nvmDefault: '~/.nvm/alias/default', fnm: '~/.local/share/fnm/node-versions', mise: '~/.local/share/mise/installs',
  asdf: '~/.asdf/installs', pyenv: '~/.pyenv/versions', uvPython: '~/.local/share/uv/python', volta: '~/.volta/tools/image/node', corepackCache: '~/.cache/node/corepack',
};
const managers = {};
for (const [name, d] of Object.entries(vmDirs)) {
  const p = d.replace(/^~/, HOME);
  if (!fs.existsSync(p)) { managers[name] = null; continue; }
  managers[name] = fs.statSync(p).isDirectory() ? fs.readdirSync(p).sort() : fs.readFileSync(p, 'utf8').trim();
}

// الدوال في صدفة المالك الحقيقية (zsh تفاعلية بملفات التهيئة): ما هو دالة وما هو ملف تنفيذي
const whence = await run('/bin/zsh', { args: ['-ic', 'whence -w node npm npx pnpm corepack yarn nvm uv python3 2>&1; echo "PATH=$PATH"; node --version 2>&1; pnpm --version 2>&1'], timeout: 15, env: { HOME, USER: process.env.USER, LOGNAME: process.env.USER, SHELL: '/bin/zsh', TERM: 'dumb', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', AYAR_RESOLVING_ENVIRONMENT: '1' } });

const report = { at: new Date().toISOString(), host: { arch: process.arch, platform: process.platform, release: (await run('sw_vers -productVersion')).out.trim() }, searchedDirs: [...fallbackDirs, ...nvmDirs].filter((d) => fs.existsSync(d)), tools: found, versionManagers: managers, ownerShell: { code: whence.code, ms: whence.ms, out: whence.out.replaceAll(HOME, '~'), err: whence.err.replaceAll(HOME, '~') } };
writeJson(path.join(results, 'inventory.json'), report);

const lines = ['| الأداة | المسار | الإصدار |', '|---|---|---|'];
for (const [tool, hits] of Object.entries(found)) for (const h of hits) lines.push(`| ${tool} | \`${h.path.replaceAll(HOME, '~')}\`${h.realpath ? ` → \`${h.realpath.replaceAll(HOME, '~')}\`` : ''} | ${h.version ?? '—'} |`);
lines.push('', '| مدير الإصدارات | المجلد | المحتوى |', '|---|---|---|');
for (const [name, v] of Object.entries(managers)) lines.push(`| ${name} | \`${vmDirs[name]}\` | ${v === null ? 'غير موجود' : Array.isArray(v) ? (v.join('، ') || 'فارغ') : v} |`);
lines.push('', '**صدفة المالك (`zsh -ic whence -w`):**', '', '```text', report.ownerShell.out.trim(), '```');
fs.writeFileSync(path.join(results, 'inventory.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
