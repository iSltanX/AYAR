<script lang="ts">
  // Table, Kind=findings (Figma 112:8213, C-17; plan 9.17): bg/surface, fills its container. The header row (33 =
  // 32 + a 1 px border/strong line) holds the select-all checkbox (mixed when some rows are selected) and the
  // sortable Table header cells; then each group: a Table group row and, when expanded, its Finding rows. The
  // columns are ONE CSS grid shared by the header and the rows (lib/results.ts FINDING_GRID: fixed widths except
  // the title, DES-3 handoff). Multi-select: the selection is the finding ids; it sets the scope of the one
  // «انسخ للنموذج» button elsewhere and never adds a copy button. ARIA table semantics (columnheader with
  // aria-sort, rows, cells); ArrowUp/ArrowDown move the focus between rows and group toggles.
  import { useLocale } from '../lib/locale.ts';
  import { FINDING_COLUMNS, findingGrid, type FindingColumn, type FindingGroup, type SortDirection, type TableSort } from '../lib/results.ts';
  import Checkbox from './Checkbox.svelte';
  import FindingRow from './FindingRow.svelte';
  import TableGroupRow from './TableGroupRow.svelte';
  import TableHeaderCell from './TableHeaderCell.svelte';

  interface Props {
    /** The table's accessible name. */
    label: string;
    groups: readonly FindingGroup[];
    /** The selected finding ids. */
    selected?: string[];
    /** The ids of the collapsed groups. */
    collapsed?: string[];
    sort?: TableSort<FindingColumn>;
    onselectionchange?: (selected: string[]) => void;
    onsort?: (sort: TableSort<FindingColumn>) => void;
    /** Enter on a finding row. */
    onopen?: (id: string) => void;
  }
  let {
    label,
    groups,
    selected = $bindable([]),
    collapsed = $bindable([]),
    sort = $bindable(),
    onselectionchange,
    onsort,
    onopen,
  }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();
  let root: HTMLElement | undefined = $state();

  const allIds = $derived(groups.flatMap((g) => g.findings.map((f) => f.id)));
  const allState = $derived<boolean | 'mixed'>(
    selected.length === 0 ? false : allIds.every((id) => selected.includes(id)) ? true : 'mixed',
  );

  function setSelection(next: string[]) {
    selected = next;
    onselectionchange?.(next);
  }
  function selectAll(checked: boolean) {
    setSelection(checked && allState !== true ? [...allIds] : []);
  }
  function selectOne(id: string, checked: boolean) {
    setSelection(checked ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id));
  }
  function sortBy(column: FindingColumn, direction: SortDirection) {
    sort = { column, direction };
    onsort?.(sort);
  }
  function toggleGroup(id: string, expanded: boolean) {
    collapsed = expanded ? collapsed.filter((x) => x !== id) : [...collapsed, id];
  }
  function keydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(root?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])];
    const at = items.indexOf(e.target as HTMLElement);
    if (at === -1) return;
    const next = items[e.key === 'ArrowDown' ? at + 1 : at - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="table" role="table" aria-label={label} bind:this={root} onkeydown={keydown}>
  <div role="rowgroup">
    <div class="header-row" role="row" {@attach findingGrid}>
      <span class="select-all" role="columnheader">
        <Checkbox checked={allState} label={t('menu.edit.selectAll')} showLabel={false} onchange={selectAll} />
      </span>
      {#each FINDING_COLUMNS as column (column.id)}
        <TableHeaderCell
          fill
          label={t(column.key)}
          sort={sort?.column === column.id ? sort.direction : undefined}
          onsort={(direction: SortDirection) => sortBy(column.id, direction)}
        />
      {/each}
    </div>
  </div>
  {#each groups as group (group.id)}
    {@const expanded = !collapsed.includes(group.id)}
    <div class="group" role="rowgroup" id="{uid}-{group.id}">
      <TableGroupRow
        title={group.title}
        count={group.count ?? group.findings.length}
        {expanded}
        controls="{uid}-{group.id}"
        ontoggle={(open: boolean) => toggleGroup(group.id, open)}
      />
      {#if expanded}
        {#each group.findings as finding (finding.id)}
          <FindingRow
            {finding}
            selected={selected.includes(finding.id)}
            onselectchange={(checked: boolean) => selectOne(finding.id, checked)}
            onopen={() => onopen?.(finding.id)}
          />
        {/each}
      {/if}
    </div>
  {/each}
</div>

<style>
  .table {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    background: var(--bg-surface);
  }
  .header-row {
    display: grid;
    grid-template-columns: var(--finding-columns);
    column-gap: var(--space-8);
    align-items: center;
    height: 33px;
    padding: 0 var(--space-8);
    border-bottom: 1px solid var(--border-strong);
  }
  .select-all {
    display: flex;
    align-items: center;
  }
  .group {
    display: flex;
    flex-direction: column;
  }
</style>
