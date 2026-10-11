// The two host channels. Electron's utilityProcess exposes `process.parentPort` (a global, not an import);
// a Node child started with fork() has `process.send`. The engine imports neither electron nor anything else.
import type { HostChannel, ProbeHost, ProbeProcess } from '../ports/index.ts';

interface MessagePortLike {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  on(event: 'close', listener: () => void): void;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

interface ParentPort {
  on(event: 'message', listener: (e: { data: unknown; ports?: MessagePortLike[] }) => void): void;
  postMessage(message: unknown): void;
}

/**
 * The messages between the engine and the main process that are not the protocol's (C-14, 6.3): the engine asks for
 * a probe process (`probe.start`), the main process answers with one end of a MessageChannel joined to it
 * (`probe.port`), or why it could not (`probe.failed`); the engine asks to end one (`probe.stop`), and the main
 * process says when one ended (`probe.exited`). They carry `ayarHost`, which no protocol message has.
 */
export type HostRequest = { ayarHost: 'probe.start'; id: string } | { ayarHost: 'probe.stop'; id: string };
export type HostReply = { ayarHost: 'probe.port'; id: string; pid: number | null } | { ayarHost: 'probe.failed'; id: string; error: string } | { ayarHost: 'probe.exited'; id: string; code: string };
const isHost = (m: unknown): m is HostReply => typeof m === 'object' && m !== null && typeof (m as Record<string, unknown>).ayarHost === 'string';

function parentPort(): ParentPort {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (!port) throw new Error('not running in a utilityProcess: process.parentPort is missing');
  return port;
}

export function utilityProcessChannel(): HostChannel {
  const port = parentPort();
  const closeListeners: (() => void)[] = [];
  // A utilityProcess has no disconnect event; the supervisor kills it. Its parent's death closes stdin-less
  // processes too, which ends the event loop of the port.
  return {
    send: (m) => port.postMessage(m),
    onMessage: (l) =>
      port.on('message', (e) => {
        if (!isHost(e.data)) l(e.data);
      }),
    onClose: (l) => closeListeners.push(l),
  };
}

/** The probe under Electron (E-11): the main process starts it; the engine holds a MessagePort to it. */
export function utilityProbeHost(axePath: string | null): ProbeHost {
  const port = parentPort();
  const pending = new Map<string, { resolve: (p: ProbeProcess) => void; reject: (e: Error) => void }>();
  const exits = new Map<string, (code: string) => void>();
  let seq = 0;
  port.on('message', (e) => {
    const m = e.data;
    if (!isHost(m)) return;
    if (m.ayarHost === 'probe.exited') {
      exits.get(m.id)?.(m.code);
      exits.delete(m.id);
      // One that ended before it was joined to the engine: said at once, not after the start's limit.
      const early = pending.get(m.id);
      if (early) {
        pending.delete(m.id);
        early.reject(new Error(`the probe ended before it started (${m.code})`));
      }
      return;
    }
    const wait = pending.get(m.id);
    if (!wait) return;
    pending.delete(m.id);
    if (m.ayarHost === 'probe.failed') return wait.reject(new Error(m.error));
    const mp = e.ports?.[0];
    if (!mp) return wait.reject(new Error('no port came with the probe'));
    let done: (code: string) => void = () => {};
    const exited = new Promise<string>((r) => (done = r));
    exits.set(m.id, done);
    mp.on('close', () => done('closed'));
    const listeners: ((x: unknown) => void)[] = [];
    mp.on('message', (ev) => {
      for (const l of listeners) l(ev.data);
    });
    mp.start();
    wait.resolve({
      pid: m.pid,
      send: (x) => mp.postMessage(x),
      onMessage: (l) => listeners.push(l),
      exited,
      close: () => {
        port.postMessage({ ayarHost: 'probe.stop', id: m.id } satisfies HostRequest);
        mp.close();
      },
    });
  });
  return {
    axePath,
    start() {
      const id = `probe-${++seq}-${process.pid}`;
      return new Promise<ProbeProcess>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        port.postMessage({ ayarHost: 'probe.start', id } satisfies HostRequest);
        setTimeout(() => {
          if (pending.delete(id)) reject(new Error('the main process did not start the probe in time'));
        }, 20_000).unref();
      });
    },
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
