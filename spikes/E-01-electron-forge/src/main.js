// DEV-0 spike harness, main process. Not application code (AGENTS.md: spikes stay in spikes/).
// On launch it runs the E-01 self-test and writes <userData>/selftest.json.
// Launch arguments (after `open ... --args`):
//   --auto-quit      quit after writing the report
//   --no-selftest    skip the E-01 self-test (modes use it)
import { app, BrowserWindow, protocol, net, session, utilityProcess, ipcMain } from 'electron';
import inspector from 'node:inspector';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// G-05: Chromium's remote debugging is not covered by any fuse. Refuse it unless the Node
// inspector is active, which only happens on a test package with EnableNodeCliInspectArguments on.
const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address'];
if (DEBUG_SWITCHES.some((s) => app.commandLine.hasSwitch(s)) && !inspector.url()) {
  process.stderr.write('AYAR Spike: refusing remote debugging switches without the inspector fuse\n');
  app.exit(78);
}

// G-05 positive control for the EnableNodeOptionsEnvironmentVariable fuse: Electron accepts
// --max-http-header-size from NODE_OPTIONS in packaged apps (unlike --require), so its effect shows
// whether NODE_OPTIONS was honored at all.
if (process.env.AYAR_SPIKE_REPORT_NODE_OPTIONS === '1') {
  const http = await import('node:http');
  process.stderr.write(`AYAR_HTTP_MAX_HEADER=${http.maxHeaderSize}\n`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const rendererRoot = path.join(here, 'renderer');
const args = new Set(process.argv.slice(1));
const t0 = Date.now();

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: false } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

function readBuildInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, 'build-info.json'), 'utf8'));
  } catch {
    return { mode: 'dev' };
  }
}

function readBundleId() {
  try {
    const plist = fs.readFileSync(path.resolve(process.execPath, '../../Info.plist'), 'utf8');
    return /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---- engine (utilityProcess) -------------------------------------------------------------
export class Engine {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.stderr = '';
    this.exit = null;
    this.child = utilityProcess.fork(path.join(here, 'engine.mjs'), [], {
      serviceName: 'AYAR Spike Engine',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stderr?.on('data', (d) => { this.stderr += d.toString(); });
    this.child.stdout?.on('data', (d) => { this.stderr += d.toString(); });
    this.child.on('message', (m) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
    });
    this.child.on('exit', (code) => { this.exit = code; });
    this.spawned = new Promise((r) => this.child.once('spawn', r));
  }
  call(cmd, params = {}, timeoutMs = 120000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout ${cmd}`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.child.postMessage({ id, cmd, params });
    });
  }
  get pid() { return this.child.pid; }
}

// ---- window ------------------------------------------------------------------------------
export function createWindow(extra = {}) {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: true,
    ...extra,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      ...(extra.webPreferences || {}),
    },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return win;
}

async function platformFonts(wc, selectors) {
  const dbg = wc.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('DOM.enable');
  await dbg.sendCommand('CSS.enable');
  const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1 });
  const out = {};
  for (const sel of selectors) {
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    const { fonts } = await dbg.sendCommand('CSS.getPlatformFontsForNode', { nodeId });
    const { computedStyle } = await dbg.sendCommand('CSS.getComputedStyleForNode', { nodeId });
    out[sel] = {
      declaredFamily: computedStyle.find((p) => p.name === 'font-family')?.value,
      rendered: fonts,
    };
  }
  dbg.detach();
  return out;
}

const once = (emitter, ev) => new Promise((r) => emitter.once(ev, (...a) => r(a)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function selfTest(win, engine, rendererState) {
  const report = {
    spike: 'E-01',
    startedAt: new Date(t0).toISOString(),
    buildInfo: readBuildInfo(),
    bundleId: readBundleId(),
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
    locale: { app: app.getLocale(), system: app.getSystemLocale(), preferred: app.getPreferredSystemLanguages() },
    launchedFrom: { ppid: process.ppid, argv: process.argv.slice(1) },
    steps: {},
  };
  const step = async (name, fn) => {
    const s = Date.now();
    try {
      report.steps[name] = { ok: true, ms: 0, result: await fn() };
    } catch (e) {
      report.steps[name] = { ok: false, ms: 0, error: String(e?.stack || e) };
    }
    report.steps[name].ms = Date.now() - s;
  };

  const dbPath = path.join(app.getPath('userData'), 'e01-spike.db');
  await step('engine.spawn', async () => { await engine.spawned; return { pid: engine.pid }; });
  await step('engine.sqlite', () => engine.call('sqlite.smoke', { dbPath }));
  await step('renderer.sandbox', async () => rendererState.sandbox ?? (await once(ipcMain, 'spike:renderer-ready'))[1]);
  await step('renderer.fonts', () => platformFonts(win.webContents, ['#mono-latin', '#mono-arabic', '#ui-text']));
  await step('renderer.kill', async () => {
    const rendererPid = win.webContents.getOSProcessId();
    const gone = once(win.webContents, 'render-process-gone');
    process.kill(rendererPid, 'SIGKILL');
    const [, details] = await gone;
    const enginePidBefore = engine.pid;
    const ping = await engine.call('ping');
    const count = await engine.call('sqlite.count', { dbPath });
    const reloaded = once(win.webContents, 'did-finish-load');
    win.webContents.reload();
    await reloaded;
    return {
      rendererPid,
      goneReason: details.reason,
      engineAlive: ping.pid === enginePidBefore,
      enginePing: ping,
      dbRowsAfterKill: count,
      newRendererPid: win.webContents.getOSProcessId(),
    };
  });
  await sleep(300);
  report.cspViolations = rendererState.cspViolations;
  report.engineStderr = engine.stderr;
  report.finishedAt = new Date().toISOString();
  report.ok = Object.values(report.steps).every((s) => s.ok);
  const out = path.join(app.getPath('userData'), 'selftest.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  win.webContents.send('spike:report', report);
  return report;
}

app.whenReady().then(async () => {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url);
    // /mode/... is served from the experiment mode copied into the app (inside asar).
    const root = pathname.startsWith('/mode/') ? appRoot : rendererRoot;
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root + path.sep)) return new Response('not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  const rendererState = { sandbox: null, cspViolations: [] };
  ipcMain.on('spike:renderer-ready', (_e, info) => { rendererState.sandbox = info; });
  ipcMain.on('spike:csp-violation', (_e, v) => { rendererState.cspViolations.push(v); });

  const info = readBuildInfo();
  const modeEntry = path.join(appRoot, 'mode', 'index.mjs');
  const modeModule = fs.existsSync(modeEntry) ? await import(pathToFileURL(modeEntry).toString()) : null;
  if (modeModule) {
    await modeModule.run({ app, createWindow, Engine, ipcMain, args, info, readBundleId });
    return;
  }

  const engine = new Engine();
  const win = createWindow({ title: 'AYAR Spike — E-01' });
  await win.loadURL('app://spike/index.html');
  if (!args.has('--no-selftest')) {
    await selfTest(win, engine, rendererState);
    if (args.has('--auto-quit')) app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
