// Starts the engine as a Node child process (fork, IPC) and wraps it in a protocol Transport. Node 24 runs
// the engine's TypeScript sources directly (type stripping), so tools/cli needs no build.
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Transport } from '@ayar/protocol';

export const ENGINE_ENTRY = fileURLToPath(import.meta.resolve('@ayar/engine/bin/node'));

export interface EngineProcess {
  child: ChildProcess;
  transport: Transport;
  /** Resolves with the exit code (or the signal name) when the process ends. */
  exited: Promise<number | string>;
  stderr: () => string;
}

export function spawnEngine(env: NodeJS.ProcessEnv = {}): EngineProcess {
  const child = fork(ENGINE_ENTRY, [], {
    execArgv: [],
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
  child.stdout?.on('data', (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<number | string>((resolve) => child.once('exit', (code, signal) => resolve(code ?? signal ?? -1)));
  const closeListeners: (() => void)[] = [];
  let closed = false;
  const fireClose = () => {
    if (closed) return;
    closed = true;
    for (const l of closeListeners) l();
  };
  child.once('exit', fireClose);
  child.once('disconnect', fireClose);
  const transport: Transport = {
    send: (m) => {
      if (child.connected) child.send(m as never);
    },
    onMessage: (l) => child.on('message', (m) => l(m)),
    onClose: (l) => closeListeners.push(l),
    close: () => {
      if (child.connected) child.disconnect();
    },
  };
  return { child, transport, exited, stderr: () => stderr };
}
