<script lang="ts">
  // Icon button (Figma 98:343, C-0B): quiet, 28x28 target, radius/control, a Lucide 16 glyph. It has no
  // Direction: the caller passes the glyph for the language (panel-left in Arabic, panel-right in English,
  // D-DES3-09). The accessible name is required.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { LucideName } from '../design/icons.generated.ts';
  import Icon from './Icon.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style' | 'children'> {
    icon: LucideName;
    label: string;
  }
  let { icon, label, type = 'button', ...rest }: Props = $props();
</script>

<button class="icon-button" {type} aria-label={label} title={label} {...rest}>
  <Icon name={icon} size={16} />
</button>

<style>
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-primary);
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .icon-button:hover {
    background: var(--bg-sunken);
  }
  .icon-button:active {
    background: var(--border-subtle);
  }
  .icon-button:disabled {
    background: transparent;
    color: var(--text-tertiary);
  }
</style>
