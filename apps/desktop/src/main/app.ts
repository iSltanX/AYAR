// The main process (C-01): one instance, the hardened window and session, the app protocol, the menus, the
// engine supervisor, and the IPC gateway with its sender check. Loaded by entry.ts after the D-52 guard.
import { app, BrowserWindow as Windows, ipcMain, Menu, Notification, powerSaveBlocker, protocol, session, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { randomBytes } from 'node:crypto';
import inspector from 'node:inspector';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { IPC, protocolError, z, type DeliveredEvent, type EngineHealth, type ParsedEvent } from '@ayar/protocol';
import { createFileLogger, ensureDataDir, nodeFileSystem, protectedLocation, stderrLogger, systemClock, type Logger } from '@ayar/engine/host-support';
import { createTranslator, resolveLanguage } from '@ayar/i18n';
import { REPOSITORY } from './about.ts';
import { RunNotifier, type RunStateLike } from './run-notifier.ts';
import { serveAppRequest } from './app-protocol.ts';
import { spawnUtilityEngine } from './engine-utility.ts';
import { EngineSupervisor, PREPARE_QUIT_WAIT_MS } from './engine-supervisor.ts';
import { EVIDENCE_SCHEME, serveEvidence } from './evidence-protocol.ts';
import { SleepGuard } from './sleep-guard.ts';
import { EventPorts } from './events-port.ts';
import { Gateway } from './gateway.ts';
import { menuTemplate } from './menu.ts';
import { applyChromiumPaths, bundlePaths, resolveDataDir } from './paths.ts';
import { APP_SCHEME, hardenContents, hardenSession, isTrustedSender } from './security.ts';
import { electronSystemServices } from './system-services.ts';
import { TokenRegistry } from './tokens.ts';
import { createMainWindow } from './window.ts';

const dataDir = resolveDataDir();
applyChromiumPaths(dataDir);

// Before 'ready': the app scheme is standard and secure, and nothing more (no fetch, no CORS, no streams).
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false, stream: false, codeCache: false } },
  // Evidence images (CSP img-src ayar-evidence:): a token in the path, served once (C-17, DEV-5).
  { scheme: EVIDENCE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false, stream: false, codeCache: false } },
]);

const CspViolation = z.strictObject({
  directive: z.string().max(200),
  blockedURI: z.string().max(500),
  sample: z.string().max(200),
});

/** Development builds expose their internals to the security tests; the packaged app does not. */
interface Diagnostics {
  cspViolations: z.infer<typeof CspViolation>[];
  rejectedSenders: number;
  supervisor: EngineSupervisor;
  preload: string;
  dataDir: string;
  health: EngineHealth[];
}

