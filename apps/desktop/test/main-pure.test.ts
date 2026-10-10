// The pure parts of the main process: the 15.2 constants, the sender check, the app protocol's file mapping,
// and the translated menus.
import { ERROR_CODES } from '@ayar/protocol';
import { MESSAGES } from '@ayar/i18n';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveAppFile, serveAppRequest } from '../src/main/app-protocol.ts';
import { menuTemplate } from '../src/main/menu.ts';
import { CSP, isTrustedSender, SECURE_WEB_PREFERENCES } from '../src/main/security.ts';

describe('15.2 configuration', () => {
  it('uses the CSP of 15.2 verbatim, with no unsafe source', () => {
    expect(CSP).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' ayar-evidence: data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    expect(CSP).not.toMatch(/unsafe-/);
  });

  it('declares the window preferences of 15.2', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false, allowRunningInsecureContent: false, experimentalFeatures: false });
  });
});

describe('sender check (15.2 «الاتصال»)', () => {
  const trusted = new Set([7]);
  it.each([
    ['the app top frame', { url: 'app://ayar/index.html', parent: null }, 7, true],
    ['a subframe', { url: 'app://ayar/index.html', parent: {} }, 7, false],
    ['another origin', { url: 'data:text/html,x', parent: null }, 7, false],
    ['a look-alike origin', { url: 'app://ayar.evil/index.html', parent: null }, 7, false],
    ['another webContents', { url: 'app://ayar/index.html', parent: null }, 8, false],
    ['a destroyed frame', null, 7, false],
  ])('%s → %s', (_l, frame, id, expected) => {
    expect(isTrustedSender(frame, id, trusted)).toBe(expected);
  });
});

describe('app protocol (15.2 «المحتوى»)', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-proto-')));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'assets', 'a.js'), '');
  // G-WAVE2-01: the folder goes with the tests, so `npm test` leaves nothing in $TMPDIR.
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it.each([
    ['app://ayar/index.html', join(root, 'index.html')],
    ['app://ayar/', join(root, 'index.html')],
    ['app://ayar/assets/a.js', join(root, 'assets', 'a.js')],
    // The URL parser already folds dot segments (also %2e%2e): these stay inside the root.
    ['app://ayar/../package.json', join(root, 'package.json')],
    ['app://ayar/%2e%2e/%2e%2e/etc/passwd.html', join(root, 'etc', 'passwd.html')],
    ['app://ayar/assets%2f..%2f..%2fx.js', null],
    ['app://ayar/a%00.js', null],
    ['app://other/index.html', null],
    ['app://ayar/run.sh', null],
    ['not a url', null],
  ])('%s', (url, expected) => {
    expect(resolveAppFile(url, root)).toBe(expected);
  });

  it('never maps any request outside the renderer folder', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('..', '%2e%2e', '%2E%2e', '.', 'a', '%2f', '%5c', '\\', '..%2f', 'x.js', 'index.html', '%00'), { maxLength: 8 }), (parts) => {
        const file = resolveAppFile(`app://ayar/${parts.join('/')}`, root);
        return file === null || file.startsWith(root + '/');
      }),
      { numRuns: 2000 },
    );
  });

  it('serves with the CSP header and answers 404 without a path', async () => {
    const ok = await serveAppRequest('app://ayar/index.html', root);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-security-policy')).toBe(CSP);
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    const missing = await serveAppRequest('app://ayar/nope.js', root);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('not found');
  });
});

describe('menus (C-01, C-24)', () => {
  it('are translated in both languages, with no View menu', () => {
    const ar = menuTemplate('ar');
    const en = menuTemplate('en');
    expect(ar.map((m) => m.label)).toEqual(['عِيَار', 'تحرير', 'نافذة']);
    expect(en.map((m) => m.label)).toEqual(['AYAR', 'Edit', 'Window']);
    expect(en.flatMap((m) => (Array.isArray(m.submenu) ? m.submenu.map((i) => i.role) : [])).filter(Boolean)).not.toContain('toggleDevTools');
  });
});

describe('error messages (C-24, NFR-05)', () => {
  it('every protocol error code has its message in both languages', () => {
    for (const code of ERROR_CODES) {
      expect(MESSAGES.ar, code).toHaveProperty([`errors.${code}`]);
      expect(MESSAGES.en, code).toHaveProperty([`errors.${code}`]);
    }
  });
});
