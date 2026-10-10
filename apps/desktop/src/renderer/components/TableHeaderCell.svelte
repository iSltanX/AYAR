<script lang="ts">
  // Table header cell (Figma 112:7887, C-17): 32 high, padding 0 8, gap 4, radius/control, label style in
  // text/secondary. Sortable: hover = bg/sunken and arrow-up-down (text/tertiary) after the label; sorted =
  // label text/primary with chevron-up (ascending) or chevron-down (descending). The column header carries
  // aria-sort; its button takes the focus ring and toggles the order. In Table the cell fills its grid column
  // with no padding (`fill`, as the Figma table overrides it); its label is then never cut.
  import type { SortDirection } from '../lib/results.ts';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    sortable?: boolean;
    /** The current order of this column, if the table is sorted by it. */
    sort?: SortDirection;
    /** Fill the grid column, with no padding (inside Table). */
    fill?: boolean;
    /** Called with the new order: ascending first, then it toggles. */
    onsort?: (direction: SortDirection) => void;
  }
  let { label, sortable = true, sort, fill = false, onsort }: Props = $props();
  const ariaSort = $derived(sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined);
</script>

<div class="header-cell" class:fill role="columnheader" aria-sort={ariaSort}>
  {#if sortable}
    <button type="button" class="sort" class:sorted={sort !== undefined} onclick={() => onsort?.(sort === 'asc' ? 'desc' : 'asc')}>
      <span class="label">{label}</span>
      <span class="sort-icon" class:shown={sort !== undefined}>
        <Icon name={sort === 'asc' ? 'chevron-up' : sort === 'desc' ? 'chevron-down' : 'arrow-up-down'} size={16} />
      </span>
    </button>
  {:else}
    <span class="sort static"><span class="label">{label}</span></span>
  {/if}
</div>

<style>
  .header-cell {
    display: inline-flex;
    flex: none;
    min-width: 0;
  }
  .header-cell.fill {
    display: flex;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    min-width: 0;
    height: 32px;
    margin: 0;
    padding: 0 var(--space-8);
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-secondary);
    font: var(--type-label);
    white-space: nowrap;
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .fill .sort {
    flex: 1 1 auto;
    padding: 0;
  }
  .fill .label {
    overflow: visible; /* as in Figma: a label wider than its fixed column runs into the gap, never cut */
  }
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button.sort:hover {
    background: var(--bg-sunken);
  }
  .sort.sorted {
    color: var(--text-primary);
  }
  .sort-icon {
    display: none;
    flex: none;
    color: var(--text-tertiary);
  }
  .sort-icon.shown {
    display: inline-flex;
    color: var(--text-primary);
  }
  button.sort:hover .sort-icon {
    display: inline-flex;
  }
</style>
