// Message index (C-24): one file per scope and language, `messages/<scope>.<lang>.json`, merged here so that
// parallel phases only meet on one import line. Keys are prefixed by their scope.
import adapterAr from './adapter.ar.json' with { type: 'json' };
import adapterEn from './adapter.en.json' with { type: 'json' };
import advisorAr from './advisor.ar.json' with { type: 'json' };
import advisorEn from './advisor.en.json' with { type: 'json' };
import alertsAr from './alerts.ar.json' with { type: 'json' };
import analyzerAr from './analyzer.ar.json' with { type: 'json' };
import analyzerEn from './analyzer.en.json' with { type: 'json' };
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
import probeAr from './probe.ar.json' with { type: 'json' };
import probeEn from './probe.en.json' with { type: 'json' };
import planEn from './plan.en.json' with { type: 'json' };
import profileAr from './profile.ar.json' with { type: 'json' };
import profileEn from './profile.en.json' with { type: 'json' };
import projectsAr from './projects.ar.json' with { type: 'json' };
import purityAr from './purity.ar.json' with { type: 'json' };
import purityEn from './purity.en.json' with { type: 'json' };
import projectsEn from './projects.en.json' with { type: 'json' };
import controlsAr from './controls.ar.json' with { type: 'json' };
import controlsEn from './controls.en.json' with { type: 'json' };
import resultsAr from './results.ar.json' with { type: 'json' };
import resultsEn from './results.en.json' with { type: 'json' };
import sheetsAr from './sheets.ar.json' with { type: 'json' };
import sheetsEn from './sheets.en.json' with { type: 'json' };
import shellAr from './shell.ar.json' with { type: 'json' };
import shellEn from './shell.en.json' with { type: 'json' };
import statusAr from './status.ar.json' with { type: 'json' };
import statusEn from './status.en.json' with { type: 'json' };
import runAr from './run.ar.json' with { type: 'json' };
import runEn from './run.en.json' with { type: 'json' };
import setupAr from './setup.ar.json' with { type: 'json' };
import setupEn from './setup.en.json' with { type: 'json' };
import uiAr from './ui.ar.json' with { type: 'json' };
import verdictAr from './verdict.ar.json' with { type: 'json' };
import verdictEn from './verdict.en.json' with { type: 'json' };
import uiEn from './ui.en.json' with { type: 'json' };

export const MESSAGE_FILES = {
  adapter: { ar: adapterAr, en: adapterEn },
  advisor: { ar: advisorAr, en: advisorEn },
  alerts: { ar: alertsAr, en: alertsEn },
  analyzer: { ar: analyzerAr, en: analyzerEn },
  catalog: { ar: catalogAr, en: catalogEn },
  common: { ar: commonAr, en: commonEn },
  discovery: { ar: discoveryAr, en: discoveryEn },
  environment: { ar: environmentAr, en: environmentEn },
  errors: { ar: errorsAr, en: errorsEn },
  glossary: { ar: glossaryAr, en: glossaryEn },
  menu: { ar: menuAr, en: menuEn },
  plan: { ar: planAr, en: planEn },
  probe: { ar: probeAr, en: probeEn },
  profile: { ar: profileAr, en: profileEn },
  projects: { ar: projectsAr, en: projectsEn },
  purity: { ar: purityAr, en: purityEn },
  run: { ar: runAr, en: runEn },
  setup: { ar: setupAr, en: setupEn },
  ui: { ar: uiAr, en: uiEn },
  verdict: { ar: verdictAr, en: verdictEn },
  controls: { ar: controlsAr, en: controlsEn },
  results: { ar: resultsAr, en: resultsEn },
  sheets: { ar: sheetsAr, en: sheetsEn },
  shell: { ar: shellAr, en: shellEn },
  status: { ar: statusAr, en: statusEn },
} as const;

export type Scope = keyof typeof MESSAGE_FILES;

export const MESSAGES = {
  ar: { ...adapterAr, ...advisorAr, ...alertsAr, ...analyzerAr, ...catalogAr, ...commonAr, ...controlsAr, ...discoveryAr, ...environmentAr, ...errorsAr, ...glossaryAr, ...menuAr, ...planAr, ...probeAr, ...profileAr, ...projectsAr, ...purityAr, ...resultsAr, ...runAr, ...setupAr, ...sheetsAr, ...shellAr, ...statusAr, ...uiAr, ...verdictAr },
  en: { ...adapterEn, ...advisorEn, ...alertsEn, ...analyzerEn, ...catalogEn, ...commonEn, ...controlsEn, ...discoveryEn, ...environmentEn, ...errorsEn, ...glossaryEn, ...menuEn, ...planEn, ...probeEn, ...profileEn, ...projectsEn, ...purityEn, ...resultsEn, ...runEn, ...setupEn, ...sheetsEn, ...shellEn, ...statusEn, ...uiEn, ...verdictEn },
} as const;
