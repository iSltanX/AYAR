<script lang="ts">
  // Screens 22.1 and 22.2 (13.5 «فشل»; Figma 199:26357 and 199:26472): a project whose folder AYAR cannot read. macOS
  // refused the privacy permission: the guide — the folder, the three steps, «افتح الإعدادات» (System Settings at
  // Files and Folders) and «حاول مجددًا» (read it again). The folder is gone: «المسار غير موجود» with the last good
  // reading, «حدّد الموقع الجديد» (the folder dialog, then project.relocate) and «أزل من عِيَار» (confirmed natively).
  // The runs and the evidence AYAR kept stay; reading never runs anything.
  import type { Project } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import PathPill from '../../components/PathPill.svelte';
  import { PROTECTED_LOCATIONS } from '../../lib/sheets.ts';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { dayTime, displayPath, homeOf } from '../../app/format.ts';
  import { useApp } from '../../app/state.svelte.ts';

  let { project }: { project: Project } = $props();
  const app = useApp();
  const { t, lang } = useLocale();
  const uid = $props.id();

  const denied = $derived(project.pathStatus === 'permission_denied');
  const path = $derived(displayPath(project.rootPath, homeOf(project.rootPath)));
  const location = $derived(project.protectedLocation ? t(PROTECTED_LOCATIONS[project.protectedLocation]) : null);
  const lastRead = $derived(project.discovery.last?.createdAt ?? null);

  async function retry(): Promise<void> {
    const r = await attempt('project.rescan', { projectId: project.id });
    if (r.ok) app.navigate({ name: 'discovery', projectId: project.id, discoveryId: r.result.discoveryId, pending: null });
    else await app.refreshProjects();
  }

  async function relocate(): Promise<void> {
    const picked = await attempt('dialog.pickFolder', { purpose: 'project.relocate' });
    if (!picked.ok || 'cancelled' in picked.result) return;
    const r = await attempt('project.relocate', { projectId: project.id, selectionToken: picked.result.selectionToken });
    if (!r.ok) return;
    await app.refreshProjects();
    if (r.result.status === 'relocated') app.navigate({ name: 'discovery', projectId: project.id, discoveryId: r.result.discoveryId, pending: null });
    else app.navigate({ name: 'discovery', projectId: project.id, discoveryId: null, pending: r.result.confirmation });
  }

  async function remove(): Promise<void> {
    const c = await attempt('confirm.issue', { command: 'project.remove', target: project.id });
    if (!c.ok || 'cancelled' in c.result) return;
    const r = await attempt('project.remove', { projectId: project.id, confirmationToken: c.result.confirmationToken });
    if (!r.ok) return;
    await app.refreshProjects();
    app.navigate({ name: 'projects' });
  }
</script>

<div class="page" data-testid={denied ? 'privacy-guide' : 'path-missing'}>
  <section class="card" aria-labelledby="{uid}-title">
    <h1 class="title" id="{uid}-title"><Icon name={denied ? 'lock' : 'folder'} size={16} />{t(denied ? 'statesui.denied.title' : 'statesui.missing.title')}</h1>
    {#if denied}
      <p class="body">{location ? t('statesui.denied.reasonIn', { location }) : t('statesui.denied.reason')}</p>
    {:else}
      <p class="body">{lastRead ? t('statesui.missing.reasonLastRead', { date: dayTime(lastRead, lang) }) : t('statesui.missing.reason')}</p>
    {/if}
    <p class="field"><span class="label">{t(denied ? 'statesui.denied.folder' : 'statesui.missing.path')}</span><PathPill {path} oncopy={copyText} /></p>
    {#if denied}
      <ol class="steps">
        <li>{t('statesui.denied.step1')}</li>
        <li>{location ? t('statesui.denied.step2', { location }) : t('statesui.denied.step2Folder')}</li>
        <li>{t('statesui.denied.step3')}</li>
      </ol>
      <div class="buttons">
        <Button kind="primary" onclick={() => void attempt('system.openPrivacySettings', {})}>{t('statesui.denied.openSettings')}</Button>
        <Button kind="secondary" onclick={() => void retry()}>{t('statesui.denied.retry')}</Button>
      </div>
    {:else}
      <div class="buttons">
        <Button kind="primary" icon="folder-open" onclick={() => void relocate()}>{t('statesui.missing.relocate')}</Button>
        <Button kind="quiet" onclick={() => void remove()}>{t('ui.action.removeFromAyar')}</Button>
      </div>
    {/if}
  </section>
</div>

<style>
  .page {
    display: flex;
    justify-content: center;
    padding: 64px var(--space-32) var(--space-32);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    inline-size: 680px;
    max-inline-size: 100%;
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .title {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .body {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
  }
  .label {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    margin: 0;
    padding: var(--space-12) var(--space-12) var(--space-12) var(--space-32);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
    font: var(--type-body);
    color: var(--text-primary);
  }
  .buttons {
    display: flex;
    gap: var(--space-8);
  }
</style>
