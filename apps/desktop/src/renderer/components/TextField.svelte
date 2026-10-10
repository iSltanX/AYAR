<script lang="ts">
  // Text field (Figma 99:268, C-18): 320×28, radius/control, bg/surface with a border/strong edge, padding 8,
  // text style body; placeholder text/tertiary, value text/primary. Hover = bg/sunken; disabled = bg/sunken with
  // border/subtle. The label sits above the field (label style) and belongs to the caller. There is no red error
  // state: a missing value is said in text («ناقص: السلوك المتوقع»). `mono` gives the argument-editor field
  // (Figma 100:889 arg-field): monospace, always left to right.
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { controlWidth, type ControlWidth } from '../lib/controls.ts';

  interface Props extends Omit<HTMLInputAttributes, 'class' | 'style' | 'value' | 'width'> {
    value?: string;
    /** Accessible name when no <label for> points at the field. */
    label?: string;
    /** 320 by default (Figma); a number of px or 'fill'. */
    width?: ControlWidth;
    /** Monospace, left to right (commands, paths, arguments: D-DES3-04). */
    mono?: boolean;
    element?: HTMLInputElement;
  }
  let { value = $bindable(''), label, width, mono = false, type = 'text', element = $bindable(), ...rest }: Props = $props();
</script>

<input
  bind:this={element}
  bind:value
  class="field"
  class:mono
  {type}
  aria-label={label}
  dir={mono ? 'ltr' : undefined}
  spellcheck={mono ? false : undefined}
  autocomplete={mono ? 'off' : undefined}
  {...rest}
  {@attach controlWidth(width)}
/>

<style>
  .field {
    flex: none;
    inline-size: var(--control-width, 320px);
    max-inline-size: 100%;
    block-size: 28px;
    margin: 0;
    padding: 0 var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    color: var(--text-primary);
    font: var(--type-body);
    text-align: start;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .field::placeholder {
    color: var(--text-tertiary);
    opacity: 1;
  }
  .field:hover:not(:disabled, :focus) {
    background: var(--bg-sunken);
  }
  .field:disabled {
    background: var(--bg-sunken);
    border-color: var(--border-subtle);
    color: var(--text-tertiary);
  }
  .mono {
    font: var(--type-mono);
    text-align: left;
    unicode-bidi: isolate;
  }
</style>
