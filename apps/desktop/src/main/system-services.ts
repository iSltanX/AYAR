// The system interactions the UI may ask for (C-01): folder and file dialogs and the clipboard, as an
// interface the gateway calls. No screens here: these are macOS's own dialogs.
import { clipboard, dialog, type BrowserWindow } from 'electron';
import { lstat, realpath } from 'node:fs/promises';
import type { SystemServices } from './gateway.ts';

export function electronSystemServices(parent: () => BrowserWindow | null): SystemServices {
  const owner = () => parent() ?? undefined;
  return {
    async pickFolder() {
      const opts = { properties: ['openDirectory' as const, 'createDirectory' as const] };
      const w = owner();
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    },
    async pickDestination(_purpose, suggestedName) {
      const opts = { defaultPath: suggestedName, properties: ['createDirectory' as const, 'showOverwriteConfirmation' as const] };
      const w = owner();
      const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
    async pickSource() {
      const opts = { properties: ['openFile' as const] };
      const w = owner();
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    },
    async writeClipboard(text) {
      await clipboard.writeText(text); // asynchronous since Electron 44
    },
    async checkFolder(path) {
      try {
        const st = await lstat(path);
        if (st.isSymbolicLink() || !st.isDirectory()) return null;
        return await realpath(path);
      } catch {
        return null;
      }
    },
  };
}
