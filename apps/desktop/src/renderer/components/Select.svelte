<script lang="ts" generics="T extends string">
  // Select (Figma 99:342, C-18): a macOS pop-up button. 200×28, drawn like the secondary button (bg/surface,
  // border/strong, radius/control; hover bg/sunken, pressed border/subtle; disabled bg/sunken, border/subtle,
  // text/tertiary), padding 8, gap 8, the value in body text and chevrons-up-down (text/secondary) at the end.
  // It is a native <select>, so the list that opens is the native macOS menu.
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import { controlWidth, type ControlWidth, type ControlOption } from '../lib/controls.ts';
  import Icon from './Icon.svelte';

  interface Props extends Omit<HTMLSelectAttributes, 'class' | 'style' | 'value' | 'width' | 'multiple' | 'children'> {
    value?: T;
    options: readonly ControlOption<T>[];
    /** Accessible name when no <label for> points at the select. */
    label?: string;
    /** 200 by default (Figma); a number of px or 'fill'. */
    width?: ControlWidth;
  }
  let { value = $bindable(), options, label, width, disabled = false, ...rest }: Props = $props();
</script>

<span class="select" {@attach controlWidth(width)}>
  <select bind:value class="native" aria-label={label} {disabled} {...rest}>
    {#each options as o (o.value)}
      <option value={o.value} disabled={o.disabled}>{o.label}</option>
    {/each}
  </select>
  <span class="chevrons" class:disabled><Icon name="chevrons-up-down" size={16} /></span>
</span>

<style>
  .select {
    position: relative;
    display: inline-flex;
    flex: none;
    inline-size: var(--control-width, 200px);
    max-inline-size: 100%;
    block-size: 28px;
  }
  .native {
    inline-size: 100%;
    block-size: 28px;
    margin: 0;
    padding-block: 0;
    padding-inline: var(--space-8) calc(var(--space-8) + 16px + var(--space-8));
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    color: var(--text-primary);
    font: var(--type-body);
    text-align: start;
    appearance: none;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .native:hover:not(:disabled) {
    background: var(--bg-sunken);
  }
  .native:active:not(:disabled) {
    background: var(--border-subtle);
  }
  .native:disabled {
    background: var(--bg-sunken);
    border-color: var(--border-subtle);
    color: var(--text-tertiary);
  }
  .chevrons {
    position: absolute;
    inset-block: 0;
    inset-inline-end: var(--space-8);
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    pointer-events: none;
  }
  .chevrons.disabled {
    color: var(--text-tertiary);
  }
</style>
