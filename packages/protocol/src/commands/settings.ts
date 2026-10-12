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

/**
 * E-17's editor template (DEV-12): words separated by spaces, the first one the program, with {file} somewhere and
 * {line} where the editor takes one. The main process splits it and runs it without a shell; no control character.
 */
export const EditorTemplate = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((s) => s.includes('{file}') && !/[\u0000-\u001f\u007f]/.test(s), 'an editor template names {file} and holds no control character');

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
  // DEV-5 (protocol 1.2): the executor (C-12) and the evidence store (C-17).
  /** FR-26: ask the main process to prevent system sleep while a run is active. */
  'run.preventSleep': { schema: z.boolean(), default: true },
  /** C-12 point 1: how many light and medium checks run at once (heavy and very heavy run alone, G-34). */
  'run.parallel': { schema: z.int().min(1).max(4), default: 3 },
  /** C-12 point 2: snapshot the project around every check to record its side effects (FR-36). */
  'run.sideEffects': { schema: z.boolean(), default: true },
  /** 10.2 rule 5: checks that need the network run only when it is allowed; otherwise «ناقص: يحتاج شبكة». */
  'run.allowNetwork': { schema: z.boolean(), default: false },
  /** C-17 «الاحتفاظ»: runs kept per project besides the pinned ones and what rounds need (E-19 calibrates it). */
  'evidence.retainRuns': { schema: z.int().min(1).max(500), default: 20 },
  /** C-17 «خصوصية»: keep the text of project files in the content store for diffs; off keeps hashes only. */
  'evidence.storeContent': { schema: z.boolean(), default: true },
  // DEV-12 (protocol 1.7): the settings screen (13.3, screen 21).
  /** E-17 «افتح عند السطر»: a program and its arguments with {file} and {line}, run without a shell; null: `open -t`. */
  'editor.template': { schema: EditorTemplate.nullable(), default: null },
  /** 13.3 «الإشعارات»: a system notification when a run finishes while the window is not in front. */
  'run.notify': { schema: z.boolean(), default: true },
  /** 11.4 rule 4 («حد النطاق الضيق»): below this many criteria, the karat carries «نطاق ضيق». */
  'purity.narrowThreshold': { schema: z.int().min(1).max(10), default: 3 },
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
  'run.preventSleep': SETTINGS['run.preventSleep'].schema,
  'run.parallel': SETTINGS['run.parallel'].schema,
  'run.sideEffects': SETTINGS['run.sideEffects'].schema,
  'run.allowNetwork': SETTINGS['run.allowNetwork'].schema,
  'evidence.retainRuns': SETTINGS['evidence.retainRuns'].schema,
  'evidence.storeContent': SETTINGS['evidence.storeContent'].schema,
  'editor.template': SETTINGS['editor.template'].schema,
  'run.notify': SETTINGS['run.notify'].schema,
  'purity.narrowThreshold': SETTINGS['purity.narrowThreshold'].schema,
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
  z.strictObject({ key: z.literal('run.preventSleep'), value: SETTINGS['run.preventSleep'].schema }),
  z.strictObject({ key: z.literal('run.parallel'), value: SETTINGS['run.parallel'].schema }),
  z.strictObject({ key: z.literal('run.sideEffects'), value: SETTINGS['run.sideEffects'].schema }),
  z.strictObject({ key: z.literal('run.allowNetwork'), value: SETTINGS['run.allowNetwork'].schema }),
  z.strictObject({ key: z.literal('evidence.retainRuns'), value: SETTINGS['evidence.retainRuns'].schema }),
  z.strictObject({ key: z.literal('evidence.storeContent'), value: SETTINGS['evidence.storeContent'].schema }),
  z.strictObject({ key: z.literal('editor.template'), value: SETTINGS['editor.template'].schema }),
  z.strictObject({ key: z.literal('run.notify'), value: SETTINGS['run.notify'].schema }),
  z.strictObject({ key: z.literal('purity.narrowThreshold'), value: SETTINGS['purity.narrowThreshold'].schema }),
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
    'run.preventSleep': SETTINGS['run.preventSleep'].default,
    'run.parallel': SETTINGS['run.parallel'].default,
    'run.sideEffects': SETTINGS['run.sideEffects'].default,
    'run.allowNetwork': SETTINGS['run.allowNetwork'].default,
    'evidence.retainRuns': SETTINGS['evidence.retainRuns'].default,
    'evidence.storeContent': SETTINGS['evidence.storeContent'].default,
    'editor.template': SETTINGS['editor.template'].default,
    'run.notify': SETTINGS['run.notify'].default,
    'purity.narrowThreshold': SETTINGS['purity.narrowThreshold'].default,
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
