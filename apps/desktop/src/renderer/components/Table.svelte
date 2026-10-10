<script lang="ts">
  // Table, Kind=findings (Figma 112:8213, C-17; plan 9.17): bg/surface, fills its container. The header row (33 =
  // 32 + a 1 px border/strong line) holds the select-all checkbox (mixed when some rows are selected) and the
  // sortable Table header cells; then each group: a Table group row and, when expanded, its Finding rows. The
  // columns are ONE CSS grid shared by the header and the rows (--finding-columns on .findings-grid, defined in
  // FindingRow.svelte: fixed widths except the title, DES-3 handoff). Multi-select: the selection is the finding
  // ids; it sets the scope of the one «انسخ للنموذج» button elsewhere and never adds a copy button.
  // Keyboard (WAI-ARIA grid, row focus): the header's select-all and sort buttons are ordinary tab stops; the rows
  // (group toggles and finding rows) are ONE tab stop with a roving tabindex. ArrowUp/ArrowDown move between them,
  // Home/End go to the first and last; on a finding row Space selects and Enter opens; the forward arrow (Left in
  // Arabic, Right in English) moves into the row's checkbox and the back arrow returns to the row; on a group row
  // the forward arrow expands and the back arrow collapses. Rows carry aria-selected (aria-multiselectable grid).
  // The last column's header label runs back over its start rather than past the table's edge.
  import { useLocale } from '../lib/locale.ts';
  import { FINDING_COLUMNS, type FindingColumn, type FindingGroup, type SortDirection, type TableSort } from '../lib/results.ts';
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
  const { t, dir } = useLocale();
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

  // Roving tabindex over the row set: the keys of the group toggles and the visible finding rows, in order.
  const groupKey = (id: string) => `group:${id}`;
  const navKeys = $derived(
    groups.flatMap((g) => [groupKey(g.id), ...(collapsed.includes(g.id) ? [] : g.findings.map((f) => f.id))]),
  );
  let active: string | undefined = $state();
  const current = $derived(active !== undefined && navKeys.includes(active) ? active : navKeys[0]);

  function item(key: string | undefined): HTMLElement | null {
    return key === undefined ? null : (root?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(key)}"]`) ?? null);
  }
  function focusin(e: FocusEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
    if (el?.dataset.nav !== undefined) active = el.dataset.nav;
  }
  function keydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-nav]');
    const key = row?.dataset.nav;
    if (!row || key === undefined) return; // the header keeps its own keys
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const at = navKeys.indexOf(key);
    let to: string | undefined;
    if (e.key === 'ArrowDown') to = navKeys[at + 1];
    else if (e.key === 'ArrowUp') to = navKeys[at - 1];
    else if (e.key === 'Home' && target === row) to = navKeys[0];
    else if (e.key === 'End' && target === row) to = navKeys[navKeys.length - 1];
    else if ((e.key === forward || e.key === back) && key.startsWith('group:')) {
      const id = key.slice('group:'.length);
      if ((e.key === forward) === collapsed.includes(id)) toggleGroup(id, e.key === forward);
      e.preventDefault();
      return;
    } else if (e.key === forward && target === row) {
      const box = row.querySelector<HTMLElement>('input');
      if (box) {
        e.preventDefault();
        box.focus();
      }
      return;
    } else if (e.key === back && target !== row) {
      e.preventDefault();
      row.focus();
      return;
    }
    if (to === undefined) return;
    e.preventDefault();
    active = to;
    item(to)?.focus();
  }
</script>

<!-- The grid itself is not a tab stop: its rows hold the roving tab stop (WAI-ARIA grid, row focus). -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="table findings-grid" role="grid" aria-label={label} aria-multiselectable="true" bind:this={root} onkeydown={keydown} onfocusin={focusin}>
  <div role="rowgroup">
    <div class="header-row" role="row">
      <span class="select-all" role="columnheader">
        <Checkbox checked={allState} label={t('menu.edit.selectAll')} showLabel={false} onchange={selectAll} />
      </span>
      {#each FINDING_COLUMNS as column, i (column.id)}
        <TableHeaderCell
          fill
          overflow={i === FINDING_COLUMNS.length - 1 ? 'start' : 'end'}
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
        navKey={groupKey(group.id)}
        tabindex={groupKey(group.id) === current ? 0 : -1}
        ontoggle={(open: boolean) => toggleGroup(group.id, open)}
      />
      {#if expanded}
        {#each group.findings as finding (finding.id)}
          <FindingRow
            {finding}
            selected={selected.includes(finding.id)}
            inGrid
            tabindex={finding.id === current ? 0 : -1}
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
