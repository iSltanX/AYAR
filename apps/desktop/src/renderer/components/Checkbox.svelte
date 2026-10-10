<script lang="ts">
  // Checkbox (Figma 100:399, C-18): box 14×14, radius 4 (fixed, D-DES3-03), then gap 8 and the label (body).
  // The row is ≥ 28×28 and all of it is the hit target (min-width 28 when the label is hidden, e.g. in table
  // rows). Unchecked: bg/surface with a border/strong edge; hover bg/sunken; pressed border/subtle. Checked and
  // mixed: ink fill (text/primary; hover text/secondary; pressed text/tertiary, D-DES3-01) with check or minus
  // in text/inverse. Disabled: bg/sunken + border/subtle, or a border/strong fill when checked; label
  // text/tertiary. The box is a real <input type="checkbox">, so the focus ring is on the box (D-DES3-02) and
  // "mixed" is the native indeterminate state.
  import Icon from './Icon.svelte';

  interface Props {
    checked?: boolean | 'mixed';
    /** The accessible name, shown after the box unless showLabel is false (Figma property Label). */
    label: string;
    showLabel?: boolean;
    disabled?: boolean;
    name?: string;
    value?: string;
    id?: string;
    /** Called with the new state; a click on a mixed box checks it. */
    onchange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), label, showLabel = true, disabled = false, name, value, id, onchange }: Props = $props();

  function change(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked;
    onchange?.(checked);
  }
</script>

<label class="checkbox" class:bare={!showLabel} class:disabled>
  <span class="box-wrap">
    <input
      type="checkbox"
      class="box"
      class:filled={checked !== false}
      checked={checked === true}
      {name}
      {value}
      {id}
      {disabled}
      onchange={change}
      {@attach (el: HTMLInputElement) => {
        el.indeterminate = checked === 'mixed';
      }}
    />
    {#if checked === true}
      <span class="mark"><Icon name="check" size={12} /></span>
    {:else if checked === 'mixed'}
      <span class="mark"><Icon name="minus" size={12} /></span>
    {/if}
  </span>
  <span class="text" class:visually-hidden={!showLabel}>{label}</span>
</label>

<style>
  .checkbox {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    min-block-size: 28px;
    color: var(--text-primary);
    font: var(--type-body);
    cursor: default;
  }
  .checkbox.bare {
    min-inline-size: 28px;
    justify-content: center;
  }
  .checkbox.disabled {
    color: var(--text-tertiary);
  }
  .box-wrap {
    position: relative;
    display: inline-flex;
    flex: none;
    inline-size: 14px;
    block-size: 14px;
  }
  .box {
    inline-size: 14px;
    block-size: 14px;
    margin: 0;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    background: var(--bg-surface);
    appearance: none;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .checkbox:hover .box:not(:disabled) {
    background: var(--bg-sunken);
  }
  .checkbox:active .box:not(:disabled) {
    background: var(--border-subtle);
  }
  .box.filled {
    border-color: var(--text-primary);
    background: var(--text-primary);
  }
  .checkbox:hover .box.filled:not(:disabled) {
    border-color: var(--text-secondary);
    background: var(--text-secondary);
  }
  .checkbox:active .box.filled:not(:disabled) {
    border-color: var(--text-tertiary);
    background: var(--text-tertiary);
  }
  .box:disabled {
    border-color: var(--border-subtle);
    background: var(--bg-sunken);
  }
  .box.filled:disabled {
    border-color: var(--border-strong);
    background: var(--border-strong);
  }
  .mark {
    position: absolute;
    inset: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-inverse);
    pointer-events: none;
  }
</style>
