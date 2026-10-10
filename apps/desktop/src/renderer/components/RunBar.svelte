<script lang="ts">
  // Run bar (Figma 102:1452, C-03): under the title bar while a run is active. Fills the main column, 40 high
  // including a 1 px border/subtle at the bottom, bg/surface, padding 0 16, gap 16. From the start side: the
  // cycle indicator with the run kind (status symbol 16 + label in the cycle colours) · «7 of 18 complete» ·
  // duration · result counts (status symbol 12 + Latin digits, gap 4, 12 apart) · space · quiet «Show
  // progress» · secondary «Cancel» (disabled while cancelling). Numbers use numeric/live so they do not shake.
  // The screen-reader summary (at most every 10 s, plan 13.2) belongs to the caller.
  import { formatNumber } from '@ayar/i18n';
  import { useLocale } from '../lib/locale.ts';
  import { clock, isoDuration, type ResultCount, type RunBarStatus } from '../lib/shell.ts';
  import Button from './Button.svelte';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props {
    status: RunBarStatus;
    /** The run kind, e.g. t('shell.runBar.kind.fullScan'). */
    kind: string;
    done: number;
    total: number;
    /** Elapsed time in seconds. */
    elapsed: number;
    counts?: readonly ResultCount[];
    onshowprogress?: () => void;
    oncancel?: () => void;
  }
  let { status, kind, done, total, elapsed, counts = [], onshowprogress, oncancel }: Props = $props();
  const { t, lang } = useLocale();
</script>

<section class="run-bar" aria-label={t('shell.runBar.label')} data-status={status}>
  <span class="cycle status-{status}">
    <StatusSymbol symbol={status} size={16} />
    <span class="cycle-label">{t('shell.runBar.cycle', { kind, status: t(`status.cycle.${status}`) })}</span>
  </span>
  <span class="numeric">{t('shell.progress.complete', { done, total })}</span>
  <span class="numeric secondary">
    <span class="visually-hidden">{t('shell.runBar.elapsed')}</span>
    <time datetime={isoDuration(elapsed)}>{clock(elapsed, true)}</time>
  </span>
  {#if counts.length}
    <ul class="counts" aria-label={t('shell.runBar.counts')}>
      {#each counts as c (c.result)}
        <li class="count">
          <StatusSymbol symbol={c.result} size={12} />
          <span class="numeric" aria-hidden="true">{formatNumber(c.count, lang)}</span>
          <span class="visually-hidden">{t('shell.runBar.count', { status: t(`status.result.${c.result}`), count: c.count })}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <span class="space"></span>
  <Button kind="quiet" onclick={() => onshowprogress?.()}>{t('shell.runBar.showFollowUp')}</Button>
  <Button kind="secondary" disabled={status === 'cancelling'} onclick={() => oncancel?.()}>{t('ui.action.cancel')}</Button>
</section>

<style>
  .run-bar {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    inline-size: 100%;
    height: 40px;
    padding: 0 var(--space-16);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    white-space: nowrap;
  }
  .cycle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    color: var(--status-fg);
    font: var(--type-label);
  }
  .numeric {
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }
  .secondary {
    color: var(--text-secondary);
  }
  .counts {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
  }
  .space {
    flex: 1;
    min-width: 0;
  }
</style>
