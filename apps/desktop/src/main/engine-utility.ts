// The engine as an Electron utilityProcess (6.3), adapted to the supervisor's EngineChild.
import { utilityProcess } from 'electron';
import type { Transport } from '@ayar/protocol';
import type { EngineChild } from './engine-supervisor.ts';

/** The environment the engine inherits: a short allowlist, not the main process's whole environment. */
const ENGINE_ENV_KEYS = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', '__CF_USER_TEXT_ENCODING'];

export function spawnUtilityEngine(entry: string, onStderr: (line: string) => void): EngineChild {
  const env: Record<string, string> = {};
  for (const k of ENGINE_ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k];
  const child = utilityProcess.fork(entry, [], { serviceName: 'AYAR Engine', stdio: ['ignore', 'pipe', 'pipe'], env });
  child.stderr?.on('data', (d: Buffer) => onStderr(d.toString()));
  child.stdout?.on('data', (d: Buffer) => onStderr(d.toString()));
  let hasExited = false;
  const exited = new Promise<number>((resolve) =>
    child.once('exit', (code) => {
      hasExited = true;
      resolve(code);
    }),
  );
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
      if (hasExited) return; // the pid may already belong to another process
      // utilityProcess.kill() sends SIGTERM; SIGKILL goes to the pid directly, once it has one.
      if (signal === 'SIGTERM' || !child.pid) child.kill();
      else {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    },
  };
}
