// The system interactions the UI may ask for (C-01): folder and file dialogs and the clipboard, as an
// interface the gateway calls. No screens here: these are macOS's own dialogs.
import { clipboard, dialog, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions, type MessageBoxOptions } from 'electron';
import { execFile } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { promisify } from 'node:util';
import type { NativeMenuEntry } from '@ayar/protocol';
import type { SystemServices } from './gateway.ts';
import { controlsFromAppleLanguages } from './window-controls.ts';

const run = promisify(execFile);

let controls: Promise<'left' | 'right'> | null = null;

function menuTemplate(entries: readonly NativeMenuEntry[], choose: (id: string) => void): MenuItemConstructorOptions[] {
  return entries.map((e): MenuItemConstructorOptions => {
    if (e.kind === 'separator') return { type: 'separator' };
    if (e.kind === 'header') return { label: e.label, enabled: false };
    return { label: e.label, enabled: e.enabled, ...(e.accelerator ? { accelerator: e.accelerator, registerAccelerator: false } : {}), click: () => choose(e.id) };
  });
}

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
    async confirmDestructive(alert) {
      // A sheet on the window (D-DEV3-15): «ألغِ» is the default and the cancel; no red button (D-DES3-06).
      const opts: MessageBoxOptions = { type: 'warning', message: alert.title, detail: alert.detail, buttons: [alert.cancel, alert.confirm], defaultId: 0, cancelId: 0, noLink: true };
      const w = owner();
      const r = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts);
      return r.response === 1;
    },
    windowControls() {
      controls ??= run('/usr/bin/defaults', ['read', '-g', 'AppleLanguages'], { timeout: 3000 })
        .then((r) => controlsFromAppleLanguages(r.stdout))
        .catch(() => 'left' as const);
      return controls;
    },
    reveal(path) {
      shell.showItemInFolder(path);
      return Promise.resolve();
    },
    async fileInside(root, relative) {
      try {
        const realRoot = await realpath(root);
        const file = await realpath(join(realRoot, relative));
        if (!file.startsWith(realRoot + sep)) return null;
        return (await stat(file)).isFile() ? file : null;
      } catch {
        return null;
      }
    },
    async openInEditor(path) {
      await run('/usr/bin/open', ['-t', path], { timeout: 10_000 });
    },
    popupMenu(entries, at) {
      return new Promise((resolve) => {
        let chosen: string | null = null;
        const menu = Menu.buildFromTemplate(menuTemplate(entries, (id) => (chosen = id)));
        const w = owner();
        menu.popup({ ...(w ? { window: w } : {}), ...(at ? { x: at.x, y: at.y } : {}), callback: () => resolve(chosen) });
      });
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
