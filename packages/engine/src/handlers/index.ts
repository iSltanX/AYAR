// The engine's handler table. Each phase adds the handlers of its commands here, one line per command.
import type { HandlerTable } from '../host/dispatcher.ts';
import { settingsGet, settingsSet } from './settings.ts';

export const HANDLERS: HandlerTable = {
  'settings.get': settingsGet,
  'settings.set': settingsSet,
};
