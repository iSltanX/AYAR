#!/usr/bin/env node
// يحمّل مجلد إضافة مبنية في Chromium المثبت (Playwright) ويطبع سبب الرفض إن رفضها (DEV-1، المهمة 10).
//   node fixtures/tools/chrome-load.mjs <مجلد-الإضافة-المبنية>
// يخرج بـ 0 ويطبع «LOADED» إن لم يسجل Chromium خطأ تحميل، وبـ 3 ويطبع «LOAD_ERROR: <النص>» إن رفضها.
// اللغة تُثبَّت على en-US ليكون نص الخطأ ثابتًا.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function findChrome() {
  if (process.env.AYAR_FX_CHROME) return process.env.AYAR_FX_CHROME;
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) throw new Error('Chromium غير مثبت: pnpm exec playwright install chromium');
  return path.join(cache, dirs.at(-1), 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
}

const ext = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(ext, 'manifest.json'))) { console.error(`لا manifest.json في ${ext}`); process.exit(2); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ayar-fx-chrome-'));
const child = spawn(findChrome(), [
  '--headless=new', '--no-sandbox', '--lang=en-US', `--user-data-dir=${profile}`,
  `--disable-extensions-except=${ext}`, `--load-extension=${ext}`,
  '--enable-logging=stderr', '--remote-debugging-port=0', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let log = '';
child.stderr.on('data', (d) => { log += d; });
await new Promise((r) => setTimeout(r, 7000));
child.kill('SIGKILL');
await new Promise((r) => child.once('close', r));
fs.rmSync(profile, { recursive: true, force: true });
const m = log.match(/Extension error: (.*)/);
if (m) {
  console.log(`LOAD_ERROR: ${m[1].replace(ext, '<ext>').trim()}`);
  process.exit(3);
}
console.log('LOADED');
