<script lang="ts">
  // Radio button (Figma 114:8652, C-18; D-DES3-08): a 14 px dot (radius 7), gap 8, label (body); row ≥ 28 and
  // all of it the hit target. Unselected: bg/surface with a border/strong edge; hover bg/sunken. Selected: ink
  // fill (text/primary; hover text/secondary) with a 6 px inner dot in text/inverse. Disabled: bg/sunken +
  // border/subtle, or a border/strong fill when selected; label text/tertiary. The dot is a native
  // <input type="radio">: radios sharing a name move with the arrow keys, and the ring is on the dot.
  interface Props {
    /** The radios of one choice share a name (RadioGroup sets it). */
    name: string;
    value: string;
    checked?: boolean;
    label: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
  }
  let { name, value, checked = false, label, disabled = false, onchange }: Props = $props();
</script>

<label class="radio" class:disabled>
  <span class="dot-wrap">
    <input type="radio" class="dot" class:on={checked} {name} {value} {checked} {disabled} onchange={() => onchange?.(value)} />
    {#if checked}<span class="inner"></span>{/if}
  </span>
  <span class="text">{label}</span>
</label>

<style>
  .radio {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    min-block-size: 28px;
    color: var(--text-primary);
    font: var(--type-body);
    cursor: default;
  }
  .radio.disabled {
    color: var(--text-tertiary);
  }
  .dot-wrap {
    position: relative;
    display: inline-flex;
    flex: none;
    inline-size: 14px;
    block-size: 14px;
  }
  .dot {
    inline-size: 14px;
    block-size: 14px;
    margin: 0;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    background: var(--bg-surface);
    appearance: none;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .radio:hover .dot:not(:disabled) {
    background: var(--bg-sunken);
  }
  .dot.on {
    border-color: var(--text-primary);
    background: var(--text-primary);
  }
  .radio:hover .dot.on:not(:disabled) {
    border-color: var(--text-secondary);
    background: var(--text-secondary);
  }
  .dot:disabled {
    border-color: var(--border-subtle);
    background: var(--bg-sunken);
  }
  .dot.on:disabled {
    border-color: var(--border-strong);
    background: var(--border-strong);
  }
  .inner {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: var(--text-inverse);
    pointer-events: none;
  }
</style>
