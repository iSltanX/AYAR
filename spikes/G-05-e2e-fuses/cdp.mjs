// G-05: does the release package accept --remote-debugging-port, and does CDP control its UI?
// Usage: node cdp.mjs "<path to .app>" <label>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [appPath, label = 'cdp'] = process.argv.slice(2);
const exe = path.join(appPath, 'Contents/MacOS', path.basename(appPath, '.app'));
const result = { label, appPath: path.basename(appPath), startedAt: new Date().toISOString() };
const child = spawn(exe, ['--remote-debugging-port=0', '--no-selftest'], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });
const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
const ws = await Promise.race([
  new Promise((r) => {
    const t = setInterval(() => {
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (m) { clearInterval(t); r(m[1]); }
    }, 50);
  }),
  exited.then((x) => ({ exited: x })),
  new Promise((r) => setTimeout(() => r(null), 10000)),
]);
result.devtools = ws;
if (typeof ws === 'string') {
  try {
    const browser = await chromium.connectOverCDP(ws, { timeout: 10000 });
    const pages = browser.contexts().flatMap((c) => c.pages());
    result.pages = await Promise.all(pages.map(async (p) => ({ url: p.url(), title: await p.title() })));
    const page = pages.find((p) => p.url().startsWith('app://'));
    if (page) {
      result.canReadUi = await page.textContent('#mono-latin');
      result.preloadApiVisible = await page.evaluate(() => Object.keys(window.spike || {}));
    }
    await browser.close().catch(() => {});
  } catch (e) {
    result.error = String(e?.message || e).split('\n')[0];
  }
}
child.kill('SIGKILL');
result.exit = await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 3000))]);
result.stderr = stderr.trim().split('\n').slice(0, 6);
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/cdp-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(0);
