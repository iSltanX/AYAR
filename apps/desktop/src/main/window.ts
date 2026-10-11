// The main window with the 15.2 configuration, at the size of 13.2 (default 1360×860, minimum 1100×720), with the
// title bar unified with the content (Title bar 102:1666): macOS draws its buttons in the corner its language puts
// them in (D-54), and the UI reserves that corner.
import { BrowserWindow, nativeTheme } from 'electron';
import { APP_URL, SECURE_WEB_PREFERENCES } from './security.ts';

const RELOADS_PER_MINUTE = 3;

export function createMainWindow(
  preload: string,
  devTools: boolean,
  log: (message: string, fields: Record<string, string | number>) => void,
): BrowserWindow {
  // Developer tools only in a development build; the packaged app has none.
  const win = new BrowserWindow({
    show: false,
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    titleBarStyle: 'hidden',
    // bg/canvas (neutral/100) of the theme, so nothing flashes before the first paint.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141b20' : '#f7f4ec',
    webPreferences: { ...SECURE_WEB_PREFERENCES, devTools, preload },
  });
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
