// مكتبة مشتركة لتجارب DEV-2 (E-07 إلى E-24): مسار الأدوات، ومشغّل أوامر يقتل مجموعة العمليات عند المهلة،
// ولقطة حالة مجلد (المسار والحجم والوقت والبصمة) وفرقها، وتركيب مشاريع الاختبار في مجلد مؤقت.
// لا تبعيات خارج Node. تُشغَّل بـ /opt/homebrew/bin/node أو ~/.nvm/versions/node/v24.16.0/bin/node (pnpm في المجلد نفسه).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HOME = os.homedir();
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = path.join(REPO, 'fixtures');
export const TC_HOME = path.join(HOME, '.cache', 'ayar-fixtures-toolchain');
export const DEV2_CACHE = path.join(HOME, '.cache', 'ayar-dev2');
export const NVM_NODE = path.join(HOME, '.nvm', 'versions', 'node');

/** PATH للتجارب: node الحالي (ومعه pnpm إن كان من nvm)، ثم صندوق DEV-1، ثم Homebrew ثم النظام. لا دوال صدفة. */
export function toolPath(extra = []) {
  const dirs = [
    ...extra,
    path.dirname(process.execPath),
    path.join(NVM_NODE, 'v24.16.0', 'bin'),
    path.join(TC_HOME, 'bin'),
    path.join(TC_HOME, 'py', 'bin'),
    '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
  ];
  return [...new Set(dirs.filter((d) => fs.existsSync(d)))].join(':');
}

/** بيئة أساس دنيا (كما يفعل C-07): لا تُورَّث متغيرات الصدفة الحالية. */
export function baseEnv(overrides = {}) {
  return {
    HOME, USER: os.userInfo().username, LOGNAME: os.userInfo().username, SHELL: '/bin/zsh',
    TMPDIR: os.tmpdir().replace(/\/?$/, '/'), LANG: process.env.LANG ?? 'en_US.UTF-8',
    PATH: toolPath(), NO_COLOR: '1', FORCE_COLOR: '0', AYAR: '1',
    ...overrides,
  };
}

/** ينفّذ أمر صدفة (أو ملفًا بوسائطه) في مجموعة عمليات مستقلة، ويقتل المجموعة عند المهلة. */
export function run(cmd, { cwd = os.tmpdir(), env = baseEnv(), timeout = 180, args = null, input = null } = {}) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const child = args ? spawn(cmd, args, { cwd, env, detached: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
      : spawn('/bin/sh', ['-c', cmd], { cwd, env, detached: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = ''; let err = ''; let timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    if (input) { child.stdin.end(input); }
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { /* انتهت */ } }, timeout * 1000);
    child.on('error', (e) => { err += String(e); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* لا بقايا */ }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      resolve({ code, signal, out: strip(out), err: strip(err), ms: Math.round(ms), timedOut, pid: child.pid });
    });
  });
}

export const strip = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

export function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
export function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

const DEFAULT_SKIP = new Set(['node_modules', '.git', '.venv', '__pycache__', '.pnpm-store', '.mypy_cache', '.pytest_cache', '.ruff_cache']);

/** لقطة حالة مجلد: لكل ملف (نسبيًّا) الحجم ووقت التعديل والبصمة (للملفات حتى 8 ميغابايت). */
export function snapshot(root, { skip = DEFAULT_SKIP, hash = true } = {}) {
  const map = new Map();
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(p); continue; }
      if (!e.isFile()) continue;
      const st = fs.statSync(p);
      const rel = path.relative(root, p);
      map.set(rel, { size: st.size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, sha: hash && st.size <= 8 * 1024 * 1024 ? sha256File(p) : null });
    }
  };
  walk(root);
  return map;
}

export function diffSnapshot(before, after) {
  const added = [], removed = [], changed = [];
  for (const [k, v] of after) {
    const b = before.get(k);
    if (!b) added.push(k);
    else if (b.size !== v.size || (b.sha ?? '') !== (v.sha ?? '') || (b.sha == null && b.mtimeMs !== v.mtimeMs)) changed.push(k);
  }
  for (const k of before.keys()) if (!after.has(k)) removed.push(k);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort(), clean: !added.length && !removed.length && !changed.length };
}

/** يركّب نسخة من مشروع اختبار في مجلد مؤقت جديد خارج المستودع ويعيد جذرها. */
export async function materialize(id, variant, label = 'ayar-dev2') {
  const mod = await import(pathToFileURL(path.join(FIXTURES, 'tools', 'materialize.mjs')).toString());
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-${id}-${variant.replace(/[^\w.-]/g, '_')}-`));
  const root = mod.materialize(id, variant, path.join(base, 'p'));
  return { base, root };
}

export function tmpdir(label = 'ayar-dev2') { return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)); }

export function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

/** يقتطع نصًّا طويلًا للنتائج ويخفي مسار المنزل. */
export function excerpt(s, max = 1500) {
  const clean = String(s ?? '').replaceAll(HOME, '~');
  if (clean.length <= max) return clean;
  const half = Math.floor(max / 2);
  return `${clean.slice(0, half)}\n… [اقتُطع] …\n${clean.slice(-half)}`;
}

/** مجلد نتائج التجربة (spikes/E-xx/results) نسبةً إلى ملف السكربت المستدعي. */
export function resultsDir(metaUrl) {
  const d = path.join(path.dirname(fileURLToPath(metaUrl)), 'results');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** أداة git مزيفة أول PATH تسجل كل استدعاء (المجلد الحالي والوسائط) وتفشل برمز 99: لإثبات ألا أداة تستدعي git. */
export function gitShim() {
  const dir = tmpdir('ayar-git-shim');
  const log = path.join(dir, 'git.log');
  fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\nprintf 'cwd=%s args=%s\\n' "$(pwd -P)" "$*" >> "${log}"\nexit 99\n`, { mode: 0o755 });
  return { dir, log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []) };
}
