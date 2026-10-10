// Message index (C-24): one file per scope and language, `messages/<scope>.<lang>.json`, merged here so that
// parallel phases only meet on one import line. Keys are prefixed by their scope.
import alertsAr from './alerts.ar.json' with { type: 'json' };
import alertsEn from './alerts.en.json' with { type: 'json' };
import catalogAr from './catalog.ar.json' with { type: 'json' };
import catalogEn from './catalog.en.json' with { type: 'json' };
import commonAr from './common.ar.json' with { type: 'json' };
import commonEn from './common.en.json' with { type: 'json' };
import discoveryAr from './discovery.ar.json' with { type: 'json' };
import discoveryEn from './discovery.en.json' with { type: 'json' };
import environmentAr from './environment.ar.json' with { type: 'json' };
import environmentEn from './environment.en.json' with { type: 'json' };
import errorsAr from './errors.ar.json' with { type: 'json' };
import errorsEn from './errors.en.json' with { type: 'json' };
import glossaryAr from './glossary.ar.json' with { type: 'json' };
import glossaryEn from './glossary.en.json' with { type: 'json' };
import menuAr from './menu.ar.json' with { type: 'json' };
import menuEn from './menu.en.json' with { type: 'json' };
import planAr from './plan.ar.json' with { type: 'json' };
import planEn from './plan.en.json' with { type: 'json' };
import profileAr from './profile.ar.json' with { type: 'json' };
import profileEn from './profile.en.json' with { type: 'json' };
import projectsAr from './projects.ar.json' with { type: 'json' };
import projectsEn from './projects.en.json' with { type: 'json' };
import runAr from './run.ar.json' with { type: 'json' };
import runEn from './run.en.json' with { type: 'json' };
import setupAr from './setup.ar.json' with { type: 'json' };
import setupEn from './setup.en.json' with { type: 'json' };
import uiAr from './ui.ar.json' with { type: 'json' };
import uiEn from './ui.en.json' with { type: 'json' };

export const MESSAGE_FILES = {
  alerts: { ar: alertsAr, en: alertsEn },
  catalog: { ar: catalogAr, en: catalogEn },
  common: { ar: commonAr, en: commonEn },
  discovery: { ar: discoveryAr, en: discoveryEn },
  environment: { ar: environmentAr, en: environmentEn },
  errors: { ar: errorsAr, en: errorsEn },
  glossary: { ar: glossaryAr, en: glossaryEn },
  menu: { ar: menuAr, en: menuEn },
  plan: { ar: planAr, en: planEn },
  profile: { ar: profileAr, en: profileEn },
  projects: { ar: projectsAr, en: projectsEn },
  run: { ar: runAr, en: runEn },
  setup: { ar: setupAr, en: setupEn },
  ui: { ar: uiAr, en: uiEn },
} as const;

export type Scope = keyof typeof MESSAGE_FILES;

export const MESSAGES = {
  ar: { ...alertsAr, ...catalogAr, ...commonAr, ...discoveryAr, ...environmentAr, ...errorsAr, ...glossaryAr, ...menuAr, ...planAr, ...profileAr, ...projectsAr, ...runAr, ...setupAr, ...uiAr },
  en: { ...alertsEn, ...catalogEn, ...commonEn, ...discoveryEn, ...environmentEn, ...errorsEn, ...glossaryEn, ...menuEn, ...planEn, ...profileEn, ...projectsEn, ...runEn, ...setupEn, ...uiEn },
} as const;
