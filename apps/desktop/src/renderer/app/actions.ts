// The flows more than one page starts (13.4 J1): adding a project from the folder dialog (⌘O, the empty state,
// the title bar) or by dropping a folder, with the steps C-05 may stop at (a broad folder, a privacy permission).
// The UI holds tokens only; the path stays in the main process (D-29).
import type { BridgeDrop, CheckSpec, RunSelection } from '@ayar/protocol';
import { attempt } from './client.ts';
import type { AppState } from './state.svelte.ts';

/** project.add with a selection token, then the page its answer leads to. */
export async function addProject(app: AppState, selectionToken: string): Promise<void> {
  const r = await attempt('project.add', { selectionToken });
  if (!r.ok) {
    app.navigate({ name: 'discovery', projectId: null, discoveryId: null, pending: null, failure: r.error.code });
    return;
  }
  const a = r.result;
  if (a.status === 'added') {
    await app.refreshProjects();
    app.navigate({ name: 'discovery', projectId: a.project.id, discoveryId: a.discoveryId, pending: null });
  } else if (a.status === 'existing') {
    app.navigate({ name: 'overview', projectId: a.project.id });
  } else {
    // 13.3 «تحذير المسار الواسع»: the disk root or the whole home folder, before anything is read.
    app.navigate({ name: 'discovery', projectId: null, discoveryId: null, pending: a.confirmation });
  }
}

/** ⌘O, «اختر مجلدًا…»: the system's folder dialog (no permission prompt follows it, E-05). */
export async function addProjectFromDialog(app: AppState): Promise<void> {
  const picked = await attempt('dialog.pickFolder', { purpose: 'project.add' });
  if (!picked.ok || 'cancelled' in picked.result) return;
  await addProject(app, picked.result.selectionToken);
}

/**
 * A dropped folder (C-01): the main process answered with a token. In a protected location macOS will ask for a
 * permission, since a drop does not pass the open panel (E-05), so the explanation comes first (FR-59, 13.3).
 */
export async function addDroppedProject(app: AppState, drop: BridgeDrop): Promise<void> {
  // Something other than one folder: nothing is added, and a screen reader hears why (no visual state is designed).
  if (!drop.ok) return app.announce(drop.reason === 'multiple' ? app.t('app.drop.multiple') : app.t('app.drop.notFolder'));
  if (drop.location) {
    app.navigate({ name: 'discovery', projectId: null, discoveryId: null, pending: null, permission: { selectionToken: drop.selectionToken, location: drop.location, display: drop.display } });
    return;
  }
  await addProject(app, drop.selectionToken);
}

/**
 * Plans a selection and starts it (FR-18: a section, one check, a selection, a saved group, the advisor's checks),
 * then shows its monitor. The plan is the engine's (G-24); a plan that cannot start leaves the page as it is.
 */
export async function runSelection(app: AppState, projectId: string, selection: RunSelection): Promise<boolean> {
  const p = await attempt('run.plan', { projectId, selection });
  if (!p.ok) return false;
  const s = await attempt('run.start', { planId: p.result.id });
  if (!s.ok) return false;
  await app.runs.load(s.result.runId);
  app.navigate({ name: 'scan', projectId, runId: s.result.runId });
  return true;
}

/**
 * «أثبِت بإعادة الفحص» on a model claim (12.9, AT-44): the local check the claim names, with integ.model-claims after
 * it when it applies, so the same run settles the claim — proven by a finding at its place, or left open.
 */
export function proveClaim(app: AppState, projectId: string, checks: readonly CheckSpec[], checkId: string): Promise<boolean> {
  const spec = checks.find((s) => s.checkId === checkId && s.applicable);
  if (!spec) return Promise.resolve(false);
  const claims = checks.find((s) => s.checkId === 'integ.model-claims' && s.applicable);
  return runSelection(app, projectId, claims ? { kind: 'group', instances: [spec.instance, claims.instance] } : { kind: 'check', instance: spec.instance });
}
