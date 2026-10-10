// The supervisor's EngineChild over a Node child process: the real engine (via tools/cli's spawn), or a tiny
// script for behaviours the engine never shows (ignoring SIGTERM).
import { spawn } from 'node:child_process';
import { spawnEngine } from '@ayar/cli';
import type { Transport } from '@ayar/protocol';
import type { EngineChild } from '../../src/main/engine-supervisor.ts';

export function realEngine(env: NodeJS.ProcessEnv = {}): EngineChild {
  const p = spawnEngine(env);
  return {
    get pid() {
      return p.child.pid;
    },
    transport: p.transport,
    exited: p.exited,
    kill: (signal) => {
      p.child.kill(signal);
    },
  };
}

/** A child that never answers and ignores SIGTERM: only SIGKILL ends it. */
export function stubbornChild(): EngineChild {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
  const exited = new Promise<number | string>((r) => child.once('exit', (code, signal) => r(code ?? signal ?? -1)));
  const listeners: (() => void)[] = [];
  child.once('exit', () => listeners.forEach((l) => l()));
  const transport: Transport = {
    send: () => {},
    onMessage: () => {},
    onClose: (l) => listeners.push(l),
    close: () => {},
  };
  return {
    get pid() {
      return child.pid;
    },
    transport,
    exited,
    kill: (signal) => {
      child.kill(signal);
    },
  };
}

/** An in-memory child that answers hello with the given message (welcome of another major, or refuse). */
export function scriptedChild(answer: (hello: unknown) => unknown): EngineChild {
  let onMessage: (m: unknown) => void = () => {};
  const closeListeners: (() => void)[] = [];
  let resolveExit: (v: number | string) => void = () => {};
  const exited = new Promise<number | string>((r) => (resolveExit = r));
  const end = (code: number | string) => {
    closeListeners.splice(0).forEach((l) => l());
    resolveExit(code);
  };
  return {
    pid: 4242,
    transport: {
      send: (m) => queueMicrotask(() => onMessage(answer(m))),
      onMessage: (l) => (onMessage = l),
      onClose: (l) => closeListeners.push(l),
      close: () => end(0),
    },
    exited,
    kill: (signal) => end(signal),
  };
}
