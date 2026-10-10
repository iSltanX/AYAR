// Destructive confirmations are NATIVE macOS alerts, not sheets inside the UI (D-DEV3-15, D-DES3-06). The main
// process shows one (attached to the window) before it issues the confirm token for project.remove, runs.delete,
// tools.remove or data.purge; the renderer never draws them. This file holds their approved content, from Figma
// `Native alert/Destructive confirmation` 116:9399 (frame C-19 114:8568): a message, an informative text that
// states the consequence, «ألغِ» as the default and cancel button (Return and Escape), and a text-only button
// with the explicit verb. Native alert buttons carry no icon, and hasDestructiveAction is never set: macOS would
// draw the button red, and red is reserved for a proven failure (D-16, D-49). The models carry message keys, so
// either process can translate them.
import type { MessageKey, MessageValues, Translate } from '@ayar/i18n';

/** The four kinds of the Figma set, and the gateway command each one guards (D-DEV3-15). */
export const DESTRUCTIVE_COMMANDS = {
  'remove-project': 'project.remove',
  'delete-runs': 'runs.delete',
  'remove-tool': 'tools.remove',
  'purge-data': 'data.purge',
} as const;
export type DestructiveKind = keyof typeof DESTRUCTIVE_COMMANDS;

/** The values each kind's message needs: the project or tool name, or the number of runs. */
export interface DestructiveValues {
  'remove-project': { name: string };
  'delete-runs': { count: number };
  'remove-tool': { name: string };
  'purge-data': Record<string, never>;
}

interface AlertKeys {
  message: MessageKey;
  informative: MessageKey;
  confirm: MessageKey;
}

const KEYS = {
  'remove-project': {
    message: 'sheets.alert.removeProject.message',
    informative: 'sheets.alert.removeProject.informative',
    confirm: 'sheets.alert.removeProject.confirm',
  },
  'delete-runs': {
    message: 'sheets.alert.deleteRuns.message',
    informative: 'sheets.alert.deleteRuns.informative',
    confirm: 'sheets.alert.deleteRuns.confirm',
  },
  'remove-tool': {
    message: 'sheets.alert.removeTool.message',
    informative: 'sheets.alert.removeTool.informative',
    confirm: 'sheets.alert.removeTool.confirm',
  },
  'purge-data': {
    message: 'sheets.alert.purgeData.message',
    informative: 'sheets.alert.purgeData.informative',
    confirm: 'sheets.alert.purgeData.confirm',
  },
} as const satisfies Record<DestructiveKind, AlertKeys>;

export interface NativeAlertModel<K extends DestructiveKind = DestructiveKind> {
  kind: K;
  /** The command the confirmation guards. */
  command: (typeof DESTRUCTIVE_COMMANDS)[K];
  message: { key: MessageKey; values: MessageValues };
  informative: MessageKey;
  /** The explicit verb, e.g. «أزل» / Remove. */
  confirm: MessageKey;
  /** «ألغِ» / Cancel: the default button and the cancel button. */
  cancel: MessageKey;
  defaultButton: 'cancel';
  /** Always false: NSAlert's hasDestructiveAction draws the button red (D-DES3-06). */
  hasDestructiveAction: false;
}

/** The alert model for one destructive command. */
export function destructiveAlert<K extends DestructiveKind>(kind: K, values: DestructiveValues[K]): NativeAlertModel<K> {
  const keys: AlertKeys = KEYS[kind];
  return {
    kind,
    command: DESTRUCTIVE_COMMANDS[kind],
    message: { key: keys.message, values: { ...values } },
    informative: keys.informative,
    confirm: keys.confirm,
    cancel: 'ui.action.cancel',
    defaultButton: 'cancel',
    hasDestructiveAction: false,
  };
}

/** The translated texts of an alert, in the shape of Electron's showMessageBox options (cancel first = default). */
export interface NativeAlertTexts {
  message: string;
  detail: string;
  /** [cancel, confirm]: macOS puts the first button at the trailing edge and makes it the default. */
  buttons: [string, string];
  defaultId: 0;
  cancelId: 0;
}

export function nativeAlertTexts(model: NativeAlertModel, t: Translate): NativeAlertTexts {
  return {
    message: t(model.message.key, model.message.values),
    detail: t(model.informative),
    buttons: [t(model.cancel), t(model.confirm)],
    defaultId: 0,
    cancelId: 0,
  };
}
