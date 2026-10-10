// Settings (G-19 owner: C-17, the settings table of 14.1). Implemented in DEV-3; DEV-4 adds the environment,
// redaction and discovery keys (protocol 1.1). Each later phase adds its
// keys here with a minor version, and E-18/E-19 calibrate the defaults of their keys.
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

/** A user redaction pattern (C-18 layer 4): it must compile, and stays short. */
export const UserRedactionPattern = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    pattern: z.string().min(1).max(512),
    flags: z.string().regex(/^[imsu]*$/).optional(),
  })
  // Compiled exactly as C-18 compiles it: with its own flags, plus g (a `u` pattern has stricter escapes).
  .refine((u) => {
    try {
      new RegExp(u.pattern, `${u.flags ?? ''}g`);
      return true;
    } catch {
      return false;
    }
  }, 'pattern does not compile');
export type UserRedactionPattern = z.infer<typeof UserRedactionPattern>;

const ShellPath = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => p.startsWith('/') && !p.includes('\0'), 'not an absolute path');

export const SETTINGS = {
  'ui.language': { schema: z.enum(['system', 'ar', 'en']), default: 'system' },
  'ui.theme': { schema: z.enum(['system', 'light', 'dark']), default: 'system' },
  // DEV-4: C-07 (FR-14, FR-54: «قراءة البيئة»), C-18 (layer 4), C-06 (the limits come from the settings).
  'environment.shell': { schema: ShellPath.nullable(), default: null },
  'environment.timeoutSeconds': { schema: z.int().min(1).max(120), default: 10 },
  'redaction.userPatterns': { schema: z.array(UserRedactionPattern).max(50), default: [] as UserRedactionPattern[] },
  /** Extra sensitive variable names (C-18 layer 1 «قابلة للتوسيع»): exact names, or a prefix ending in `*`. */
  'redaction.sensitiveNames': { schema: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*\*?$/)).max(100), default: [] as string[] },
  'discovery.maxDepth': { schema: z.int().min(1).max(64), default: 12 },
  'discovery.maxEntries': { schema: z.int().min(1000).max(1_000_000), default: 100_000 },
  'discovery.maxConfigBytes': { schema: z.int().min(1024).max(64 * 1024 * 1024), default: 2 * 1024 * 1024 },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export type SettingValues = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]];
export const SettingKey = z.enum(SETTING_KEYS);

export const SettingValuesSchema = z.strictObject({
  'ui.language': SETTINGS['ui.language'].schema,
  'ui.theme': SETTINGS['ui.theme'].schema,
  'environment.shell': SETTINGS['environment.shell'].schema,
  'environment.timeoutSeconds': SETTINGS['environment.timeoutSeconds'].schema,
  'redaction.userPatterns': SETTINGS['redaction.userPatterns'].schema,
  'redaction.sensitiveNames': SETTINGS['redaction.sensitiveNames'].schema,
  'discovery.maxDepth': SETTINGS['discovery.maxDepth'].schema,
  'discovery.maxEntries': SETTINGS['discovery.maxEntries'].schema,
  'discovery.maxConfigBytes': SETTINGS['discovery.maxConfigBytes'].schema,
});

export const SettingEntry = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('ui.language'), value: SETTINGS['ui.language'].schema }),
  z.strictObject({ key: z.literal('ui.theme'), value: SETTINGS['ui.theme'].schema }),
  z.strictObject({ key: z.literal('environment.shell'), value: SETTINGS['environment.shell'].schema }),
  z.strictObject({ key: z.literal('environment.timeoutSeconds'), value: SETTINGS['environment.timeoutSeconds'].schema }),
  z.strictObject({ key: z.literal('redaction.userPatterns'), value: SETTINGS['redaction.userPatterns'].schema }),
  z.strictObject({ key: z.literal('redaction.sensitiveNames'), value: SETTINGS['redaction.sensitiveNames'].schema }),
  z.strictObject({ key: z.literal('discovery.maxDepth'), value: SETTINGS['discovery.maxDepth'].schema }),
  z.strictObject({ key: z.literal('discovery.maxEntries'), value: SETTINGS['discovery.maxEntries'].schema }),
  z.strictObject({ key: z.literal('discovery.maxConfigBytes'), value: SETTINGS['discovery.maxConfigBytes'].schema }),
]);
export type SettingEntry = z.infer<typeof SettingEntry>;

export function settingDefaults(): SettingValues {
  return {
    'ui.language': SETTINGS['ui.language'].default,
    'ui.theme': SETTINGS['ui.theme'].default,
    'environment.shell': SETTINGS['environment.shell'].default,
    'environment.timeoutSeconds': SETTINGS['environment.timeoutSeconds'].default,
    'redaction.userPatterns': [...SETTINGS['redaction.userPatterns'].default],
    'redaction.sensitiveNames': [...SETTINGS['redaction.sensitiveNames'].default],
    'discovery.maxDepth': SETTINGS['discovery.maxDepth'].default,
    'discovery.maxEntries': SETTINGS['discovery.maxEntries'].default,
    'discovery.maxConfigBytes': SETTINGS['discovery.maxConfigBytes'].default,
  };
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
