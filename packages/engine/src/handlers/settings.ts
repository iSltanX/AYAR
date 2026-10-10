// settings.get and settings.set (C-17, implemented in DEV-3).
import type { CommandPayload, SettingEntry } from '@ayar/protocol';
import { readSettings, writeSetting } from '../storage/settings.ts';
import type { CommandHandler } from '../host/dispatcher.ts';

export const settingsGet: CommandHandler = (payload, ctx) => {
  const { keys } = payload as CommandPayload<'settings.get'>;
  return { values: readSettings(ctx.db, keys) };
};

export const settingsSet: CommandHandler = (payload, ctx) => {
  const entry = payload as SettingEntry;
  writeSetting(ctx.db, entry);
  return entry;
};
