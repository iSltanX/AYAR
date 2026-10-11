// The renderer's one bridge client (C-02, C-03): every screen calls the engine and the main process through it,
// and listens to the numbered events through it. Text and data only: nothing here builds markup (C-03).
import type { CommandPayload, ProtocolError, RendererCommandName, RendererResult, SubscribableTopic, TopicMessage } from '@ayar/protocol';
import { AyarError, createBridgeClient, type BridgeClient } from '../bridge.ts';

let client: BridgeClient | null = null;

/** The bridge client over window.ayar, made on first use (the gallery never makes one). */
export function bridge(): BridgeClient {
  client ??= createBridgeClient(window.ayar);
  return client;
}

/**
 * The page's reactive state is a proxy the bridge cannot clone («An object could not be cloned»): a payload crosses as
 * the plain JSON data it holds (every payload is JSON by its contract).
 */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Invokes a command; a coded failure is thrown as AyarError. */
export function call<C extends RendererCommandName>(command: C, payload: CommandPayload<C>): Promise<RendererResult<C>> {
  return bridge().invoke(command, plain(payload));
}

/** Invokes a command and returns the result or the coded error, never throwing a protocol failure. */
export async function attempt<C extends RendererCommandName>(
  command: C,
  payload: CommandPayload<C>,
): Promise<{ ok: true; result: RendererResult<C> } | { ok: false; error: ProtocolError }> {
  try {
    return { ok: true, result: await call(command, payload) };
  } catch (e) {
    if (e instanceof AyarError) return { ok: false, error: e.error };
    throw e;
  }
}

/** Listens to an event topic or a bridge topic; returns the unsubscribe function. */
export function on<T extends SubscribableTopic>(topic: T, handler: (message: TopicMessage<T>) => void): () => void {
  return bridge().subscribe(topic, handler);
}

/** Copies a short text the user sees (an id, a command, a path) through the main process (the page has no clipboard). */
export function copyText(text: string): void {
  if (text) void attempt('clipboard.copyText', { text: text.slice(0, 4096) });
}

export { AyarError };
