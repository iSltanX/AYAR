// The engine's handler table. Each phase adds the handlers of its commands here, one line per command.
import type { HandlerTable } from '../host/dispatcher.ts';
import { advisorSuggest, taskCreate, tasksList } from './advisor.ts';
import { dataPurge } from './data.ts';
import { environmentResolve } from './environment.ts';
import { evidenceToken, internalEvidencePath } from './evidence.ts';
import { profileApprove, profileExport, profileExportPreview, profileGet, profileImport, profileImportFromRepo, profilePropose, profileUpdate, profileVersionsList } from './profile.ts';
import { projectAdd, projectCancelDiscovery, projectConfirm, projectGet, projectList, projectRelocate, projectRemove, projectRename, projectRescan, projectSetTrust } from './projects.ts';
import { checkReport, checkTail, groupsDelete, groupsList, groupsSave, internalPrepareQuit, runCancel, runContinueRound, runGet, runPlan, runRerun, runsDelete, runsKeep, runsList, runStart } from './runs.ts';
import { findingGet, resultsQuery } from './results.ts';
import { baselineApprove, baselinesList, capturesList } from './probe.ts';
import { settingsGet, settingsSet } from './settings.ts';
import { compareRuns, internalClipboardText, internalRecordCopy, reportBuild, reportExport, reportsCopies, reportsList, tasksVerify, taskUpdate } from './reports.ts';
import { reviewRecord, reviewsList } from './reviews.ts';
import { aiChecksGenerate, aiChecksGet, aiChecksImportResults, aiChecksList, aiChecksNeeds, aiChecksProvideInput, aiChecksSave } from './ai-checks.ts';
import { readinessEvaluate, setupExecute, setupPreview, toolsInstall, toolsList, toolsPreview, toolsRemove, toolsVerify } from './setup.ts';

export const HANDLERS: HandlerTable = {
  'settings.get': settingsGet,
  'settings.set': settingsSet,
  'project.add': projectAdd,
  'project.confirm': projectConfirm,
  'project.list': projectList,
  'project.get': projectGet,
  'project.rescan': projectRescan,
  'project.cancelDiscovery': projectCancelDiscovery,
  'project.relocate': projectRelocate,
  'project.remove': projectRemove,
  'project.setTrust': projectSetTrust,
  'project.rename': projectRename,
  'profile.get': profileGet,
  'profile.propose': profilePropose,
  'profile.update': profileUpdate,
  'profile.approve': profileApprove,
  'profile.exportPreview': profileExportPreview,
  'profile.export': profileExport,
  'profile.import': profileImport,
  'profile.importFromRepo': profileImportFromRepo,
  'environment.resolve': environmentResolve,
  'advisor.suggest': advisorSuggest,
  'task.create': taskCreate,
  'tasks.list': tasksList,
  // DEV-5
  'readiness.evaluate': readinessEvaluate,
  'setup.preview': setupPreview,
  'setup.execute': setupExecute,
  'tools.list': toolsList,
  'tools.preview': toolsPreview,
  'tools.install': toolsInstall,
  'tools.verify': toolsVerify,
  'tools.remove': toolsRemove,
  'run.plan': runPlan,
  'run.start': runStart,
  'run.cancel': runCancel,
  'run.rerun': runRerun,
  'run.continueRound': runContinueRound,
  'runs.list': runsList,
  'run.get': runGet,
  'check.tail': checkTail,
  // DEV-12 (protocol 1.7)
  'check.report': checkReport,
  'profile.versions': profileVersionsList,
  'data.purge': dataPurge,
  'reports.copies': reportsCopies,
  'runs.keep': runsKeep,
  'runs.delete': runsDelete,
  'groups.save': groupsSave,
  'groups.list': groupsList,
  'groups.delete': groupsDelete,
  'evidence.token': evidenceToken,
  'internal.evidencePath': internalEvidencePath,
  'internal.prepareQuit': internalPrepareQuit,
  // DEV-6
  'results.query': resultsQuery,
  'finding.get': findingGet,
  // DEV-7
  'captures.list': capturesList,
  'baselines.list': baselinesList,
  'baseline.approve': baselineApprove,
  // DEV-9
  'report.build': reportBuild,
  'reports.list': reportsList,
  'report.export': reportExport,
  'compare.runs': compareRuns,
  'internal.clipboardText': internalClipboardText,
  'internal.recordCopy': internalRecordCopy,
  'task.update': taskUpdate,
  'tasks.verify': tasksVerify,
  'review.record': reviewRecord,
  'reviews.list': reviewsList,
  'aiChecks.needs': aiChecksNeeds,
  'aiChecks.provideInput': aiChecksProvideInput,
  'aiChecks.generate': aiChecksGenerate,
  'aiChecks.save': aiChecksSave,
  'aiChecks.importResults': aiChecksImportResults,
  'aiChecks.get': aiChecksGet,
  'aiChecks.list': aiChecksList,
};
