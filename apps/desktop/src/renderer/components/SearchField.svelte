<script lang="ts">
  // Search field (Figma 99:234, C-18): 240×28, radius/control, bg/surface with a border/strong edge, padding 8,
  // gap 8. The search glyph (text/secondary) sits at the start, the placeholder is text/tertiary and the value
  // text/primary. When filled, a clear Icon button (x, 28×28) sits at the end. Hover = bg/sunken; disabled =
  // bg/sunken, border/subtle, glyph text/tertiary. The input itself is the bordered box, so the keyboard focus
  // ring (D-DES3-02) surrounds the whole field. ⌘F (focus the page search) is bound by the page, not here.
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { controlWidth, type ControlWidth } from '../lib/controls.ts';
  import { useLocale } from '../lib/locale.ts';
  import Icon from './Icon.svelte';

  interface Props extends Omit<HTMLInputAttributes, 'class' | 'style' | 'type' | 'value' | 'width'> {
    value?: string;
    /** Placeholder and accessible name; defaults to «ابحث» / "Search". */
    placeholder?: string;
    /** Accessible name when it differs from the placeholder. */
    label?: string;
    /** 240 by default (Figma); a number of px or 'fill'. */
    width?: ControlWidth;
    /** Called after the clear button empties the field. */
    onclear?: () => void;
  }
  let { value = $bindable(''), placeholder, label, width, disabled = false, onclear, ...rest }: Props = $props();
  const { t } = useLocale();
  const hint = $derived(placeholder ?? t('controls.search.placeholder'));
  const filled = $derived(value.length > 0 && !disabled);
  let input: HTMLInputElement | undefined = $state();

  function clear() {
    value = '';
    input?.focus();
    onclear?.();
  }
</script>

<div class="search" class:filled {@attach controlWidth(width)}>
  <span class="glyph" class:disabled><Icon name="search" size={16} /></span>
  <input
    bind:this={input}
    bind:value
    class="input"
    type="search"
    placeholder={hint}
    aria-label={label ?? hint}
    autocomplete="off"
    spellcheck="false"
    {disabled}
    {...rest}
  />
  {#if filled}
    <button type="button" class="clear" aria-label={t('controls.search.clear')} title={t('controls.search.clear')} onclick={clear}>
      <Icon name="x" size={16} />
    </button>
  {/if}
</div>

<style>
  .search {
    position: relative;
    display: inline-flex;
    flex: none;
    inline-size: var(--control-width, 240px);
    max-inline-size: 100%;
    block-size: 28px;
  }
  .input {
    inline-size: 100%;
    block-size: 28px;
    margin: 0;
    padding-block: 0;
    padding-inline: calc(var(--space-8) + 16px + var(--space-8)) var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    color: var(--text-primary);
    font: var(--type-body);
    appearance: none;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .filled .input {
    padding-inline-end: calc(28px + var(--space-8));
  }
  .input::-webkit-search-cancel-button,
  .input::-webkit-search-decoration {
    appearance: none;
  }
  .input::placeholder {
    color: var(--text-tertiary);
    opacity: 1;
  }
  .input:hover:not(:disabled, :focus) {
    background: var(--bg-sunken);
  }
  .input:disabled {
    background: var(--bg-sunken);
    border-color: var(--border-subtle);
  }
  .glyph {
    position: absolute;
    inset-block: 0;
    inset-inline-start: var(--space-8);
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    pointer-events: none;
  }
  .glyph.disabled {
    color: var(--text-tertiary);
  }
  .clear {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-primary);
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .clear:hover {
    background: var(--bg-sunken);
  }
  .clear:active {
    background: var(--border-subtle);
  }
</style>
