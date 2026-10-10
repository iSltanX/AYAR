// Test helpers: an in-memory transport whose other end the test drives as the engine.
import type { Transport } from '../src/index.ts';

export interface FakeEngineEnd {
  transport: Transport;
  sent: unknown[];
  deliver(message: unknown): void;
  close(): void;
}

export function fakeTransport(): FakeEngineEnd {
  const sent: unknown[] = [];
  let onMessage: (m: unknown) => void = () => {};
  let onClose: () => void = () => {};
  const transport: Transport = {
    send: (m) => sent.push(structuredClone(m)),
    onMessage: (l) => (onMessage = l),
    onClose: (l) => (onClose = l),
    close: () => onClose(),
  };
  return { transport, sent, deliver: (m) => onMessage(structuredClone(m)), close: () => onClose() };
}

export const token = (prefix: string, fill = 'A') => `${prefix}_${fill.repeat(43)}`;

export const welcome = (major = 1) => ({
  kind: 'welcome',
  protocol: { major, minor: 0 },
  engine: { version: '0.1.0', pid: 42, stream: 'engine-abcdef12' },
});
