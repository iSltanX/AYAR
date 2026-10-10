<script lang="ts" generics="T extends string">
  // Segmented control (Figma 100:483, C-18): a bg/sunken track, radius/control, padding 2, gap 2, holding
  // Segment items in reading order (the first option at the start side). Used for «لك | للنموذج» (component 24)
  // and the image-diff modes (component 14). A radio group: one tab stop on the selected segment, the arrow keys
  // (following the reading direction), Home and End move and select.
  import { arrowTarget, type ControlOption } from '../lib/controls.ts';
  import Segment from './Segment.svelte';

  interface Props {
    value?: T;
    options: readonly ControlOption<T>[];
    /** The group's accessible name. */
    label: string;
    disabled?: boolean;
    onchange?: (value: T) => void;
  }
  let { value = $bindable(), options, label, disabled = false, onchange }: Props = $props();
  let buttons: HTMLButtonElement[] = $state([]);

  const enabled = $derived(options.map((o) => !disabled && !o.disabled));
  const current = $derived(Math.max(0, options.findIndex((o) => o.value === value)));

  function select(i: number) {
    const o = options[i];
    if (!o || !enabled[i]) return;
    if (o.value !== value) {
      value = o.value;
      onchange?.(o.value);
    }
  }
  function keydown(e: KeyboardEvent) {
    const to = arrowTarget(e, current, enabled);
    if (to === null) return;
    e.preventDefault();
    select(to);
    buttons[to]?.focus();
  }
</script>

<div class="track" role="radiogroup" aria-label={label}>
  {#each options as o, i (o.value)}
    <Segment
      bind:element={buttons[i]}
      selected={i === current}
      tabindex={i === current ? 0 : -1}
      disabled={!enabled[i]}
      onclick={() => select(i)}
      onkeydown={keydown}>{o.label}</Segment
    >
  {/each}
</div>

<style>
  .track {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
  }
</style>
