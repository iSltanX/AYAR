<script lang="ts">
  // Table group row (Figma 112:7977, C-17): 32 high, fills the table, padding 0 8, gap 8, a 1 px border/subtle
  // line under it. The disclosure chevron (16, text/secondary), the group title (body/strong) and its count
  // (numeric/live, text/secondary). Expanded = chevron-down; collapsed = chevron-left in Arabic and
  // chevron-right in English (it follows the reading direction). Hover = bg/sunken. The whole row is one toggle
  // button with aria-expanded, so the focus ring surrounds the row. A role=row: it lives inside Table.
  import { useLocale } from '../lib/locale.ts';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    count: number;
    expanded?: boolean;
    /** The id of the rows this group shows or hides (aria-controls). */
    controls?: string;
    ontoggle?: (expanded: boolean) => void;
  }
  let { title, count, expanded = $bindable(true), controls, ontoggle }: Props = $props();
  const { dir } = useLocale();
  const chevron = $derived(expanded ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right');

  function toggle() {
    expanded = !expanded;
    ontoggle?.(expanded);
  }
</script>

<div class="group-row" role="row">
  <span class="cell" role="cell">
    <button type="button" class="toggle" aria-expanded={expanded} aria-controls={controls} data-nav onclick={toggle}>
      <span class="disclosure"><Icon name={chevron} size={16} /></span>
      <span class="title">{title}</span>
      <span class="count">{count}</span>
    </button>
  </span>
</div>

<style>
  .group-row,
  .cell {
    display: flex;
    width: 100%;
    min-width: 0;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    width: 100%;
    height: 32px;
    margin: 0;
    padding: 0 var(--space-8);
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    border-radius: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: start;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .toggle:hover {
    background: var(--bg-sunken);
  }
  .disclosure {
    display: inline-flex;
    flex: none;
    color: var(--text-secondary);
  }
  .title {
    min-width: 0;
    font: var(--type-body-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    flex: none;
    font: var(--type-numeric-live);
    color: var(--text-secondary);
  }
</style>
