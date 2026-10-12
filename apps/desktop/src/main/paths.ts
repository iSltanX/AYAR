// Where AYAR keeps its data (C-17): ~/Library/Application Support/AYAR. Chromium's own files go to a chromium/
// subfolder so the AYAR layout stays as the plan lists it. A development build (unpackaged) accepts
// --ayar-data-dir=<path> for tests. The packaged app ignores it unless Node's inspector is active, which the fuses
// allow on the derived test package alone (D-51, D-DEV13-06): macOS resolves Application Support from the user's
// record, not from HOME, so the tests on that package have no other way to keep their data out of the user's folder;
// the release package keeps its folder whatever the switch says.
import { app } from 'electron';
import inspector from 'node:inspector';
import { join, resolve } from 'node:path';

export function resolveDataDir(): string {
  const override = app.isPackaged && !inspector.url() ? '' : app.commandLine.getSwitchValue('ayar-data-dir');
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
