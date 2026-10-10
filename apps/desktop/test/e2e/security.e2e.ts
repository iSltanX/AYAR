// AT-30 (part), on the development build: isolation and sandbox, zero CSP violations on the empty root (with
// positive controls proving the policy and the collector work), no navigation and no new windows, every
// permission refused, a message from an unexpected frame refused, and the D-52 guard. Plus the whole path
// renderer → preload → main → engine (utilityProcess) → back.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, runDirect, tempDataDir, until, type Launched } from './support.ts';

type Diag = { cspViolations: { directive: string }[]; rejectedSenders: number; preload: string };
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' ayar-evidence: data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

let t: ReturnType<typeof tempDataDir>;
let run: Launched;
const diag = () => run.app.evaluate(() => {
  const d = (globalThis as unknown as { ayarDiagnostics: Diag }).ayarDiagnostics;
  return { cspViolations: d.cspViolations.map((v) => v.directive), rejectedSenders: d.rejectedSenders, preload: d.preload };
});

beforeAll(async () => {
  t = tempDataDir();
  run = await launch(t.dataDir);
});
afterAll(async () => {
  await run?.app.close();
  t?.cleanup();
});

describe('window configuration (15.2)', () => {
  it('isolates and sandboxes the renderer, without Node, web security on, no webview', async () => {
    const prefs = await run.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      // getLastWebPreferences is not in Electron's typings, but it reports what the renderer really got.
      const wc = w.webContents as unknown as { getURL(): string; getLastWebPreferences(): Record<string, unknown> };
      return { url: wc.getURL(), prefs: wc.getLastWebPreferences() };
    });
    expect(prefs.url).toBe('app://ayar/index.html');
    expect(prefs.prefs).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    });
    const world = await run.page.evaluate(() => ({
      process: typeof (globalThis as Record<string, unknown>).process,
      require: typeof (globalThis as Record<string, unknown>).require,
      buffer: typeof (globalThis as Record<string, unknown>).Buffer,
      ipcRenderer: typeof (globalThis as Record<string, unknown>).ipcRenderer,
      bridge: Object.keys((window as unknown as { ayar: object }).ayar).sort(),
    }));
    expect(world).toEqual({ process: 'undefined', require: 'undefined', buffer: 'undefined', ipcRenderer: 'undefined', bridge: ['invoke', 'subscribe'] });
  });

  it('shows an empty root: no visual element and no style', async () => {
    const dom = await run.page.evaluate(() => ({
      children: document.getElementById('app')?.childElementCount,
      text: document.body.innerText.trim(),
      bodyElements: [...document.body.children].map((e) => e.tagName),
      styleSheets: document.styleSheets.length,
      styled: document.querySelectorAll('[style]').length,
      styleTags: document.querySelectorAll('style, link[rel=stylesheet]').length,
    }));
    expect(dom).toEqual({ children: 0, text: '', bodyElements: ['DIV'], styleSheets: 0, styled: 0, styleTags: 0 });
  });

  it('serves the UI from the app protocol with the 15.2 CSP header, and nothing outside it', async () => {
    const r = await run.app.evaluate(async ({ net }) => {
      const ok = await net.fetch('app://ayar/index.html');
      const escape = await net.fetch('app://ayar/%2e%2e/%2e%2e/package.json');
      const other = await net.fetch('app://elsewhere/index.html');
      return { status: ok.status, csp: ok.headers.get('content-security-policy'), escape: escape.status, other: other.status };
    });
    expect(r).toEqual({ status: 200, csp: EXPECTED_CSP, escape: 404, other: 404 });
  });
});

describe('content security policy (15.2, AT-30)', () => {
  it('records zero violations on the empty root', async () => {
    await new Promise((r) => setTimeout(r, 500));
    expect((await diag()).cspViolations).toEqual([]);
  });

  it('positive controls: inline script, inline style, style attribute and a remote image are blocked and recorded', async () => {
    const effects = await run.page.evaluate(async () => {
      const s = document.createElement('script');
      s.textContent = 'window.__inline = 1';
      document.body.append(s);
      const st = document.createElement('style');
      st.textContent = 'body { color: red }';
      document.head.append(st);
      const d = document.createElement('div');
      d.setAttribute('style', 'color: red');
      document.body.append(d);
      const img = document.createElement('img');
      img.src = 'https://example.com/x.png';
      document.body.append(img);
      await new Promise((r) => setTimeout(r, 300));
      const out = { inlineRan: (window as unknown as { __inline?: number }).__inline === 1, color: getComputedStyle(d).color };
      s.remove();
      st.remove();
      d.remove();
      img.remove();
      return out;
    });
    expect(effects.inlineRan).toBe(false);
    expect(effects.color).not.toBe('rgb(255, 0, 0)');
    const violations = await until(diag, (d) => d.cspViolations.length >= 4);
    expect(new Set(violations.cspViolations)).toEqual(new Set(['script-src-elem', 'style-src-elem', 'style-src-attr', 'img-src']));
  });

  it('a fresh load of the root records no new violation', async () => {
    const before = (await diag()).cspViolations.length;
    await run.page.reload();
    await run.page.waitForLoadState('load');
    await new Promise((r) => setTimeout(r, 500));
    expect((await diag()).cspViolations.length).toBe(before);
  });
});

