// The sandboxed preload (C-02): exposes window.ayar with invoke and subscribe only. ipcRenderer itself never
// reaches the page. It also reports CSP violations to the main process (AT-30 counts them).
import { contextBridge, ipcRenderer } from 'electron';
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

contextBridge.exposeInMainWorld('ayar', core.api);
