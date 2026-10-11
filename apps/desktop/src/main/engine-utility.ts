// The engine as an Electron utilityProcess (6.3), adapted to the supervisor's EngineChild. DEV-7 (C-14, 6.3,
// E-11): the web probe is a second utilityProcess the main process starts at the engine's request
// (`{ ayarHost: 'probe.start' }`), joined to the engine by a MessageChannel — one port to the probe, the other to the
// engine (`probe.port`) — so the two speak without the main process in between. The engine ends one with
// `probe.stop`; the main process says when one ended (`probe.exited`); and every probe ends with its engine.
import { MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from 'electron';
import type { Transport } from '@ayar/protocol';
import type { EngineChild } from './engine-supervisor.ts';

/** The environment the engine inherits: a short allowlist, not the main process's whole environment. */
const ENGINE_ENV_KEYS = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', '__CF_USER_TEXT_ENCODING'];
/** The probe's: what its browser needs, nothing more. */
const PROBE_ENV_KEYS = ['HOME', 'USER', 'LOGNAME', 'PATH', 'TMPDIR', 'LANG', '__CF_USER_TEXT_ENCODING'];
const MAX_PROBES = 2;

type HostRequest = { ayarHost: 'probe.start'; id: string } | { ayarHost: 'probe.stop'; id: string };
const isHostRequest = (m: unknown): m is HostRequest => {
  const o = m as Record<string, unknown> | null;
  return typeof o === 'object' && o !== null && (o.ayarHost === 'probe.start' || o.ayarHost === 'probe.stop') && typeof o.id === 'string' && o.id.length <= 64;
};

const envOf = (keys: readonly string[]) => {
  const env: Record<string, string> = {};
  for (const k of keys) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
};

export interface ProbeLaunch {
  /** dist/engine/probe.mjs */
  entry: string;
  onStderr: (line: string) => void;
}

export function spawnUtilityEngine(entry: string, onStderr: (line: string) => void, probe?: ProbeLaunch): EngineChild {
  const child = utilityProcess.fork(entry, [], { serviceName: 'AYAR Engine', stdio: ['ignore', 'pipe', 'pipe'], env: envOf(ENGINE_ENV_KEYS) });
  child.stderr?.on('data', (d: Buffer) => onStderr(d.toString()));
  child.stdout?.on('data', (d: Buffer) => onStderr(d.toString()));
  let hasExited = false;
  const probes = new Map<string, UtilityProcess>();
  const exited = new Promise<number>((resolve) =>
    child.once('exit', (code) => {
      hasExited = true;
      // A probe never outlives its engine.
      for (const p of probes.values()) p.kill();
      probes.clear();
      resolve(code);
    }),
  );
  const closeListeners: (() => void)[] = [];
  child.once('exit', () => closeListeners.splice(0).forEach((l) => l()));

  const reply = (m: unknown, transfer: MessagePortMain[] = []) => {
    if (!hasExited) child.postMessage(m, transfer);
  };
  const onHost = (m: HostRequest) => {
    if (m.ayarHost === 'probe.stop') {
      probes.get(m.id)?.kill();
      return;
    }
    if (!probe) return reply({ ayarHost: 'probe.failed', id: m.id, error: 'this build has no probe' });
    if (probes.size >= MAX_PROBES || probes.has(m.id)) return reply({ ayarHost: 'probe.failed', id: m.id, error: 'too many probes' });
    let p: UtilityProcess;
    try {
      p = utilityProcess.fork(probe.entry, [], { serviceName: 'AYAR Probe', stdio: ['ignore', 'pipe', 'pipe'], env: envOf(PROBE_ENV_KEYS) });
    } catch (e) {
      return reply({ ayarHost: 'probe.failed', id: m.id, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    }
    probes.set(m.id, p);
    p.stderr?.on('data', (d: Buffer) => probe.onStderr(d.toString()));
    p.stdout?.on('data', (d: Buffer) => probe.onStderr(d.toString()));
    p.once('spawn', () => {
      const { port1, port2 } = new MessageChannelMain();
      p.postMessage({ ayarProbe: 'port' }, [port1]);
      reply({ ayarHost: 'probe.port', id: m.id, pid: p.pid ?? null }, [port2]);
    });
    p.once('exit', (code) => {
      probes.delete(m.id);
      reply({ ayarHost: 'probe.exited', id: m.id, code: String(code) });
    });
  };

  const transport: Transport = {
    send: (m) => child.postMessage(m),
    onMessage: (l) =>
      child.on('message', (m: unknown) => {
        // The host messages are the main process's own (they are not the protocol's, and never reach its client).
        if (isHostRequest(m)) onHost(m);
        else l(m);
      }),
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
