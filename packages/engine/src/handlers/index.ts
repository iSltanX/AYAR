// The engine's handler table. Each phase adds the handlers of its commands here, one line per command.
import type { HandlerTable } from '../host/dispatcher.ts';
import { environmentResolve } from './environment.ts';
import { evidenceToken, internalEvidencePath } from './evidence.ts';
import { profileApprove, profileExport, profileExportPreview, profileGet, profileImport, profileImportFromRepo, profilePropose, profileUpdate } from './profile.ts';
import { projectAdd, projectCancelDiscovery, projectConfirm, projectGet, projectList, projectRelocate, projectRemove, projectRename, projectRescan, projectSetTrust } from './projects.ts';
import { groupsDelete, groupsList, groupsSave, internalPrepareQuit, runCancel, runContinueRound, runGet, runPlan, runRerun, runsDelete, runsKeep, runsList, runStart } from './runs.ts';
import { settingsGet, settingsSet } from './settings.ts';
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
  'runs.keep': runsKeep,
  'runs.delete': runsDelete,
  'groups.save': groupsSave,
  'groups.list': groupsList,
  'groups.delete': groupsDelete,
  'evidence.token': evidenceToken,
  'internal.evidencePath': internalEvidencePath,
  'internal.prepareQuit': internalPrepareQuit,
};
