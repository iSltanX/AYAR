// DEV-0 spike harness, sandboxed preload. Exposes a minimal typed surface, never raw ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('securitypolicyviolation', (e) => {
  ipcRenderer.send('spike:csp-violation', { directive: e.violatedDirective, blocked: e.blockedURI });
});

contextBridge.exposeInMainWorld('spike', {
  ready: (info) => ipcRenderer.send('spike:renderer-ready', info),
  onReport: (cb) => ipcRenderer.on('spike:report', (_e, r) => cb(r)),
  send: (channel, payload) => {
    if (typeof channel === 'string' && channel.startsWith('mode:')) ipcRenderer.send(channel, payload);
  },
  invoke: (channel, payload) => {
    if (typeof channel === 'string' && channel.startsWith('mode:')) return ipcRenderer.invoke(channel, payload);
    return Promise.reject(new Error('channel not allowed'));
  },
  on: (channel, cb) => {
    if (typeof channel === 'string' && channel.startsWith('mode:')) ipcRenderer.on(channel, (_e, v) => cb(v));
  },
});
