<script lang="ts">
  // Selection bar (Figma 112:8451, C-22; plan 9.22): floats at the bottom of the content when checks or
  // findings are selected. 720 wide, padding 8 16, gap 12, bg/elevated, 1 px border/subtle, radius/card,
  // shadow/overlay. The count (body/strong) at the start; checks: «Run selected (N)» and «Save group…»;
  // findings: a note that the «Copy for the model» scope is now the selection, and «Re-check selected (N)»;
  // both end with a quiet «Clear selection». Never a copy button here.
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';

  interface Props {
    kind: 'checks' | 'findings';
    count: number;
    onrun?: () => void;
    onsavegroup?: () => void;
    onrecheck?: () => void;
    onclear?: () => void;
  }
  let { kind, count, onrun, onsavegroup, onrecheck, onclear }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();
</script>

<div class="selection-bar" role="group" aria-labelledby="{uid}-count" data-kind={kind}>
  <span class="count" id="{uid}-count">{t('shell.selectionBar.count', { count })}</span>
  {#if kind === 'findings'}<span class="note">{t('shell.selectionBar.copyScope', { count })}</span>{/if}
  <span class="spacer"></span>
  {#if kind === 'checks'}
    <Button kind="secondary" onclick={() => onrun?.()}>{t('shell.selectionBar.runSelected', { count })}</Button>
    <Button kind="secondary" onclick={() => onsavegroup?.()}>{t('ui.action.saveGroup')}</Button>
  {:else}
    <Button kind="secondary" onclick={() => onrecheck?.()}>{t('shell.selectionBar.recheckSelected', { count })}</Button>
  {/if}
  <Button kind="quiet" onclick={() => onclear?.()}>{t('ui.action.clearSelection')}</Button>
</div>

<style>
  .selection-bar {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    inline-size: 720px;
    max-inline-size: 100%;
    padding: var(--space-8) var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-overlay);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .count {
    font: var(--type-body-strong);
  }
  .note {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .spacer {
    flex: 1;
    min-width: 0;
  }
</style>
