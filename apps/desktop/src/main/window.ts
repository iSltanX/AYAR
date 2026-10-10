// The main window with the 15.2 configuration. Its size, frame and title bar are DEV-11's (after DES-1..4).
import { BrowserWindow } from 'electron';
import { APP_URL, SECURE_WEB_PREFERENCES } from './security.ts';

const RELOADS_PER_MINUTE = 3;

export function createMainWindow(
  preload: string,
  devTools: boolean,
  log: (message: string, fields: Record<string, string | number>) => void,
): BrowserWindow {
  // Developer tools only in a development build; the packaged app has none.
  const win = new BrowserWindow({ show: false, webPreferences: { ...SECURE_WEB_PREFERENCES, devTools, preload } });
  win.once('ready-to-show', () => win.show());
  // C-01: a renderer crash reloads the window, and the UI re-reads its state from the engine. A renderer that
  // keeps crashing is not reloaded in a loop: after three reloads in a minute it stays as it is.
  const reloads: number[] = [];
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    const now = Date.now();
    while (reloads.length && now - reloads[0]! > 60_000) reloads.shift();
    log('renderer gone', { reason: details.reason, reloads: reloads.length });
    if (reloads.length >= RELOADS_PER_MINUTE) return;
    reloads.push(now);
    win.webContents.reload();
  });
  win.loadURL(APP_URL).catch((e: unknown) => {
    log('window failed to load', { reason: e instanceof Error ? e.message : String(e) });
    if (!win.isDestroyed()) win.show(); // never a running app without a window (the failure screen is DEV-11's)
  });
  return win;
}
