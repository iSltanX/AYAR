// The engine's handler table. Each phase adds the handlers of its commands here, one line per command.
import type { HandlerTable } from '../host/dispatcher.ts';
import { advisorSuggest, taskCreate, tasksList } from './advisor.ts';
import { environmentResolve } from './environment.ts';
import { profileApprove, profileExport, profileExportPreview, profileGet, profileImport, profileImportFromRepo, profilePropose, profileUpdate } from './profile.ts';
import { projectAdd, projectCancelDiscovery, projectConfirm, projectGet, projectList, projectRelocate, projectRemove, projectRename, projectRescan, projectSetTrust } from './projects.ts';
import { settingsGet, settingsSet } from './settings.ts';

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
};
