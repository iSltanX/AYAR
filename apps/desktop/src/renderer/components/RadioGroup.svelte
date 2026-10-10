<script lang="ts" generics="T extends string">
  // A group of Radio buttons (Figma 114:8652) for one mutually exclusive choice, e.g. the review decision
  // (D-DES3-08). Native radios with one name: Tab enters at the selected one and the arrow keys move and select
  // (WAI-ARIA radio group). Stacked, in reading order.
  import type { ControlOption } from '../lib/controls.ts';
  import Radio from './Radio.svelte';

  interface Props {
    value?: T;
    options: readonly ControlOption<T>[];
    /** The group's accessible name (the question it answers). */
    label: string;
    disabled?: boolean;
    onchange?: (value: T) => void;
  }
  let { value = $bindable(), options, label, disabled = false, onchange }: Props = $props();
  const name = $props.id();

  function pick(v: string) {
    const o = options.find((x) => x.value === v);
    if (!o) return;
    value = o.value;
    onchange?.(o.value);
  }
</script>

<div class="group" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
  {#each options as o (o.value)}
    <Radio {name} value={o.value} label={o.label} checked={value === o.value} disabled={disabled || o.disabled} onchange={pick} />
  {/each}
</div>

<style>
  .group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
</style>
