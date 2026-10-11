<script lang="ts">
  // 22.4 «لا فحوص منطبقة» (13.5; Figma 22.4): discovery found nothing to measure the project by — no package file, no
  // scripts, no tests, no interface to render — and AYAR does not invent a criterion for what it does not know. What
  // still runs on any folder is named; «أعد القراءة» reads the folder again, and «أضف فحصًا مخصصًا» is the owner's own
  // criterion.
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { useApp } from '../../app/state.svelte.ts';

  let { projectId, running, onreread }: { projectId: string; running: readonly string[]; onreread: () => void } = $props();
  const app = useApp();
  const { t } = useLocale();

  let files = $state<number | null>(null);
  $effect(() => {
    void attempt('project.get', { projectId }).then((r) => {
      if (r.ok) files = r.result.snapshot?.inventory.files ?? null;
    });
  });
  let busy = $state(false);
  async function reread(): Promise<void> {
    busy = true;
    const r = await attempt('project.rescan', { projectId });
    busy = false;
    if (r.ok) onreread();
  }
</script>

<section class="state" data-testid="no-applicable" aria-labelledby="na-title">
  <h2 class="title" id="na-title"><Icon name="info" size={16} />{t('statesui.noChecks.title')}</h2>
  <p class="body">{files === null ? t('statesui.noChecks.reason') : t('statesui.noChecks.reasonFiles', { count: files })}</p>
  {#if running.length}
    <p class="row small muted">{t('statesui.noChecks.stillRuns')}{#each running as r (r)}<span class="val"><bdi dir="ltr">{r}</bdi></span>{/each}</p>
  {/if}
  <div class="row">
    <Button kind="primary" onclick={() => app.navigate({ name: 'section', projectId, section: 'custom' })}>{t('statesui.noChecks.addCustom')}</Button>
    <Button kind="secondary" disabled={busy} onclick={() => void reread()}>{t('statesui.noChecks.reread')}</Button>
  </div>
</section>

<style>
  .state {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    max-inline-size: 680px;
    margin-inline: auto;
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
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
  }
  .small {
    font: var(--type-body-small);
  }
  .muted {
    color: var(--text-secondary);
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
