// The renderer's read-only event channel (6.3, C-02): one MessagePort per window. The main process writes
// validated events into it and never reads from it. When the engine reconnects, every window gets a new port,
// and the preload tells the UI to resync.
import { MessageChannelMain, type MessagePortMain, type WebContents } from 'electron';
import { IPC, type DeliveredEvent } from '@ayar/protocol';

export class EventPorts {
  readonly #ports = new Map<number, { contents: WebContents; port: MessagePortMain }>();

  /** Sends a fresh port to this window, closing the one it had. */
  attach(contents: WebContents): void {
    this.#ports.get(contents.id)?.port.close();
    const { port1, port2 } = new MessageChannelMain();
    this.#ports.set(contents.id, { contents, port: port1 });
    contents.once('destroyed', () => {
      if (this.#ports.get(contents.id)?.port === port1) this.#ports.delete(contents.id);
      port1.close();
    });
    contents.postMessage(IPC.eventsPort, null, [port2]);
  }

  /** New ports for every window (after an engine restart). */
  renewAll(): void {
    for (const { contents } of [...this.#ports.values()]) if (!contents.isDestroyed()) this.attach(contents);
  }

  broadcast(event: DeliveredEvent): void {
    for (const { port } of this.#ports.values()) port.postMessage(event);
  }
}
