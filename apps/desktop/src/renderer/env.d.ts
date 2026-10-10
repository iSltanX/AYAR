import type { AyarBridge } from '@ayar/protocol';

declare global {
  interface Window {
    /** Exposed by the preload (C-02): invoke and subscribe, nothing else. */
    readonly ayar: AyarBridge;
  }
}

export {};
