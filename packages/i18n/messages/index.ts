// Message index (C-24): one file per scope and language, `messages/<scope>.<lang>.json`, merged here so that
// parallel phases only meet on one import line. Keys are prefixed by their scope.
import commonAr from './common.ar.json' with { type: 'json' };
import commonEn from './common.en.json' with { type: 'json' };
import errorsAr from './errors.ar.json' with { type: 'json' };
import errorsEn from './errors.en.json' with { type: 'json' };
import glossaryAr from './glossary.ar.json' with { type: 'json' };
import glossaryEn from './glossary.en.json' with { type: 'json' };
import menuAr from './menu.ar.json' with { type: 'json' };
import menuEn from './menu.en.json' with { type: 'json' };
import uiAr from './ui.ar.json' with { type: 'json' };
import uiEn from './ui.en.json' with { type: 'json' };

export const MESSAGE_FILES = {
  common: { ar: commonAr, en: commonEn },
  errors: { ar: errorsAr, en: errorsEn },
  glossary: { ar: glossaryAr, en: glossaryEn },
  menu: { ar: menuAr, en: menuEn },
  ui: { ar: uiAr, en: uiEn },
} as const;

export type Scope = keyof typeof MESSAGE_FILES;

export const MESSAGES = {
  ar: { ...commonAr, ...errorsAr, ...glossaryAr, ...menuAr, ...uiAr },
  en: { ...commonEn, ...errorsEn, ...glossaryEn, ...menuEn, ...uiEn },
} as const;