describe('navigation, windows and permissions (15.2)', () => {
  it('blocks every navigation', async () => {
    await run.page.evaluate(() => {
      location.href = 'https://example.com/';
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(run.page.url()).toBe('app://ayar/index.html');
    await run.page.evaluate(() => {
      location.href = 'app://ayar/other.html';
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(run.page.url()).toBe('app://ayar/index.html');
  });

  it('opens no new window', async () => {
    const opened = await run.page.evaluate(() => window.open('https://example.com/') === null && window.open('app://ayar/index.html') === null);
    expect(opened).toBe(true);
    expect(await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });

  it('refuses every permission request', async () => {
    const r = await run.page.evaluate(async () => ({
      notification: await Notification.requestPermission(),
      media: await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'granted', (e: Error) => e.name),
      geolocation: (await navigator.permissions.query({ name: 'geolocation' })).state,
      clipboard: await navigator.clipboard.readText().then(() => 'granted', (e: Error) => e.name),
    }));
    expect(r.notification).toBe('denied');
    expect(r.media).toBe('NotAllowedError');
    expect(r.geolocation).toBe('denied');
    expect(r.clipboard).toBe('NotAllowedError');
  });
});

describe('the bridge and the gateway (C-01, C-02, D-29)', () => {
  it('reaches the engine through preload, main and the utility process', async () => {
    const r = await run.page.evaluate(async () => {
      const ayar = (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<unknown> } }).ayar;
      return {
        set: await ayar.invoke('settings.set', { key: 'ui.theme', value: 'dark' }),
        get: await ayar.invoke('settings.get', { keys: ['ui.theme'] }),
        status: await ayar.invoke('engine.status', {}),
      };
    });
    expect(r.set).toEqual({ ok: true, result: { key: 'ui.theme', value: 'dark' } });
    expect(r.get).toEqual({ ok: true, result: { values: { 'ui.theme': 'dark' } } });
    expect(r.status).toMatchObject({ ok: true, result: { source: 'engine', state: 'ready', hmacKeySource: 'file' } });
  });

  it('refuses unknown and host-only commands in the preload, and a path where a token belongs', async () => {
    const r = await run.page.evaluate(async () => {
      const ayar = (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<{ ok: boolean; error?: { code: string } }> } }).ayar;
      return [
        (await ayar.invoke('shell.exec', { cmd: 'id' })).error?.code,
        (await ayar.invoke('internal.clipboardText', { kind: 'report', id: 'x' })).error?.code,
        (await ayar.invoke('project.add', { selectionToken: '/Users/me/project' })).error?.code,
        (await ayar.invoke('project.add', { selectionToken: `sel_${'A'.repeat(43)}` })).error?.code,
        (await ayar.invoke('setup.execute', { actionId: 'a1', confirmationToken: `cfm_${'A'.repeat(43)}` })).error?.code,
      ];
    });
    expect(r).toEqual(['unknown_command', 'unknown_command', 'invalid_payload', 'token_invalid', 'token_invalid']);
  });

  it('refuses a message from a frame that is not the app window (15.2 «الاتصال»)', async () => {
    const before = (await diag()).rejectedSenders;
    const preload = (await diag()).preload;
    await run.app.evaluate(async ({ BrowserWindow }, path) => {
      const rogue = new BrowserWindow({ show: false, webPreferences: { preload: path, sandbox: true, contextIsolation: true } });
      await rogue.loadURL('data:text/html,<p>rogue</p>');
    }, preload);
    const rogue = await until(
      () => Promise.resolve(run.app.windows().find((p) => p.url().startsWith('data:'))),
      (p) => p !== undefined,
    );
    const answer = await rogue!.evaluate(() => (window as unknown as { ayar: { invoke: (c: string, p: unknown) => Promise<unknown> } }).ayar.invoke('settings.get', {}));
    expect(answer).toMatchObject({ ok: false, error: { code: 'untrusted_sender' } });
    expect((await diag()).rejectedSenders).toBeGreaterThan(before);
    await run.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().startsWith('data:')) w.destroy();
    });
  });
});

describe('data folder (NFR-03, D-53)', () => {
  it('keeps the data folder 0700 and the HMAC key file 0600', () => {
    expect(statSync(t.dataDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(t.dataDir, 'tmp')).mode & 0o777).toBe(0o700);
    expect(statSync(join(t.dataDir, 'hmac.key')).mode & 0o777).toBe(0o600);
    expect(statSync(join(t.dataDir, 'ayar.db')).isFile()).toBe(true);
  });
});

describe('remote debugging guard (D-52)', () => {
  it.each(['--remote-debugging-port=0', '--remote-debugging-pipe', '--remote-debugging-address=127.0.0.1'])(
    'exits with 78 on %s without the inspector, before the port opens',
    async (flag) => {
      const own = tempDataDir();
      try {
        const r = await runDirect([flag, `--ayar-data-dir=${own.dataDir}`]);
        expect(r.code).toBe(78);
        expect(r.output).toContain('refusing remote debugging');
        expect(r.output).not.toContain('DevTools listening');
      } finally {
        own.cleanup();
      }
    },
  );
});
