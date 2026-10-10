// Launching the development build under Playwright (G-05: Playwright drives Electron through the Node
// inspector, which the development binary allows; the packaged app's tests use the derived package of D-51).
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, type ElectronApplication, type Page } from 'playwright-core';

export const APP_DIR = fileURLToPath(new URL('../../', import.meta.url));
export const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string;

/** A minimal environment: nothing from the developer's shell (tokens included) reaches the app. */
export const baseEnv = (): Record<string, string> => ({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: process.env.HOME ?? '',
  TMPDIR: process.env.TMPDIR ?? '/tmp',
});

export function tempDataDir(): { root: string; dataDir: string; cleanup: () => void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-e2e-')));
  return { root, dataDir: join(root, 'AYAR'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export interface Launched {
  app: ElectronApplication;
  page: Page;
}

export async function launch(dataDir: string): Promise<Launched> {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [APP_DIR, `--ayar-data-dir=${dataDir}`],
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
    const child = spawn(ELECTRON, [APP_DIR, ...args], { env: baseEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
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
