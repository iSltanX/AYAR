// The web probe in the engine's tests (DEV-7): the probe browser is the build AYAR pins (Chrome for Testing
// 156.0.8078.4, Playwright revision 1248), taken from Playwright's cache on the owner's machine and registered as
// AYAR's browser data asset — what «ثبّت متصفح المسبار» leaves (its own test downloads the pinned file once) — and
// FX-WEB-DESIGN's profile as its owner would write it: the preview server a companion service, the states file, the
// matrix of two sizes, two themes and two languages turned on by query parameters.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const PROBE_BROWSER = join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
export const probeBrowserReady = (): boolean => existsSync(PROBE_BROWSER);

/** Registers the probe's browser in a test data folder (the data asset row the install writes). */
export function installTestBrowser(dataDir: string): void {
  const db = new DatabaseSync(join(dataDir, 'ayar.db'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.prepare("INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES ('dat_test_browser', 'browser', 'chromium', '156.0.8078.4', ?, 0, ?) ON CONFLICT (kind, key) DO UPDATE SET path = excluded.path").run(PROBE_BROWSER, new Date().toISOString());
  } finally {
    db.close();
  }
}

export const WEB_MATRIX = {
  viewports: [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'desktop', width: 1280, height: 800 },
  ],
  themes: { values: ['light', 'dark'], activation: { kind: 'query', param: 'theme' } },
  languages: { values: ['ar', 'en'], activation: { kind: 'query', param: 'lang' } },
};

/** FX-WEB-DESIGN's profile (design/design.config.json written as AYAR's references and its preview as a service). */
export function webDesignPatch(port = 4173, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    references: {
      fonts: { approved: ['Cairo'] },
      states: { file: 'design/states.json' },
      renderTarget: { kind: 'service', service: 'preview', url: `http://127.0.0.1:${port}/`, ...WEB_MATRIX },
      ...extra,
    },
    services: { preview: { argv: ['node', 'server.mjs', String(port)], cwd: '.', readyUrl: null, readyPattern: `127\\.0\\.0\\.1:${port}`, readyTimeoutSec: 30, ports: [port] } },
  };
}

export const DESIGN_RENDER = ['design.tokens.render', 'design.fonts.render', 'design.a11y', 'design.rtl.render', 'design.states', 'design.visual'];
