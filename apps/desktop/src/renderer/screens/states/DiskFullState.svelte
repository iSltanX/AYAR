<script lang="ts">
  // 22.3 «القرص ممتلئ» (13.5; Figma 22.3): a run the executor stopped safely because the data volume ran low, before a
  // write could fail. Its partial results and evidence are kept; it has no karat. The old evidence that can be cleaned
  // (runs not kept forever) is counted, and the way on: clean it from the runs, run again what did not complete, or
  // open the settings' data group.
  import type { RunView } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { sizeText } from '../../app/results.ts';
  import { useApp } from '../../app/state.svelte.ts';

  let { projectId, run }: { projectId: string; run: RunView } = $props();
  const app = useApp();
  const { t } = useLocale();

  let old = $state<{ count: number; bytes: number } | null>(null);
  $effect(() => {
    void attempt('runs.list', { projectId }).then((r) => {
      if (r.ok) old = { count: r.result.runs.filter((x) => !x.keepForever && x.runId !== run.runId).length, bytes: r.result.spaceUsedBytes };
    });
  });
  const done = $derived(Object.entries(run.counts.byOutcome).filter(([o]) => o !== 'cancelled').reduce((n, [, c]) => n + (c ?? 0), 0));
  const total = $derived(Object.values(run.counts.byOutcome).reduce((n: number, c) => n + (c ?? 0), 0));
  let busy = $state(false);
  async function rerun(): Promise<void> {
    busy = true;
    const p = await attempt('run.rerun', { runId: run.runId, filter: { mode: 'incomplete' } });
    if (p.ok) {
      const s = await attempt('run.start', { planId: p.result.id });
      if (s.ok) {
        await app.runs.load(s.result.runId);
        app.navigate({ name: 'scan', projectId, runId: s.result.runId });
      }
    }
    busy = false;
  }
</script>

<section class="state" data-testid="disk-full" aria-labelledby="disk-title">
  <h2 class="title" id="disk-title"><Icon name="triangle-alert" size={16} />{t('statesui.disk.title')}</h2>
  <p class="body">{t('statesui.disk.reason')}</p>
  <p class="row small muted">{t('statesui.disk.run')}<span class="val"><bdi dir="ltr">{run.displayId}</bdi></span>{t('statesui.disk.kept', { done, total })}</p>
  {#if old}<p class="small muted">{t('statesui.disk.old', { size: sizeText(old.bytes), count: old.count })}</p>{/if}
  <div class="row">
    <Button kind="primary" onclick={() => app.navigate({ name: 'runs', projectId })}>{t('statesui.disk.clean')}</Button>
    <Button kind="secondary" disabled={busy} onclick={() => void rerun()}>{t('ui.action.rerunIncomplete')}</Button>
    <Button kind="quiet" onclick={() => app.navigate({ name: 'settings' })}>{t('statesui.disk.settings')}</Button>
  </div>
</section>

<style>
  .state {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    max-inline-size: 680px;
    margin: var(--space-48) auto 0;
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
    margin: 0;
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
