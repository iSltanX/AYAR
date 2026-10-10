<script lang="ts">
  // One specimen in the gallery: a component variant, its Figma node, and the size Figma gives it. The e2e
  // geometry test compares the rendered box with data-expect-w/h (±1 px).
  import type { Snippet } from 'svelte';

  interface Props {
    /** "<Figma component set>/<variant>", e.g. "Button/primary". */
    name: string;
    /** The Figma node id of the component set or variant. */
    figma?: string;
    /** Expected rendered height and width in px, from Figma; checked on the first element child. */
    h?: number;
    w?: number;
    /** Lay the specimen out as a block of this width (for full-width components). */
    width?: 'auto' | 'fill';
    children: Snippet;
  }
  let { name, figma, h, w, width = 'auto', children }: Props = $props();
</script>

<figure class="demo" class:fill={width === 'fill'} data-demo={name} data-figma={figma}>
  <div class="specimen" data-expect-h={h} data-expect-w={w}>
    {@render children()}
  </div>
  <figcaption>{name}</figcaption>
</figure>

<style>
  .demo {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    margin: 0;
    max-width: 100%;
  }
  .demo.fill {
    display: flex;
    width: 100%;
  }
  .specimen {
    display: flex;
    max-width: 100%;
  }
  .fill .specimen {
    width: 100%;
  }
  figcaption {
    font: var(--type-body-small);
    color: var(--text-tertiary);
    direction: ltr;
  }
</style>
