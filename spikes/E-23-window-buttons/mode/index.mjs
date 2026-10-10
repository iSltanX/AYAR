// E-23 mode: where does macOS put the window buttons, by the language it resolves for the app,
// and does an in-app language switch move them? Reads the Window Controls Overlay rect.
// Launch args: --label <name> [--auto-quit] [--hold-ms N]
import { systemPreferences } from 'electron';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argValue = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run({ app, createWindow, ipcMain, info }) {
  const label = argValue('--label', 'manual');
  const holdMs = Number(argValue('--hold-ms', '0'));
  const win = createWindow({
    width: 900,
    height: 560,
    title: 'AYAR Spike — E-23',
    // --style hidden|hiddenInset, --overlay true|height (E-23 variants)
    titleBarStyle: argValue('--style', 'hidden'),
    titleBarOverlay: argValue('--overlay', 'true') === 'true' ? true : { height: Number(argValue('--overlay')) },
  });
  const measurements = [];
  const waitMeasure = () => new Promise((r) => ipcMain.once('mode:e23-measure', (_e, m) => r(m)));

  let next = waitMeasure();
  await win.loadURL('app://spike/mode/e23.html');
  const resolved = app.getLocale().startsWith('ar') ? 'ar' : 'en';
  win.webContents.send('mode:e23-set-ui', resolved);
  measurements.push({ step: 'launch', uiLang: resolved, ...(await next) });
  await sleep(1500);
  next = waitMeasure();
  win.webContents.send('mode:e23-remeasure');
  measurements.push({ step: 'launch+1.5s', uiLang: resolved, ...(await next) });
  await sleep(holdMs);

  const other = resolved === 'ar' ? 'en' : 'ar';
  next = waitMeasure();
  win.webContents.send('mode:e23-set-ui', other);
  measurements.push({ step: 'switched-in-app', uiLang: other, ...(await next) });
  await sleep(1500);
  next = waitMeasure();
  win.webContents.send('mode:e23-remeasure');
  measurements.push({ step: 'switched+1.5s', uiLang: other, ...(await next) });
  await sleep(holdMs);

  const [w, h] = win.getContentSize();
  const report = {
    spike: 'E-23',
    label,
    at: new Date().toISOString(),
    buildInfo: info,
    argv: process.argv.slice(1),
    style: argValue('--style', 'hidden'),
    overlay: argValue('--overlay', 'true'),
    locale: { app: app.getLocale(), system: app.getSystemLocale(), preferred: app.getPreferredSystemLanguages() },
    // Candidate signals for the system language under a per-app override (review of D-54):
    appDefaultsAppleLanguages: systemPreferences.getUserDefault('AppleLanguages', 'array'),
    globalAppleLanguages: (() => { try { return execFileSync('/usr/bin/defaults', ['read', '-g', 'AppleLanguages'], { encoding: 'utf8' }).replace(/[\s()"]/g, '').split(',').filter(Boolean); } catch (e) { return String(e.message); } })(),
    window: { contentSize: [w, h], buttonPosition: win.getWindowButtonPosition?.() ?? null },
    measurements: measurements.map((m) => ({
      ...m,
      buttonsSide: !m.wcoVisible ? 'unknown' : m.rect.x > 0 ? 'left' : m.rect.width < m.innerWidth ? 'right' : 'none',
    })),
  };
  fs.writeFileSync(path.join(app.getPath('userData'), `e23-${label}.json`), JSON.stringify(report, null, 2));
  if (process.argv.includes('--auto-quit')) app.quit();
}
