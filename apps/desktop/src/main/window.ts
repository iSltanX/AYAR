// The main window with the 15.2 configuration. Its size, frame and title bar are DEV-11's (after DES-1..4).
import { BrowserWindow } from 'electron';
import { APP_URL, SECURE_WEB_PREFERENCES } from './security.ts';

export function createMainWindow(preload: string, onLoadFailed: (reason: string) => void): BrowserWindow {
  const win = new BrowserWindow({ show: false, webPreferences: { ...SECURE_WEB_PREFERENCES, preload } });
  win.once('ready-to-show', () => win.show());
  // C-01: a renderer crash reloads the window; the UI then re-reads its state from the engine.
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) win.webContents.reload();
  });
  win.loadURL(APP_URL).catch((e: unknown) => onLoadFailed(e instanceof Error ? e.message : String(e)));
  return win;
}
