// The two host channels. Electron's utilityProcess exposes `process.parentPort` (a global, not an import);
// a Node child started with fork() has `process.send`. The engine imports neither electron nor anything else.
import type { HostChannel } from '../ports/index.ts';

interface ParentPort {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

export function utilityProcessChannel(): HostChannel {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (!port) throw new Error('not running in a utilityProcess: process.parentPort is missing');
  const closeListeners: (() => void)[] = [];
  // A utilityProcess has no disconnect event; the supervisor kills it. Its parent's death closes stdin-less
  // processes too, which ends the event loop of the port.
  return {
    send: (m) => port.postMessage(m),
    onMessage: (l) => port.on('message', (e) => l(e.data)),
    onClose: (l) => closeListeners.push(l),
  };
}

export function nodeIpcChannel(): HostChannel {
  if (typeof process.send !== 'function') throw new Error('not started with fork(): process.send is missing');
  return {
    send: (m) => {
      process.send?.(m);
    },
    onMessage: (l) => process.on('message', (m) => l(m)),
    onClose: (l) => process.once('disconnect', l),
  };
}
