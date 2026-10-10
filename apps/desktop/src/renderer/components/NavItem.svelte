<script lang="ts">
  // Nav item (Figma 101:885, C-02): 224x32, padding 0 8, gap 8, radius/control; Lucide 16 glyph, body label,
  // then an optional Nav badge at the end. hover (bg/sunken), pressed (border/subtle) and focus are CSS states;
  // selected and disabled are properties. Selected: the selection fill plus a 2 px border/strong bar on the
  // inline-start edge, 20 high and centred (D-DES1-03).
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { LucideName } from '../design/icons.generated.ts';
  import type { NavBadgeValue } from '../lib/shell.ts';
  import Icon from './Icon.svelte';
  import NavBadge from './NavBadge.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style' | 'children'> {
    label: string;
    icon: LucideName;
    selected?: boolean;
    badge?: NavBadgeValue;
  }
  let { label, icon, selected = false, badge, type = 'button', ...rest }: Props = $props();
</script>

<button class="nav-item" class:selected {type} aria-current={selected ? 'page' : undefined} {...rest}>
  <Icon name={icon} size={16} />
  <span class="label">{label}</span>
  {#if badge}<NavBadge {badge} />{/if}
</button>

<style>
  .nav-item {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-8);
    inline-size: 224px;
    max-inline-size: 100%;
    height: 32px;
    padding: 0 var(--space-8);
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-primary);
    font: var(--type-body);
    text-align: start;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nav-item:hover {
    background: var(--bg-sunken);
  }
  .nav-item:active {
    background: var(--border-subtle);
  }
  .nav-item.selected {
    background: var(--selection);
  }
  .nav-item.selected::before {
    content: '';
    position: absolute;
    inset-block-start: 6px;
    inset-inline-start: 0;
    width: 2px;
    height: 20px;
    background: var(--border-strong);
  }
  .nav-item:disabled {
    background: transparent;
    color: var(--text-tertiary);
  }
</style>
