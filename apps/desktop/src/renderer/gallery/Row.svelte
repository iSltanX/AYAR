<script lang="ts">
  // A wrapping row of specimens with an optional heading.
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    children: Snippet;
  }
  let { title, children }: Props = $props();
</script>

<div class="row">
  {#if title}<h3>{title}</h3>{/if}
  <div class="items">{@render children()}</div>
</div>

<style>
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  h3 {
    margin: 0;
    font: var(--type-label);
    color: var(--text-secondary);
    direction: ltr;
    text-align: start;
  }
  .items {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-16);
  }
</style>
