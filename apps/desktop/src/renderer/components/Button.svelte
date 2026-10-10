<script lang="ts">
  // Button (Figma 98:310, C-0B; D-DES3-01, D-DES3-03): 28 high, radius/control, padding 12, gap 8, text style
  // button. primary is ink (never blue or green, 16.6); destructive is outlined with a warning icon, never red.
  // hover, pressed and focus are CSS states; disabled is a property.
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { LucideName } from '../design/icons.generated.ts';
  import Icon from './Icon.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style'> {
    kind?: 'primary' | 'secondary' | 'quiet' | 'destructive';
    /** A Lucide icon at the start; destructive buttons always show triangle-alert. */
    icon?: LucideName;
    children: Snippet;
  }
  let { kind = 'secondary', icon, type = 'button', children, ...rest }: Props = $props();
  const glyph = $derived(kind === 'destructive' ? 'triangle-alert' : icon);
</script>

<button class="button {kind}" {type} {...rest}>
  {#if glyph}<Icon name={glyph} size={16} />{/if}
  <span class="label">{@render children()}</span>
</button>

<style>
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    height: 28px;
    padding: 0 var(--space-12);
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    font: var(--type-button);
    color: var(--text-primary);
    background: transparent;
    white-space: nowrap;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .primary {
    background: var(--text-primary);
    color: var(--text-inverse);
  }
  .primary:hover {
    background: var(--text-secondary);
  }
  .primary:active {
    background: var(--text-tertiary);
  }
  .secondary,
  .destructive {
    background: var(--bg-surface);
    border-color: var(--border-strong);
  }
  .secondary:hover,
  .destructive:hover,
  .quiet:hover {
    background: var(--bg-sunken);
  }
  .secondary:active,
  .destructive:active,
  .quiet:active {
    background: var(--border-subtle);
  }
  .button:disabled {
    background: var(--bg-sunken);
    border-color: var(--border-subtle);
    color: var(--text-tertiary);
  }
  .quiet:disabled {
    background: transparent;
    border-color: transparent;
  }
</style>
