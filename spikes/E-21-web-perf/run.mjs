// E-21: طريقة قياس أداء الويب (الخطة 22، perf.web): نموذج قياس عبر المسبار (playwright-core + Chromium الخاص به) على
// FX-WEB-DESIGN، وتقييم Lighthouse CLI 13.5.0 (مثبت الإصدار في ~/.cache/ayar-dev2/lighthouse). المعيار: تكرار ضمن ±10%.
// لكل طريقة 5 تشغيلات، وتُحسب لكل مقياس: المتوسط والانحراف ومعامل الاختلاف وأقصى انحراف عن المتوسط (%).
//   node spikes/E-21-web-perf/run.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { DEV2_CACHE, TC_HOME, baseEnv, excerpt, materialize, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const require = createRequire(import.meta.url);
const playwright = require(path.join(TC_HOME, 'node', 'node_modules', 'playwright-core'));
const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
const chromiumDir = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const executablePath = path.join(cache, chromiumDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
const RUNS = 5;
const out = { at: new Date().toISOString(), chromium: chromiumDir, probe: {}, lighthouse: {} };
const stats = (xs) => { const n = xs.length; const mean = xs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n); const maxDev = Math.max(...xs.map((x) => Math.abs(x - mean))); return { n, mean: +mean.toFixed(2), sd: +sd.toFixed(2), cv: mean ? +((sd / mean) * 100).toFixed(1) : null, maxDevPct: mean ? +((maxDev / mean) * 100).toFixed(1) : null, within10: mean ? maxDev / mean <= 0.1 : null, values: xs.map((x) => +x.toFixed(2)) }; };

// ── الهدف: FX-WEB-DESIGN السليم على خادمه الثابت ──
const { base, root } = await materialize('FX-WEB-DESIGN', 'good', 'ayar-e21');
const port = 4300 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ['server.mjs', String(port)], { cwd: root, detached: true, stdio: 'ignore', env: baseEnv() });
await new Promise((r) => setTimeout(r, 800));
const url = `http://127.0.0.1:${port}/`;

// ── (أ) القياس عبر المسبار ──
async function probeRun({ cpuThrottle }) {
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ar', timezoneId: 'Asia/Riyadh', reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  // مراقبو LCP وCLS والمهام الطويلة قبل التنقل
  await page.addInitScript(() => {
    window.__ayar = { lcp: 0, cls: 0, longTasks: 0, tbt: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ayar.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ayar.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__ayar.longTasks++; window.__ayar.tbt += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
    const res = performance.getEntriesByType('resource');
    return { ttfb: nav.responseStart, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp: paint['first-contentful-paint'] ?? null, lcp: window.__ayar.lcp, cls: window.__ayar.cls, longTasks: window.__ayar.longTasks, tbt: window.__ayar.tbt, resources: res.length, transferBytes: res.reduce((a, r) => a + (r.transferSize || 0), 0) };
  });
  const perf = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  m.taskDurationMs = +(perf.TaskDuration * 1000).toFixed(1); m.scriptDurationMs = +(perf.ScriptDuration * 1000).toFixed(1); m.layoutDurationMs = +(perf.LayoutDuration * 1000).toFixed(1); m.jsHeapMB = +(perf.JSHeapUsedSize / 1048576).toFixed(1);
  m.wallMs = Date.now() - t0;
  await browser.close();
  return m;
}
for (const cpuThrottle of [1, 4]) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await probeRun({ cpuThrottle }));
  const metrics = {};
  for (const k of ['ttfb', 'domContentLoaded', 'load', 'fcp', 'lcp', 'tbt', 'taskDurationMs', 'scriptDurationMs', 'layoutDurationMs', 'jsHeapMB', 'wallMs']) metrics[k] = stats(runs.map((r) => r[k] ?? 0));
  metrics.cls = { values: runs.map((r) => +r.cls.toFixed(4)) }; metrics.resources = { values: runs.map((r) => r.resources) }; metrics.transferBytes = { values: runs.map((r) => r.transferBytes) };
  out.probe[`cpu${cpuThrottle}x`] = metrics;
  console.log(`• probe cpu${cpuThrottle}x: ` + ['fcp', 'lcp', 'domContentLoaded', 'load', 'taskDurationMs'].map((k) => `${k}=${metrics[k].mean}±${metrics[k].sd} (max ${metrics[k].maxDevPct}%)`).join('  '));
}

