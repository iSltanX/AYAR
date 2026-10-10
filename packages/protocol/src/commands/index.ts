// The command registry: one file per domain, merged here (docs/waves/README.md 6). Names are those of 6.5.
import { aiCheckCommands } from './ai-checks.ts';
import { dataCommands } from './data.ts';
import { environmentCommands } from './environment.ts';
import { internalCommands } from './internal.ts';
import { profileCommands } from './profile.ts';
import { projectCommands } from './projects.ts';
import { reportCommands } from './reports.ts';
import { resultCommands } from './results.ts';
import { reviewCommands } from './review.ts';
import { runCommands } from './runs.ts';
import { settingsCommands } from './settings.ts';
import { setupCommands } from './setup.ts';
import { systemCommands } from './system.ts';
import { toolCommands } from './tools.ts';
import type { z } from '../zod.ts';
import type { CommandDefinition } from './define.ts';

export const COMMANDS = {
  ...projectCommands,
  ...profileCommands,
  ...environmentCommands,
  ...setupCommands,
  ...runCommands,
  ...resultCommands,
  ...reviewCommands,
  ...reportCommands,
  ...aiCheckCommands,
  ...toolCommands,
  ...settingsCommands,
  ...dataCommands,
  ...systemCommands,
  ...internalCommands,
};

type Registry = typeof COMMANDS;
export type CommandName = keyof Registry;
export type CommandPayload<C extends CommandName> = z.input<Registry[C]['payload']>;
export type CommandResult<C extends CommandName> = z.output<Registry[C]['result']>;

/** Commands the renderer may invoke (audience renderer). */
export type RendererCommandName = {
  [C in CommandName]: Registry[C]['audience'] extends 'renderer' ? C : never;
}[CommandName];

/** What the renderer receives for C: the main process's rendererResult when it has one. */
export type RendererResult<C extends CommandName> = Registry[C] extends { rendererResult: infer S extends z.ZodType }
  ? z.output<S>
  : CommandResult<C>;

export const COMMAND_NAMES = Object.keys(COMMANDS) as [CommandName, ...CommandName[]];
export const RENDERER_COMMAND_NAMES = COMMAND_NAMES.filter((c) => COMMANDS[c].audience === 'renderer') as RendererCommandName[];

export function isCommandName(name: unknown): name is CommandName {
  return typeof name === 'string' && Object.hasOwn(COMMANDS, name);
}

export function isRendererCommand(name: unknown): name is RendererCommandName {
  return isCommandName(name) && COMMANDS[name].audience === 'renderer';
}

export function commandDefinition(name: CommandName): CommandDefinition {
  return COMMANDS[name];
}

export { defineCommand } from './define.ts';
export type { Audience, CommandDefinition, Handler } from './define.ts';
export { ConfirmablePreview, ConfirmablePreviewWithToken } from './previews.ts';
export { DIRECT_CONFIRM_COMMANDS } from './system.ts';
export { SETTINGS, SETTING_KEYS, SettingEntry, SettingKey, SettingValuesSchema, settingDefaults, UserRedactionPattern } from './settings.ts';
export type { SettingValue, SettingValues } from './settings.ts';
export { CopyKind, ReportTarget } from './reports.ts';
export { EvidenceToken } from './results.ts';
export { ToolKey } from './tools.ts';
