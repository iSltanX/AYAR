<script lang="ts">
  // The fifteen status symbols (D-DES2-01, Figma 67:394) at 12, 16 and 20, coloured by their status icon
  // variable. Running and cancelling spin once a second clockwise (D-DES2-11); under reduced motion they become
  // their static forms. Only "skipped" mirrors in RTL (D-DES2-02). Inside a badge the symbol is decorative;
  // alone it carries its status name for screen readers (D-DES2-12).
  import { STATUS_SYMBOL_NODES } from '../design/icons.generated.ts';
  import { useLocale } from '../lib/locale.ts';
  import type { Cycle, Result } from '../lib/status.ts';

  interface Props {
    symbol: Result | Cycle;
    size?: 12 | 16 | 20;
    /** True when the symbol stands alone (no visible text): it then gets its status name. */
    alone?: boolean;
  }
  let { symbol, size = 16, alone = false }: Props = $props();
  const { t } = useLocale();

  const animated = $derived(symbol === 'running' || symbol === 'cancelling');
  const nodes = $derived(STATUS_SYMBOL_NODES[`${size}`][symbol]);
  const staticNodes = $derived(
    symbol === 'running' || symbol === 'cancelling' ? STATUS_SYMBOL_NODES[`${size}`][`${symbol}-static`] : nodes,
  );
  const isCycle = $derived(symbol === 'queued' || symbol === 'running' || symbol === 'cancelling');
  const name = $derived(alone ? t(isCycle ? `status.cycle.${symbol as Cycle}` : `status.result.${symbol as Result}`) : undefined);
</script>

<span
  class="symbol status-{symbol}"
  class:mirrors={symbol === 'skipped'}
  role={alone ? 'img' : undefined}
  aria-label={name}
  aria-hidden={alone ? undefined : 'true'}
  data-symbol={symbol}
>
  <svg class="motion" class:animated xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 {size} {size}" fill="none" focusable="false" aria-hidden="true">
    {#each nodes as [tag, attrs], i (i)}
      {#if animated && i === 0}
        <g class="spin"><svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} /></g>
      {:else}
        <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
      {/if}
    {/each}
  </svg>
  {#if animated}
    <svg class="still" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 {size} {size}" fill="none" focusable="false" aria-hidden="true">
      {#each staticNodes as [tag, attrs], i (i)}
        <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
      {/each}
    </svg>
  {/if}
</span>

<style>
  .symbol {
    display: inline-flex;
    flex: none;
    color: var(--status-icon);
  }
  .symbol svg {
    display: block;
  }
  .mirrors:dir(rtl) {
    transform: scaleX(-1);
  }
  .symbol .still {
    display: none;
  }
  .spin {
    transform-box: view-box;
    transform-origin: center;
    animation: spin var(--motion-spin) linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .symbol .motion.animated {
      display: none;
    }
    .symbol .still {
      display: block;
    }
  }
</style>
