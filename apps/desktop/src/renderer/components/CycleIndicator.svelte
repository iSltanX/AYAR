<script lang="ts">
  // Cycle indicator (Figma 70:426, DES-2 6.2; D-DES2-11): the run-cycle symbol then its name, no container, gap 4,
  // 20 high, label style in the cycle colour. sm has a 12 symbol, md a 16. motion="animated" spins running and
  // cancelling once a second (and falls back to the static form under reduced motion, in StatusSymbol);
  // motion="static" always shows the static form.
  import { STATUS_SYMBOL_NODES } from '../design/icons.generated.ts';
  import { useLocale } from '../lib/locale.ts';
  import type { Cycle } from '../lib/status.ts';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props {
    cycle: Cycle;
    size?: 'sm' | 'md';
    motion?: 'animated' | 'static';
  }
  let { cycle, size = 'md', motion = 'animated' }: Props = $props();
  const { t } = useLocale();
  const px = $derived(size === 'md' ? 16 : 12);
  const stillNodes = $derived(
    cycle === 'queued' ? STATUS_SYMBOL_NODES[`${px}`].queued : STATUS_SYMBOL_NODES[`${px}`][`${cycle}-static`],
  );
</script>

<span class="cycle {size} status-{cycle}" data-cycle={cycle} data-motion={motion}>
  {#if motion === 'animated'}
    <StatusSymbol symbol={cycle} size={px} />
  {:else}
    <span class="symbol" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width={px} height={px} viewBox="0 0 {px} {px}" fill="none" focusable="false" aria-hidden="true">
        {#each stillNodes as [tag, attrs], i (i)}
          <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
        {/each}
      </svg>
    </span>
  {/if}
  <span class="label">{t(`status.cycle.${cycle}`)}</span>
</span>

<style>
  .cycle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    height: 20px;
    color: var(--status-fg);
    font: var(--type-label);
    white-space: nowrap;
  }
  .symbol {
    display: inline-flex;
    flex: none;
    color: var(--status-icon);
  }
  .symbol svg {
    display: block;
  }
</style>
