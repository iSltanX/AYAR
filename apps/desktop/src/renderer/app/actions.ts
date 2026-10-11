// The flows more than one page starts (13.4 J1): adding a project from the folder dialog (⌘O, the empty state,
// the title bar) or by dropping a folder, with the steps C-05 may stop at (a broad folder, a privacy permission).
// The UI holds tokens only; the path stays in the main process (D-29).
import type { BridgeDrop } from '@ayar/protocol';
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
