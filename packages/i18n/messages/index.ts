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
import reportAr from './report.ar.json' with { type: 'json' };
import reportEn from './report.en.json' with { type: 'json' };
import integrityAr from './integrity.ar.json' with { type: 'json' };
import integrityEn from './integrity.en.json' with { type: 'json' };
import compareAr from './compare.ar.json' with { type: 'json' };
import compareEn from './compare.en.json' with { type: 'json' };
import tasksAr from './tasks.ar.json' with { type: 'json' };
import tasksEn from './tasks.en.json' with { type: 'json' };
import aichecksAr from './aichecks.ar.json' with { type: 'json' };
import aichecksEn from './aichecks.en.json' with { type: 'json' };
import appAr from './app.ar.json' with { type: 'json' };
import appEn from './app.en.json' with { type: 'json' };
import projectlistAr from './projectlist.ar.json' with { type: 'json' };
import projectlistEn from './projectlist.en.json' with { type: 'json' };
import discoveruiAr from './discoverui.ar.json' with { type: 'json' };
import discoveruiEn from './discoverui.en.json' with { type: 'json' };
import approvalAr from './approval.ar.json' with { type: 'json' };
import approvalEn from './approval.en.json' with { type: 'json' };
import overviewAr from './overview.ar.json' with { type: 'json' };
import overviewEn from './overview.en.json' with { type: 'json' };
import scanplanAr from './scanplan.ar.json' with { type: 'json' };
import scanplanEn from './scanplan.en.json' with { type: 'json' };
import monitorAr from './monitor.ar.json' with { type: 'json' };
import monitorEn from './monitor.en.json' with { type: 'json' };
import resultsuiAr from './resultsui.ar.json' with { type: 'json' };
import resultsuiEn from './resultsui.en.json' with { type: 'json' };

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
  // DEV-9: the reports (C-21), the integrity checks (C-22), the comparison (C-22), the cards' lifecycle (C-20), the model checks (C-25).
  report: { ar: reportAr, en: reportEn },
  integrity: { ar: integrityAr, en: integrityEn },
  compare: { ar: compareAr, en: compareEn },
  tasks: { ar: tasksAr, en: tasksEn },
  aichecks: { ar: aichecksAr, en: aichecksEn },
  // DEV-11: the screens of the core journey (one scope per screen, `app` for the frame).
  app: { ar: appAr, en: appEn },
  projectlist: { ar: projectlistAr, en: projectlistEn },
  discoverui: { ar: discoveruiAr, en: discoveruiEn },
  approval: { ar: approvalAr, en: approvalEn },
  overview: { ar: overviewAr, en: overviewEn },
  scanplan: { ar: scanplanAr, en: scanplanEn },
  monitor: { ar: monitorAr, en: monitorEn },
  resultsui: { ar: resultsuiAr, en: resultsuiEn },
} as const;

export type Scope = keyof typeof MESSAGE_FILES;

export const MESSAGES = {
  ar: { ...adapterAr, ...advisorAr, ...alertsAr, ...analyzerAr, ...catalogAr, ...commonAr, ...controlsAr, ...discoveryAr, ...environmentAr, ...errorsAr, ...glossaryAr, ...menuAr, ...planAr, ...probeAr, ...profileAr, ...projectsAr, ...purityAr, ...resultsAr, ...runAr, ...setupAr, ...sheetsAr, ...shellAr, ...statusAr, ...uiAr, ...verdictAr, ...reportAr, ...integrityAr, ...compareAr, ...tasksAr, ...aichecksAr, ...appAr, ...projectlistAr, ...discoveruiAr, ...approvalAr, ...overviewAr, ...scanplanAr, ...monitorAr, ...resultsuiAr },
  en: { ...adapterEn, ...advisorEn, ...alertsEn, ...analyzerEn, ...catalogEn, ...commonEn, ...controlsEn, ...discoveryEn, ...environmentEn, ...errorsEn, ...glossaryEn, ...menuEn, ...planEn, ...probeEn, ...profileEn, ...projectsEn, ...purityEn, ...resultsEn, ...runEn, ...setupEn, ...sheetsEn, ...shellEn, ...statusEn, ...uiEn, ...verdictEn, ...reportEn, ...integrityEn, ...compareEn, ...tasksEn, ...aichecksEn, ...appEn, ...projectlistEn, ...discoveruiEn, ...approvalEn, ...overviewEn, ...scanplanEn, ...monitorEn, ...resultsuiEn },
} as const;
