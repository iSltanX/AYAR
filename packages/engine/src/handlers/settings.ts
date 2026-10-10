// settings.get and settings.set (C-17, implemented in DEV-3).
import type { CommandPayload, SettingEntry } from '@ayar/protocol';
import { readSettings, writeSetting } from '../storage/settings.ts';
import type { CommandHandler } from '../host/dispatcher.ts';

export const settingsGet: CommandHandler = (payload, ctx) => {
  const { keys } = payload as CommandPayload<'settings.get'>;
  return { values: readSettings(ctx.db, keys) };
};

export const settingsSet: CommandHandler = async (payload, ctx) => {
  const entry = payload as SettingEntry;
  writeSetting(ctx.db, entry);
  // C-18 layer 4 and the extra sensitive names take effect at once.
  if (entry.key === 'redaction.userPatterns' || entry.key === 'redaction.sensitiveNames') {
    const s = readSettings(ctx.db, ['redaction.userPatterns', 'redaction.sensitiveNames']);
    ctx.services.redaction.configure(s['redaction.userPatterns'] ?? [], s['redaction.sensitiveNames'] ?? []);
    await ctx.services.environment.reRegister();
    // A new user pattern applies to what is already stored, too (re-review R3).
    if (entry.key === 'redaction.userPatterns') ctx.services.rescrubStored();
  }
  // A smaller retention applies now (C-17 «الاحتفاظ»), not at the next run.
  if (entry.key === 'evidence.retainRuns') await ctx.services.evidence.retainAll();
  return entry;
};
