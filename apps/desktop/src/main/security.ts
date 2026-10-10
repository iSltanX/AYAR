// The mandatory Electron configuration of plan 15.2 (D-32), in one place so a test can read it.
// Pure functions where possible; the electron-dependent hardening takes the objects it hardens.
import type { Session, WebContents } from 'electron';

export const APP_SCHEME = 'app';
export const APP_HOST = 'ayar';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_URL = `${APP_ORIGIN}/index.html`;

/** 15.2, verbatim: no 'unsafe-inline', no 'unsafe-eval', no 'unsafe-hashes'. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' ayar-evidence: data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** 15.2 «النافذة»: isolation, sandbox, no Node, web security, nothing experimental, no <webview>. */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  navigateOnDragDrop: false,
  safeDialogs: true,
  spellcheck: false,
} as const;

/** The frame a message came from, as far as the check needs it. */
export interface SenderFrame {
  url: string;
  parent: unknown;
}

/**
 * 15.2 «الاتصال»: a message is accepted only from the top frame of one of AYAR's own windows, showing a page
 * of the app's origin. A subframe, another origin, a destroyed frame, or another webContents is refused.
 */
export function isTrustedSender(frame: SenderFrame | null | undefined, senderId: number, trustedIds: ReadonlySet<number>): boolean {
  if (!frame || !trustedIds.has(senderId)) return false;
  if (frame.parent !== null) return false;
  return frame.url.startsWith(`${APP_ORIGIN}/`);
}

/** 15.2 «الأذونات»: every permission request and check is refused; no network leaves the window. */
export function hardenSession(session: Session): void {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_req, callback) => callback({}));
  // NFR-03: the renderer has nothing to fetch from a network. connect-src 'none' already says so; this also
  // stops navigations and subresources the CSP does not govern.
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*', 'file://*/*'] }, (_d, callback) =>
    callback({ cancel: true }),
  );
}

/** 15.2 «التنقل»: no navigation, no new windows, no <webview>, for every webContents the app creates. */
export function hardenContents(contents: WebContents): void {
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame) e.preventDefault();
  });
  contents.on('will-redirect', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
