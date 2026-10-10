<script lang="ts">
  // A Lucide icon (A-12, D-DES2-03): 16, 20 and 24 (empty states) with a 1.5 stroke, 12 (tag icons) with a 2 stroke, in
  // currentColor. Decorative unless it has a label. Directional icons are chosen per language by the caller
  // (D-DES2-02), never mirrored by transform.
  import { LUCIDE, type LucideName } from '../design/icons.generated.ts';

  interface Props {
    name: LucideName;
    size?: 12 | 16 | 20 | 24;
    /** An accessible name; without one the icon is aria-hidden. */
    label?: string;
  }
  let { name, size = 16, label }: Props = $props();
  const nodes = $derived(LUCIDE[name]);
</script>

<svg
  class="icon"
  data-icon={name}
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={size === 12 ? 2 : 1.5}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  {#each nodes as [tag, attrs], i (i)}
    <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
  {/each}
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
