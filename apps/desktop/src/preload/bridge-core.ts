// The bridge (C-02), without electron so it can be tested: window.ayar gets invoke and subscribe only.
// Unknown commands are refused here, before any IPC. Events arrive on a read-only port; a gap in a stream's
// numbering, a new engine stream, or a replaced port tells the UI to resync.
import {
  BRIDGE_TOPICS,
  ProtectedLocation as LocationSchema,
  type BridgeDrop,
  type ProtectedLocation,
  isEventTopic,
  isRendererCommand,
  parseCommandPayload,
  protocolError,
  type AyarBridge,
  type BridgeResync,
  type DeliveredEvent,
  type InvokeResult,
  type ResyncReason,
  type SubscribableTopic,
} from '@ayar/protocol';

/** The events port, reduced to what the bridge needs (a DOM MessagePort in the preload). */
export interface PortLike {
  listen(handler: (data: unknown) => void): void;
  close(): void;
}

export interface BridgeDeps {
  invoke(request: { command: string; payload: unknown }): Promise<InvokeResult<unknown>>;
  /** Where handler exceptions go (they must not break event delivery). */
  reportError(error: unknown): void;
}

export interface BridgeCore {
  api: AyarBridge;
  acceptPort(port: PortLike): void;
  /** The main process's answer to a drop (protocol 1.6), delivered to the page as `bridge.drop`. */
  acceptDrop(result: unknown): void;
}

const LOCATIONS = LocationSchema.options;

/** Only the two shapes of BridgeDrop pass, with a selection token of its exact form. */
function parseDrop(raw: unknown): BridgeDrop | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.ok === true && typeof r.selectionToken === 'string' && /^sel_[A-Za-z0-9_-]{43}$/.test(r.selectionToken)) {
    const location = typeof r.location === 'string' && (LOCATIONS as readonly string[]).includes(r.location) ? (r.location as ProtectedLocation) : null;
    const display = typeof r.display === 'string' ? r.display.slice(0, 4096) : '';
    return { ok: true, selectionToken: r.selectionToken, location, display };
  }
  if (r.ok === false && (r.reason === 'not_a_directory' || r.reason === 'multiple' || r.reason === 'no_path')) return { ok: false, reason: r.reason };
  return null;
}

const isBridgeTopic = (t: unknown): t is (typeof BRIDGE_TOPICS)[number] => (BRIDGE_TOPICS as readonly unknown[]).includes(t);

export function createBridgeCore(deps: BridgeDeps): BridgeCore {
  const handlers = new Map<string, Set<(m: unknown) => void>>();
  const lastSeq = new Map<string, number>();
  let engineStream: string | null = null;
  let port: PortLike | null = null;
  /** A drop answered before the page subscribed (a folder dropped on the Dock icon at launch) waits for it. */
  let pendingDrop: BridgeDrop | null = null;

  const dispatch = (topic: string, message: unknown) => {
    for (const h of handlers.get(topic) ?? []) {
      try {
        h(message);
      } catch (e) {
        deps.reportError(e);
      }
    }
  };
  const resync = (reason: ResyncReason) => dispatch('bridge.resync', { reason } satisfies BridgeResync);

  const onEvent = (data: unknown) => {
    if (typeof data !== 'object' || data === null) return;
    const e = data as Partial<DeliveredEvent>;
    if (!isEventTopic(e.topic) || typeof e.stream !== 'string' || typeof e.seq !== 'number' || typeof e.at !== 'string') return;
    if (e.stream.startsWith('engine-') && e.stream !== engineStream) {
      if (engineStream !== null) resync('stream_changed');
      engineStream = e.stream;
    }
    const last = lastSeq.get(e.stream);
    if (last !== undefined && e.seq !== last + 1) resync('sequence_gap');
    lastSeq.set(e.stream, e.seq);
    dispatch(e.topic, { topic: e.topic, stream: e.stream, seq: e.seq, at: e.at, payload: e.payload });
  };

  const api: AyarBridge = {
    invoke(command, payload) {
      if (!isRendererCommand(command)) return Promise.resolve({ ok: false, error: protocolError('unknown_command', { command: String(command).slice(0, 64) }) });
      const checked = parseCommandPayload(command, payload);
      if (!checked.ok) return Promise.resolve({ ok: false, error: checked.error });
      return deps.invoke({ command, payload: checked.payload }) as never;
    },
    subscribe(topic: SubscribableTopic, handler: (m: never) => void) {
      if (!isEventTopic(topic) && !isBridgeTopic(topic)) throw new TypeError(`unknown topic: ${String(topic)}`);
      if (typeof handler !== 'function') throw new TypeError('handler must be a function');
      const set = handlers.get(topic) ?? new Set();
      const h = handler as (m: unknown) => void;
      set.add(h);
      handlers.set(topic, set);
      if (topic === 'bridge.drop' && pendingDrop) {
        const d = pendingDrop;
        pendingDrop = null;
        queueMicrotask(() => dispatch('bridge.drop', d));
      }
      return () => {
        set.delete(h);
      };
    },
  };

  return {
    api,
    acceptDrop(raw) {
      const drop = parseDrop(raw);
      if (!drop) return;
      if (handlers.get('bridge.drop')?.size) dispatch('bridge.drop', drop);
      else pendingDrop = drop;
    },
    acceptPort(next) {
      const replaced = port !== null;
      port?.close();
      port = next;
      lastSeq.clear();
      next.listen(onEvent);
      if (replaced) resync('port_replaced');
    },
  };
}