// A folder dropped on the Dock icon before the app is ready waits for the window (C-01).
const pendingOpenFiles: string[] = [];
let openFileHandler: ((path: string) => void) | null = null;
app.on('open-file', (e, path) => {
  e.preventDefault();
  if (openFileHandler) openFileHandler(path);
  else pendingOpenFiles.push(path);
});

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  // Not awaited: Electron emits 'ready' only after the entry module (and its top-level awaits) finished, and
  // run() itself waits for 'ready'. Everything that must precede 'ready' happened above, synchronously.
  run().catch((e: unknown) => {
    process.stderr.write(`AYAR: the main process failed to start: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    app.exit(70);
  });
}

async function run(): Promise<void> {
  const paths = bundlePaths();
  const trusted = new Set<number>();
  let mainWindow: BrowserWindow | null = null;
  let logger: Logger = stderrLogger(systemClock);

  app.on('web-contents-created', (_e, contents) => hardenContents(contents));
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  await app.whenReady();
  hardenSession(session.defaultSession);
  protocol.handle(APP_SCHEME, (req) => serveAppRequest(req.url, paths.renderer));

  try {
    const { layout } = await ensureDataDir(nodeFileSystem, dataDir, process.getuid?.() ?? -1);
    logger = createFileLogger({ dir: layout.logs, name: 'main', clock: systemClock });
  } catch (e) {
    // The engine reports the same problem as its health (data_dir_unsafe); the main process keeps stderr.
    logger.log('error', 'data folder unusable', { error: e instanceof Error ? e.message : String(e) });
  }
  logger.log('info', 'main process started', { version: app.getVersion(), packaged: app.isPackaged });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(resolveLanguage('system', app.getPreferredSystemLanguages()))));
  // D-DEV12-02: macOS's own «حول عِيَار» names who made it and where its repository is.
  const systemLang = () => resolveLanguage('system', app.getPreferredSystemLanguages());
  const about = createTranslator(systemLang());
  app.setAboutPanelOptions({ applicationName: about('common.appName'), applicationVersion: app.getVersion(), credits: `${about('menu.about.credits')}\n${REPOSITORY}` });

  const ports = new EventPorts();
  const supervisorStream = `supervisor-${randomBytes(9).toString('base64url')}`;
  let supervisorSeq = 0;
  const healthLog: EngineHealth[] = [];
  // FR-26: a power-save blocker while a run that asks for it is running.
  const sleepGuard = new SleepGuard({ start: () => powerSaveBlocker.start('prevent-app-suspension'), stop: (id) => powerSaveBlocker.stop(id) });
  const keepLast = <T>(list: T[], item: T, max = 100) => {
    list.push(item);
    if (list.length > max) list.splice(0, list.length - max);
  };
  // 13.3 «الإشعارات» (DEV-12): a run that ends while the window is not in front, when the setting allows it.
  let notifierEngine: Pick<EngineSupervisor, 'request'> | null = null;
  const notifier = new RunNotifier({
    enabled: async () => {
      const r = await notifierEngine?.request('settings.get', { keys: ['run.notify'] }).catch(() => null);
      return !!(r?.ok && (r.result as { values: { 'run.notify'?: boolean } }).values['run.notify']);
    },
    focused: () => Windows.getFocusedWindow() !== null,
    show: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    },
    lang: systemLang,
  });
  const deliver = (e: ParsedEvent): DeliveredEvent => ({ topic: e.topic, stream: e.stream, seq: e.seq, at: e.at, payload: e.payload });

  const supervisor = new EngineSupervisor({
    spawn: () =>
      spawnUtilityEngine(paths.engine, (text) => logger.log('warn', 'engine stderr', { text: text.slice(0, 4000) }), {
        entry: paths.probe,
        onStderr: (text) => logger.log('warn', 'probe stderr', { text: text.slice(0, 4000) }),
      }),
    config: { dataDir, hmacKeySource: 'file', appVersion: app.getVersion() },
    logPath: join(dataDir, 'logs', 'engine.log'),
    onHealth: (payload) => {
      keepLast(healthLog, payload);
      sleepGuard.onEngineHealth(payload);
      ports.broadcast({ topic: 'engine.health', stream: supervisorStream, seq: ++supervisorSeq, at: new Date().toISOString(), payload });
    },
    onEngineEvent: (e) => {
      if (e.topic === 'engine.health') keepLast(healthLog, e.payload as EngineHealth);
      if (e.topic === 'run.state') sleepGuard.onRunState(e.payload as { runId: string; state: string; preventSleep: boolean });
      if (e.topic === 'run.state') notifier.onRunState(e.payload as RunStateLike);
      ports.broadcast(deliver(e));
    },
    onConnected: () => {
      // A new engine session: the runs of the previous one are no longer running (FR-25 marks them interrupted).
      sleepGuard.reset();
      notifier.reset();
      ports.renewAll();
    },
    log: (level, message, fields) => logger.log(level, message, fields),
  });

  notifierEngine = supervisor;
  const tokens = new TokenRegistry({ randomBytes: (n) => new Uint8Array(randomBytes(n)), clock: { wall: () => Date.now(), mono: () => performance.now() } });
  const gateway = new Gateway({
    engine: supervisor,
    system: electronSystemServices(() => mainWindow),
    tokens,
    language: () => resolveLanguage('system', app.getPreferredSystemLanguages()),
    locationOf: (real) => protectedLocation(real, app.getPath('home')),
    home: app.getPath('home'),
    log: (level, message, fields) => logger.log(level, message, fields),
  });
  protocol.handle(EVIDENCE_SCHEME, (req) =>
    serveEvidence(req.url, { resolve: (token) => supervisor.request('internal.evidencePath', { token }), readFile: async (p) => new Uint8Array(await readFile(p)) }),
  );

  const diagnostics: Diagnostics = { cspViolations: [], rejectedSenders: 0, supervisor, preload: paths.preload, dataDir, health: healthLog };
  // The diagnostics the e2e tests read (CSP violations, rejected senders): on a development build, and on a package
  // only while Node's inspector is active, which the fuses allow on the derived test package alone (D-51, DEV-13).
  if (!app.isPackaged || inspector.url()) (globalThis as { ayarDiagnostics?: Diagnostics }).ayarDiagnostics = diagnostics;

  const isTrusted = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
    const ok = isTrustedSender(event.senderFrame, event.sender.id, trusted);
    if (!ok) {
      diagnostics.rejectedSenders++;
      logger.log('warn', 'message from an untrusted frame rejected', { channel: 'ipc', senderId: event.sender.id });
    }
    return ok;
  };

  ipcMain.handle(IPC.invoke, async (event, request: unknown) => {
    if (!isTrusted(event)) return { ok: false, error: protocolError('untrusted_sender') };
    return gateway.invoke(request);
  });
  ipcMain.on(IPC.eventsPortRequest, (event) => {
    if (isTrusted(event)) ports.attach(event.sender);
  });
  // C-01 «السحب والإفلات»: the preload sends the dropped paths here alone; the page gets a selection token back
  // as `bridge.drop`, never the path. A folder dropped on the Dock icon arrives as open-file (below).
  const DropPaths = z.strictObject({ paths: z.array(z.string().max(4096)).max(16) });
  ipcMain.on(IPC.dropResolve, (event, raw: unknown) => {
    if (!isTrusted(event)) return;
    const d = DropPaths.safeParse(raw);
    void gateway.resolveDrop(d.success ? d.data.paths : []).then((result) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.dropResult, result);
    });
  });
  const deliverOpenFile = (path: string) => {
    void gateway.resolveDrop([path]).then((result) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.dropResult, result);
    });
  };
  openFileHandler = deliverOpenFile;

  let cspLogged = 0;
  ipcMain.on(IPC.cspViolation, (event, raw: unknown) => {
    if (!isTrusted(event)) return;
    const v = CspViolation.safeParse(raw);
    if (!v.success) return;
    keepLast(diagnostics.cspViolations, v.data);
    // Logged, but not without limit: a flood must not rotate the real log lines away.
    cspLogged++;
    if (cspLogged <= 50) logger.log('error', 'CSP violation', v.data);
    else if (cspLogged % 1000 === 0) logger.log('error', 'CSP violations continue', { total: cspLogged });
  });

  const openWindow = (): BrowserWindow => {
    const win = createMainWindow(paths.preload, !app.isPackaged, (message, fields) => logger.log('error', message, fields));
    const id = win.webContents.id;
    trusted.add(id);
    win.on('closed', () => {
      trusted.delete(id);
      if (mainWindow === win) mainWindow = null;
    });
    mainWindow = win;
    return win;
  };

  supervisor.start();
  // What was dropped on the Dock icon at launch reaches the page once it can listen.
  openWindow().webContents.once('did-finish-load', () => {
    for (const path of pendingOpenFiles.splice(0)) deliverOpenFile(path);
  });
  app.on('activate', () => {
    if (!mainWindow) openWindow();
  });
  // macOS: the app stays open without windows; the engine keeps its state until the user quits.
  app.on('window-all-closed', () => {});

  // Quitting: stop the engine (SIGTERM, then SIGKILL after 2 s) before the app exits (C-01).
  let stopping = false;
  app.on('before-quit', (e) => {
    if (stopping) return;
    stopping = true;
    e.preventDefault();
    logger.log('info', 'quitting: stopping the engine');
    // 9.7: an active run (and a setup command) ends the short way first (its checks «أُلغي» because the app quits),
    // then the engine stops: SIGTERM, and SIGKILL only after STOP_GRACE_MS, longer than the engine's own wait.
    const quick = supervisor.request('internal.prepareQuit', {}).catch(() => null);
    void Promise.race([quick, new Promise((r) => setTimeout(r, PREPARE_QUIT_WAIT_MS))])
      .then(() => supervisor.stop())
      .catch((err: unknown) => logger.log('error', 'engine stop failed', { error: String(err) }))
      .finally(() => {
        logger.flush();
        app.quit();
      });
  });
}
