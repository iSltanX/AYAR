<script lang="ts">
  // Tab (Figma 100:549, C-18): 32 high = a 30 label area (padding 12, text style button) over a 2 px indicator.
  // Selected: label text/primary and an ink indicator (text/primary). Unselected: label text/secondary, hover
  // text/primary, no indicator. Disabled: text/tertiary. The focus ring (radius 6 + 4) surrounds the whole tab.
  // A role=tab button; Tabs owns the roving tab stop and the arrow keys.
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style' | 'role'> {
    selected?: boolean;
    element?: HTMLButtonElement;
    children: Snippet;
  }
  let { selected = false, type = 'button', element = $bindable(), children, ...rest }: Props = $props();
</script>

<button bind:this={element} {type} role="tab" class="tab" class:selected aria-selected={selected} {...rest}>
  <span class="label">{@render children()}</span>
  <span class="indicator"></span>
</button>

<style>
  .tab {
    display: inline-flex;
    flex-direction: column;
    flex: none;
    block-size: 32px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-secondary);
    font: var(--type-button);
    white-space: nowrap;
    cursor: default;
    transition: color var(--motion-fast) var(--motion-easing);
  }
  .label {
    display: flex;
    align-items: center;
    justify-content: center;
    block-size: 30px;
    padding: 0 var(--space-12);
  }
  .indicator {
    block-size: 2px;
    align-self: stretch;
  }
  .tab:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .tab.selected {
    color: var(--text-primary);
  }
  .tab.selected .indicator {
    background: var(--text-primary);
  }
  .tab:disabled {
    color: var(--text-tertiary);
  }
</style>
