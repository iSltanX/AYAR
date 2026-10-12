// Launching the development build under Playwright (G-05: Playwright drives Electron through the Node
// inspector, which the development binary allows), or, with AYAR_E2E_APP=<path to a .app>, the derived test package
// of D-51 (DEV-13): the release package with the inspect fuse alone flipped, made by tools/packaging/derive.mjs. A
// packaged app ignores --ayar-data-dir, so its data folder is reached through HOME: each test gets a temporary HOME
// and reads ~/Library/Application Support/AYAR under it.
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, type ElectronApplication, type Page } from 'playwright-core';

export const APP_DIR = fileURLToPath(new URL('../../', import.meta.url));
export const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string;
/** The derived test package (D-51), or null on the development build. */
export const PACKAGED_APP = process.env.AYAR_E2E_APP ? resolve(process.env.AYAR_E2E_APP) : null;
const packagedExecutable = (app: string) => join(app, 'Contents', 'MacOS', basename(app, '.app'));

/** A minimal environment: nothing from the developer's shell (tokens included) reaches the app. */
export const baseEnv = (home = process.env.HOME ?? ''): Record<string, string> => ({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: home,
  TMPDIR: process.env.TMPDIR ?? '/tmp',
});

/** A data folder of its own for a test. The derived test package honours --ayar-data-dir as the development build does (its inspector is active under Playwright, D-DEV13-06); HOME would not do, since macOS resolves Application Support from the user's record. */
export function tempDataDir(): { root: string; dataDir: string; cleanup: () => void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-e2e-')));
  const dataDir = join(root, 'AYAR');
  return { root, dataDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export interface Launched {
  app: ElectronApplication;
  page: Page;
}

export async function launch(dataDir: string): Promise<Launched> {
  const app = await _electron.launch({
    executablePath: PACKAGED_APP ? packagedExecutable(PACKAGED_APP) : ELECTRON,
    args: PACKAGED_APP ? [`--ayar-data-dir=${dataDir}`] : [APP_DIR, `--ayar-data-dir=${dataDir}`],
    env: baseEnv(),
    timeout: 30_000,
  });
  const page = await app.firstWindow({ timeout: 30_000 });
  await page.waitForLoadState('load');
  return { app, page };
}

/** Runs the app directly (no Playwright, no inspector) and returns its exit code and output. */
export function runDirect(args: string[], timeoutMs = 20_000): Promise<{ code: number | null; signal: string | null; output: string }> {
  return new Promise((resolve) => {
    const exe = PACKAGED_APP ? packagedExecutable(PACKAGED_APP) : ELECTRON;
    // Without the inspector the packaged app ignores --ayar-data-dir (and the release package always does): a direct
    // run that gets past the start-up guards would write in the user's folder, so the callers only use it for runs
    // the guards end (D-52) or that never reach the data folder.
    const argv = PACKAGED_APP ? args : [APP_DIR, ...args];
    const child = spawn(exe, argv, { env: baseEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

export async function until<T>(read: () => Promise<T>, accept: (v: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last = await read();
  while (!accept(last) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 100));
    last = await read();
  }
  return last;
}
