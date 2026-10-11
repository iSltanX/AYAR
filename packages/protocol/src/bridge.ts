// The renderer-facing bridge (C-02): window.ayar exposes invoke and subscribe only, never ipcRenderer.
// These are types and constants only, so the renderer imports nothing at runtime from here but names.
import type { CommandPayload, RendererCommandName, RendererResult } from './commands/index.ts';
import type { ProtocolError } from './errors.ts';
import type { ProtectedLocation } from './domain/projects.ts';
import type { EventPayload, EventTopic } from './events/index.ts';

export type InvokeResult<T> = { ok: true; result: T } | { ok: false; error: ProtocolError };

/** Signals the bridge itself raises: the UI must re-read its state (C-02, C-03). */
export const BRIDGE_TOPICS = ['bridge.resync', 'bridge.drop'] as const;
export type BridgeTopic = (typeof BRIDGE_TOPICS)[number];
export type ResyncReason = 'port_replaced' | 'sequence_gap' | 'stream_changed';
export interface BridgeResync {
  reason: ResyncReason;
}
/**
 * A folder dropped on the window or on the Dock icon (C-01, plan C-01 «السحب والإفلات»; protocol 1.6): the preload
 * takes its path from the drop event and hands it to the main process alone, which checks it and mints a selection
 * token for project.add. The page receives the token, never the path.
 */
export type BridgeDrop =
  /** `location`: the protected location macOS asks a permission for, since a drop does not pass the open panel (E-05, FR-59). */
  | {
      ok: true;
      selectionToken: string;
      location: ProtectedLocation | null;
      /** For the permission sheet only (D-DEV11-04): the folder, home-abbreviated. No command takes a path. */
      display: string;
    }
  | { ok: false; reason: 'not_a_directory' | 'multiple' | 'no_path' };

export interface DeliveredEvent<T extends EventTopic = EventTopic> {
  topic: T;
  stream: string;
  seq: number;
  at: string;
  payload: EventPayload<T>;
}

export type SubscribableTopic = EventTopic | BridgeTopic;
export type TopicMessage<T extends SubscribableTopic> = T extends EventTopic ? DeliveredEvent<T> : T extends 'bridge.drop' ? BridgeDrop : BridgeResync;

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
  /** preload → main: the path of a dropped folder (protocol 1.6). */
  dropResolve: 'ayar:drop-resolve',
  /** main → preload: the outcome of a drop, delivered to the page as `bridge.drop`. */
  dropResult: 'ayar:drop-result',
} as const;
