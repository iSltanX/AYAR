// The probe under Electron's utilityProcess (C-14, 6.3, E-11): the main process starts it at the engine's request
// and sends it, as its first message, one end of a MessageChannel whose other end the engine holds. From then on it
// speaks to the engine alone; when that port closes, it ends.
import { startProbe, type ProbeChannel } from '../driver/index.ts';

interface PortLike {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  on(event: 'close', listener: () => void): void;
  postMessage(message: unknown): void;
  start(): void;
}
interface ParentPort {
  once(event: 'message', listener: (e: { data: unknown; ports: PortLike[] }) => void): void;
}

const parent = (process as unknown as { parentPort?: ParentPort }).parentPort;
if (!parent) throw new Error('not running in a utilityProcess: process.parentPort is missing');
parent.once('message', (e) => {
  const port = e.ports[0];
  if (!port) process.exit(70);
  port.on('close', () => process.exit(0));
  const channel: ProbeChannel = { send: (m) => port.postMessage(m), onMessage: (l) => port.on('message', (ev) => l(ev.data)) };
  port.start();
  startProbe(channel);
});