// ── (ب) Lighthouse CLI 13.5.0 ──
{
  const dir = path.join(DEV2_CACHE, 'lighthouse'); fs.mkdirSync(dir, { recursive: true });
  const lh = path.join(dir, 'node_modules', '.bin', 'lighthouse');
  if (!fs.existsSync(lh)) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ayar-dev2-lighthouse', private: true, version: '1.0.0' }));
    const t0 = Date.now();
    const i = await run('/opt/homebrew/bin/npm install --save-exact --no-audit --no-fund lighthouse@13.5.0', { cwd: dir, env: baseEnv({ PATH: `/opt/homebrew/bin:${baseEnv().PATH}` }), timeout: 900 });
    out.lighthouse.install = { exit: i.code, ms: Date.now() - t0, sizeKB: Number((await run(`du -sk "${dir}" | cut -f1`)).out.trim()), packages: (i.out.match(/added (\d+) packages/) ?? [])[1] ?? null };
    console.log('• lighthouse install:', JSON.stringify(out.lighthouse.install));
  }
  const ver = await run(lh, { args: ['--version'], env: baseEnv({ PATH: `/opt/homebrew/bin:${baseEnv().PATH}` }) });
  out.lighthouse.version = ver.out.trim();
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const R = tmpdir('ayar-e21-lh');
    const f = path.join(R, 'lh.json');
    const t0 = Date.now();
    const r = await run(lh, { args: [url, '--output=json', `--output-path=${f}`, '--only-categories=performance', '--quiet', '--chrome-flags=--headless=new --no-first-run', '--no-enable-error-reporting', '--locale=ar'], env: baseEnv({ PATH: `/opt/homebrew/bin:${baseEnv().PATH}`, CHROME_PATH: executablePath, HOME: os.homedir() }), timeout: 300 });
    const ms = Date.now() - t0;
    if (!fs.existsSync(f)) { runs.push({ error: excerpt(r.err, 300), exit: r.code, ms }); rmrf(R); continue; }
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const a = j.audits;
    runs.push({ exit: r.code, ms, score: Math.round((j.categories.performance.score ?? 0) * 100), fcp: a['first-contentful-paint']?.numericValue, lcp: a['largest-contentful-paint']?.numericValue, tbt: a['total-blocking-time']?.numericValue, cls: a['cumulative-layout-shift']?.numericValue, si: a['speed-index']?.numericValue, throttling: j.configSettings?.throttlingMethod, opportunities: Object.values(a).filter((x) => x.details?.type === 'opportunity' && x.score !== null && x.score < 1).map((x) => x.id).slice(0, 6), chrome: j.environment?.hostUserAgent?.match(/Chrome\/[\d.]+/)?.[0] });
    rmrf(R);
  }
  const ok = runs.filter((r) => !r.error);
  out.lighthouse.runs = runs;
  if (ok.length) {
    out.lighthouse.metrics = {};
    for (const k of ['score', 'fcp', 'lcp', 'tbt', 'si', 'ms']) out.lighthouse.metrics[k] = stats(ok.map((r) => r[k] ?? 0));
    out.lighthouse.metrics.cls = { values: ok.map((r) => r.cls) };
    console.log('• lighthouse: ' + ['score', 'fcp', 'lcp', 'si', 'ms'].map((k) => `${k}=${out.lighthouse.metrics[k].mean}±${out.lighthouse.metrics[k].sd} (max ${out.lighthouse.metrics[k].maxDevPct}%)`).join('  '), 'throttling=', ok[0].throttling, 'opps=', JSON.stringify(ok[0].opportunities));
  } else console.log('• lighthouse failed:', JSON.stringify(runs[0]));
}
try { process.kill(-server.pid, 'SIGKILL'); } catch { /* */ }
rmrf(base);
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
