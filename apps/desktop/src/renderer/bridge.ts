// The renderer's typed bridge client (C-02, C-03): a thin layer over window.ayar that turns a coded failure
// into a thrown AyarError. Types only from @ayar/protocol: no zod or other runtime enters the renderer here.
import type { AyarBridge, CommandPayload, ProtocolError, RendererCommandName, RendererResult, SubscribableTopic, TopicMessage } from '@ayar/protocol';

export class AyarError extends Error {
  readonly error: ProtocolError;
  constructor(error: ProtocolError) {
    super(error.code);
    this.name = 'AyarError';
    this.error = error;
  }
}

export interface BridgeClient {
  invoke<C extends RendererCommandName>(command: C, payload: CommandPayload<C>): Promise<RendererResult<C>>;
  subscribe<T extends SubscribableTopic>(topic: T, handler: (message: TopicMessage<T>) => void): () => void;
}

export function createBridgeClient(raw: AyarBridge): BridgeClient {
  return {
    async invoke(command, payload) {
      const r = await raw.invoke(command, payload);
      if (!r.ok) throw new AyarError(r.error);
      return r.result;
    },
    subscribe: (topic, handler) => raw.subscribe(topic, handler),
  };
}
