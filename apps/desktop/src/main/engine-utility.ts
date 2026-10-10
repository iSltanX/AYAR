// The engine as an Electron utilityProcess (6.3), adapted to the supervisor's EngineChild.
import { utilityProcess } from 'electron';
import type { Transport } from '@ayar/protocol';
import type { EngineChild } from './engine-supervisor.ts';

export function spawnUtilityEngine(entry: string, onStderr: (line: string) => void): EngineChild {
  const child = utilityProcess.fork(entry, [], { serviceName: 'AYAR Engine', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr?.on('data', (d: Buffer) => onStderr(d.toString()));
  child.stdout?.on('data', (d: Buffer) => onStderr(d.toString()));
  const exited = new Promise<number>((resolve) => child.once('exit', (code) => resolve(code)));
  const closeListeners: (() => void)[] = [];
  child.once('exit', () => closeListeners.splice(0).forEach((l) => l()));
  const transport: Transport = {
    send: (m) => child.postMessage(m),
    onMessage: (l) => child.on('message', (m: unknown) => l(m)),
    onClose: (l) => closeListeners.push(l),
    close: () => child.kill(),
  };
  return {
    get pid() {
      return child.pid;
    },
    transport,
    exited,
    kill(signal) {
      // utilityProcess.kill() sends SIGTERM; SIGKILL goes to the pid directly.
      if (signal === 'SIGTERM') child.kill();
      else if (child.pid) {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    },
  };
}
