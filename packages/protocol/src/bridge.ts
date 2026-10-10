// The renderer-facing bridge (C-02): window.ayar exposes invoke and subscribe only, never ipcRenderer.
// These are types and constants only, so the renderer imports nothing at runtime from here but names.
import type { CommandPayload, RendererCommandName, RendererResult } from './commands/index.ts';
import type { ProtocolError } from './errors.ts';
import type { EventPayload, EventTopic } from './events/index.ts';

export type InvokeResult<T> = { ok: true; result: T } | { ok: false; error: ProtocolError };

/** Signals the bridge itself raises: the UI must re-read its state (C-02, C-03). */
export const BRIDGE_TOPICS = ['bridge.resync'] as const;
export type BridgeTopic = (typeof BRIDGE_TOPICS)[number];
export type ResyncReason = 'port_replaced' | 'sequence_gap' | 'stream_changed';
export interface BridgeResync {
  reason: ResyncReason;
}

export interface DeliveredEvent<T extends EventTopic = EventTopic> {
  topic: T;
  stream: string;
  seq: number;
  at: string;
  payload: EventPayload<T>;
}

export type SubscribableTopic = EventTopic | BridgeTopic;
export type TopicMessage<T extends SubscribableTopic> = T extends EventTopic ? DeliveredEvent<T> : BridgeResync;

export interface AyarBridge {
  invoke<C extends RendererCommandName>(command: C, payload: CommandPayload<C>): Promise<InvokeResult<RendererResult<C>>>;
  subscribe<T extends SubscribableTopic>(topic: T, handler: (message: TopicMessage<T>) => void): () => void;
}

/** IPC channel names between the preload and the main process. */
export const IPC = {
  invoke: 'ayar:invoke',
  eventsPortRequest: 'ayar:events-port-request',
  eventsPort: 'ayar:events-port',
  cspViolation: 'ayar:csp-violation',
} as const;
