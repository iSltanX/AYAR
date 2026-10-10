// A connected engine for integration tests and development (D-19): the same protocol and validation as the
// app, with the declared test HMAC key (G-47). It is the host, so it attaches grants itself.
import { ProtocolClient, type CommandName, type EventTopic, type Grants, type InvokeResult, type ParsedEvent, type Welcome } from '@ayar/protocol';
import { spawnEngine, type EngineProcess } from './engine-process.ts';

export interface ConnectOptions {
  dataDir: string;
  appVersion?: string;
  env?: NodeJS.ProcessEnv;
}

export interface EngineConnection {
  welcome: Welcome;
  process: EngineProcess;
  events: ParsedEvent[];
  invoke(command: CommandName, payload: unknown, grants?: Grants): Promise<InvokeResult<unknown>>;
  waitForEvent<T extends EventTopic>(topic: T, predicate?: (e: ParsedEvent<T>) => boolean, timeoutMs?: number): Promise<ParsedEvent<T>>;
  /** Asks the engine to stop, and waits for it to exit (SIGKILL after 2 s, like the app). */
  close(): Promise<number | string>;
}

export async function connectEngine(o: ConnectOptions): Promise<EngineConnection> {
  const proc = spawnEngine(o.env);
  const events: ParsedEvent[] = [];
  const waiters: (() => void)[] = [];
  const client = new ProtocolClient(proc.transport, {
    onEvent: (e) => {
      events.push(e);
      for (const w of waiters.splice(0)) w();
    },
    onInvalid: (e) => process.stderr.write(`ayar-cli: invalid message from the engine: ${e.code}\n`),
  });
  const welcome = await client.handshake('cli', { dataDir: o.dataDir, hmacKeySource: 'test', appVersion: o.appVersion ?? '0.1.0' });

  const waitForEvent = <T extends EventTopic>(topic: T, predicate: (e: ParsedEvent<T>) => boolean = () => true, timeoutMs = 10_000) =>
    new Promise<ParsedEvent<T>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${topic} event within ${timeoutMs} ms`)), timeoutMs);
      const check = () => {
        const hit = events.find((e): e is ParsedEvent<T> => e.topic === topic && predicate(e as ParsedEvent<T>));
        if (hit) {
          clearTimeout(timer);
          resolve(hit);
        } else waiters.push(check);
      };
      check();
    });

  return {
    welcome,
    process: proc,
    events,
    invoke: (command, payload, grants) => client.request(command, payload, grants),
    waitForEvent,
    async close() {
      client.shutdown();
      const timer = setTimeout(() => proc.child.kill('SIGKILL'), 2000);
      const code = await proc.exited;
      clearTimeout(timer);
      return code;
    },
  };
}
