// The settings table (14.1): one JSON value per key, validated by the protocol's settings registry.
import { SETTINGS, SETTING_KEYS, settingDefaults, type SettingEntry, type SettingKey, type SettingValues } from '@ayar/protocol';
import type { Db } from './db.ts';

export function readSettings(db: Db, keys: readonly SettingKey[] = SETTING_KEYS): Partial<SettingValues> {
  const defaults = settingDefaults();
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const key of keys) {
    const row = db.get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', key);
    const parsed = row ? SETTINGS[key].schema.safeParse(JSON.parse(row.value_json)) : null;
    // A stored value that no longer validates (a removed option) falls back to the default.
    out[key] = parsed?.success ? parsed.data : defaults[key];
  }
  return out as Partial<SettingValues>;
}

export function writeSetting(db: Db, entry: SettingEntry): void {
  db.transaction(() => {
    db.run(
      'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json',
      entry.key,
      JSON.stringify(entry.value),
    );
  });
}
