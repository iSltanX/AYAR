<script lang="ts">
  // Segment (Figma 100:453, C-18): one option of a SegmentedControl. 28 high, padding 12, radius 4 (fixed,
  // inside the 6-radius track, D-DES3-03), text style button. Selected: bg/surface with a border/strong edge
  // (a 3:1 indicator, not fill alone), label text/primary. Unselected: label text/secondary; hover bg/surface
  // and text/primary; pressed border/subtle. Disabled: label text/tertiary (selected: bg/sunken, border/subtle).
  // It is a role=radio button; the SegmentedControl owns the roving tab stop and the arrow keys.
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style' | 'role'> {
    selected?: boolean;
    element?: HTMLButtonElement;
    children: Snippet;
  }
  let { selected = false, type = 'button', element = $bindable(), children, ...rest }: Props = $props();
</script>

<button bind:this={element} {type} role="radio" class="segment" class:selected aria-checked={selected} {...rest}>
  {@render children()}
</button>

<style>
  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    block-size: 28px;
    margin: 0;
    padding: 0 var(--space-12);
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font: var(--type-button);
    white-space: nowrap;
    cursor: default;
    transition:
      background-color var(--motion-fast) var(--motion-easing),
      color var(--motion-fast) var(--motion-easing);
  }
  .segment:hover:not(:disabled, .selected) {
    background: var(--bg-surface);
    color: var(--text-primary);
  }
  .segment:active:not(:disabled, .selected) {
    background: var(--border-subtle);
    color: var(--text-primary);
  }
  .segment.selected {
    border: 1px solid var(--border-strong);
    background: var(--bg-surface);
    color: var(--text-primary);
  }
  .segment:disabled {
    color: var(--text-tertiary);
  }
  .segment.selected:disabled {
    border-color: var(--border-subtle);
    background: var(--bg-sunken);
  }
</style>
