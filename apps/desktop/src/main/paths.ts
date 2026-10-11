// Where AYAR keeps its data (C-17): ~/Library/Application Support/AYAR. Chromium's own files go to a chromium/
// subfolder so the AYAR layout stays as the plan lists it. A development build (unpackaged) accepts
// --ayar-data-dir=<path> for tests; the packaged app ignores it.
import { app } from 'electron';
import { join, resolve } from 'node:path';

export function resolveDataDir(): string {
  const override = app.isPackaged ? '' : app.commandLine.getSwitchValue('ayar-data-dir');
  return override ? resolve(override) : join(app.getPath('appData'), 'AYAR');
}

export function applyChromiumPaths(dataDir: string): void {
  const chromium = join(dataDir, 'chromium');
  app.setPath('userData', chromium);
  app.setPath('sessionData', chromium);
  app.setPath('crashDumps', join(chromium, 'Crashpad'));
}

export function bundlePaths() {
  const root = app.getAppPath();
  return {
    renderer: join(root, 'dist', 'renderer'),
    preload: join(root, 'dist', 'preload', 'preload.cjs'),
    engine: join(root, 'dist', 'engine', 'engine.mjs'),
    /** C-14 (DEV-7): the web probe's utilityProcess entry, beside the engine (axe.min.js with them). */
    probe: join(root, 'dist', 'engine', 'probe.mjs'),
  };
}
