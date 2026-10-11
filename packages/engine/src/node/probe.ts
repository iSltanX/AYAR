// The probe's process under Node (tools/cli and the tests; G-47 «يبقى المسبار بحسب E-11»): the engine forks the
// probe's Node entry itself, speaks to it over Node's IPC, and ends it with its job. Its environment is short (no
// variable of the user's beyond what a browser needs), and what it writes to stderr is kept, bounded, for the log.
import { fork } from 'node:child_process';
import type { ProbeHost, ProbeProcess } from '../ports/index.ts';

const ENV_KEYS = ['HOME', 'USER', 'LOGNAME', 'PATH', 'TMPDIR', 'LANG', '__CF_USER_TEXT_ENCODING'];

export function nodeProbeHost(o: { entry: string | URL; axePath: string | null; onStderr?: (text: string) => void }): ProbeHost {
  return {
    axePath: o.axePath,
    start() {
      const env: Record<string, string> = {};
      for (const k of ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k];
      const child = fork(o.entry, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env, execArgv: [] });
      child.stderr?.on('data', (d: Buffer) => o.onStderr?.(d.toString().slice(0, 4000)));
      const exited = new Promise<string>((resolve) => child.once('exit', (code, signal) => resolve(signal ?? String(code ?? 'closed'))));
      const proc: ProbeProcess = {
        pid: child.pid ?? null,
        send: (m) => {
          if (child.connected) child.send(m as never);
        },
        onMessage: (l) => child.on('message', (m) => l(m)),
        exited,
        close: () => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
          // A probe that does not end on its own is ended (its browser is its child and goes with it).
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 3000).unref();
        },
      };
      return Promise.resolve(proc);
    },
  };
}
