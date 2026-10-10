// Settings (G-19 owner: C-17, the settings table of 14.1). Implemented in DEV-3. Each later phase adds its
// keys here with a minor version, and E-18/E-19 calibrate the defaults of their keys.
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

export const SETTINGS = {
  'ui.language': { schema: z.enum(['system', 'ar', 'en']), default: 'system' },
  'ui.theme': { schema: z.enum(['system', 'light', 'dark']), default: 'system' },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export type SettingValues = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]];
export const SettingKey = z.enum(SETTING_KEYS);

export const SettingValuesSchema = z.strictObject({
  'ui.language': SETTINGS['ui.language'].schema,
  'ui.theme': SETTINGS['ui.theme'].schema,
});

export const SettingEntry = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('ui.language'), value: SETTINGS['ui.language'].schema }),
  z.strictObject({ key: z.literal('ui.theme'), value: SETTINGS['ui.theme'].schema }),
]);
export type SettingEntry = z.infer<typeof SettingEntry>;

export function settingDefaults(): SettingValues {
  return { 'ui.language': SETTINGS['ui.language'].default, 'ui.theme': SETTINGS['ui.theme'].default };
}

const base = { owner: 'C-17', handler: 'engine', audience: 'renderer', since: '1.0', implementedIn: 'DEV-3' } as const;

export const settingsCommands = {
  'settings.get': defineCommand({
    ...base,
    payload: z.strictObject({ keys: z.array(SettingKey).min(1).optional() }),
    result: z.strictObject({ values: SettingValuesSchema.partial() }),
  }),
  'settings.set': defineCommand({ ...base, payload: SettingEntry, result: SettingEntry }),
};
