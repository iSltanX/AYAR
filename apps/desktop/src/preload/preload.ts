// The sandboxed preload (C-02): exposes window.ayar with invoke and subscribe only. ipcRenderer itself never
// reaches the page. It also reports CSP violations to the main process (AT-30 counts them).
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '@ayar/protocol';
import { createBridgeCore } from './bridge-core.ts';

const core = createBridgeCore({
  invoke: (request) => ipcRenderer.invoke(IPC.invoke, request),
  reportError: (e) => console.error('ayar: an event handler failed', e),
});

ipcRenderer.on(IPC.eventsPort, (event) => {
  const port = event.ports[0];
  if (!port) return;
  core.acceptPort({
    listen: (handler) => {
      port.onmessage = (e) => handler(e.data);
      port.start();
    },
    close: () => port.close(),
  });
});
ipcRenderer.send(IPC.eventsPortRequest);

window.addEventListener('securitypolicyviolation', (e) => {
  ipcRenderer.send(IPC.cspViolation, {
    directive: String(e.violatedDirective).slice(0, 200),
    blockedURI: String(e.blockedURI).slice(0, 500),
    sample: String(e.sample ?? '').slice(0, 200),
  });
});

// C-01 «السحب والإفلات»: the preload, not the page, reads the dropped item's path (webUtils.getPathForFile) and
// sends it to the main process alone; the page gets a selection token back as `bridge.drop`. The page's own drop
// handler only shows the drop zone's state; Chromium's default (opening the file) is prevented here as well.
window.addEventListener(
  'drop',
  (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    const paths = [...files].slice(0, 16).map((f) => webUtils.getPathForFile(f)).filter((p) => p !== '');
    ipcRenderer.send(IPC.dropResolve, { paths });
  },
  true,
);
window.addEventListener('dragover', (e) => e.preventDefault(), true);
ipcRenderer.on(IPC.dropResult, (_event, result: unknown) => core.acceptDrop(result));

contextBridge.exposeInMainWorld('ayar', core.api);
