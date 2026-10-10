// E-11 engine side (runs inside the utilityProcess): hosts playwright-core (loaded by absolute path from the DEV-1
// toolchain, outside the asar) and drives Chromium with the built FX-EXT extension, headless (new headless) and headed.
// Per mode: service worker registration + extension id, popup load, axe-core run, 3 popup screenshots (sha256),
// options page console errors, timings. No `electron` import here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function oneMode({ playwright, mode, dist, executablePath, axeSource, viewport }) {
  const t0 = Date.now();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `ayar-e11-${mode}-`));
  const r = { mode, profile, steps: {}, errors: [] };
  let context = null;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, {
      executablePath, headless: mode === 'headless', viewport, deviceScaleFactor: 1, locale: 'ar', timezoneId: 'Asia/Riyadh', reducedMotion: 'reduce', colorScheme: 'light',
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    r.steps.launchMs = Date.now() - t0;
    r.steps.browserVersion = context.browser()?.version?.() ?? null;
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const extensionId = new URL(worker.url()).host;
    r.steps.serviceWorker = { url: worker.url().replace(extensionId, '<id>'), extensionId, ms: Date.now() - t0 };
    // popup + axe
    const popup = await context.newPage();
    const consoleErrors = [];
    popup.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    popup.on('pageerror', (e) => consoleErrors.push(String(e.message)));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'load' });
    await popup.evaluate(() => document.fonts.ready);
    r.steps.popup = { dir: await popup.locator('html').getAttribute('dir'), lang: await popup.locator('html').getAttribute('lang'), title: await popup.title(), consoleErrors };
    // الحقن عبر CDP (Runtime.evaluate) لا يخضع لسياسة CSP الخاصة بصفحة الإضافة (script-src 'self')، بخلاف addScriptTag
    await popup.evaluate(axeSource);
    const axe = await popup.evaluate(async () => { const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return { violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), passes: res.passes.length, incomplete: res.incomplete.length, version: res.testEngine?.version }; });
    r.steps.axe = axe;
    await popup.close();
    // 3 screenshots, new page each time
    const shots = [];
    for (let i = 0; i < 3; i++) {
      const p = await context.newPage();
      await p.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      const png = await p.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
      shots.push({ sha256: sha(png), bytes: png.length, png: png.toString('base64') });
      await p.close();
    }
    r.steps.screenshots = shots.map(({ sha256, bytes }) => ({ sha256, bytes }));
    r.pngs = shots.map((s) => s.png);
    // options page console errors
    const opt = await context.newPage();
    const optErrors = [];
    opt.on('console', (m) => { if (m.type() === 'error') optErrors.push(m.text()); });
    opt.on('pageerror', (e) => optErrors.push(String(e.message)));
    await opt.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'load' });
    await opt.waitForTimeout(300);
    r.steps.options = { consoleErrors: optErrors, title: await opt.title() };
    await opt.close();
    r.steps.pagesOpened = context.pages().length;
  } catch (e) {
    r.errors.push(String(e?.stack || e).slice(0, 1500));
  } finally {
    try { await context?.close(); } catch (e) { r.errors.push(`close: ${e.message}`); }
    try { fs.rmSync(profile, { recursive: true, force: true }); r.profileRemoved = !fs.existsSync(profile); } catch { r.profileRemoved = false; }
  }
  r.totalMs = Date.now() - t0;
  return r;
}

export const handlers = {
  'e11.info': () => ({ pid: process.pid, ppid: process.ppid, type: process.type ?? null, node: process.versions.node, electron: process.versions.electron ?? null, execPath: process.execPath, sandboxed: process.sandboxed ?? null }),
  'e11.run': async ({ playwrightCorePath, dist, executablePath, axePath, modes, viewport }) => {
    const require = createRequire(import.meta.url);
    const playwright = require(playwrightCorePath);
    const axeSource = fs.readFileSync(axePath, 'utf8');
    const out = { playwrightVersion: require(path.join(playwrightCorePath, 'package.json')).version, modes: [] };
    for (const mode of modes) out.modes.push(await oneMode({ playwright, mode, dist, executablePath, axeSource, viewport }));
    return out;
  },
};
