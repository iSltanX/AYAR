<script lang="ts">
  // Result badge (Figma 70:276, DES-2 6.1; D-DES2-05, D-DES2-09): a filled pill, symbol then text, never a
  // border. md is 22 high with a 16 symbol, sm 20 with a 12 symbol; padding 4 on the symbol side and 8 on the
  // text side, gap 4, full radius. "Reviewed" adds an eye after the text, only on passed and failed.
  import { useLocale } from '../lib/locale.ts';
  import { badgeParts, type BadgeResult } from '../lib/status.ts';
  import Icon from './Icon.svelte';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props {
    result: BadgeResult;
    size?: 'sm' | 'md';
  }
  let { result, size = 'md' }: Props = $props();
  const { t } = useLocale();
  const parts = $derived(badgeParts(result));
</script>

<span class="badge {size} status-{parts.family}" data-result={result}>
  <StatusSymbol symbol={parts.family} size={size === 'md' ? 16 : 12} />
  <span class="label">{t(`status.result.${result}`)}</span>
  {#if parts.reviewed}<span class="eye"><Icon name="eye" size={12} /></span>{/if}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    padding-inline: var(--space-4) var(--space-8);
    background: var(--status-bg);
    color: var(--status-fg);
    font: var(--type-label);
    white-space: nowrap;
  }
  .md {
    height: 22px;
    border-radius: 11px;
  }
  .sm {
    height: 20px;
    border-radius: 10px;
  }
  .eye {
    display: inline-flex;
    color: var(--status-icon);
  }
</style>
