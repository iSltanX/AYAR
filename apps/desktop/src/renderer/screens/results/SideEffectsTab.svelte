<script lang="ts">
  // «الآثار الجانبية» (FR-36, 9.9, AT-34; Figma 7.6 153:32008): what each execution created, changed or deleted in
  // the project folder — a folder collapsed into one row when several files under it changed alike — with a
  // tracked source file changed outside the declared outputs named as such, and the note on writing.
  import TableHeaderCell from '../../components/TableHeaderCell.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { SideEffectRow } from '../../app/results.ts';

  let { rows }: { rows: readonly SideEffectRow[] } = $props();
  const { t } = useLocale();

  function changeText(r: SideEffectRow): string {
    if (r.files > 1) return t(`resultsui.effects.${r.change}Many`, { count: r.files });
    return t(`resultsui.effects.${r.change}`);
  }
  function noteText(r: SideEffectRow): string {
    if (r.tracked) return t('resultsui.effects.tracked');
    if (r.declared) return t('resultsui.effects.declared');
    return '';
  }
</script>

<div class="tab">
  {#if rows.length}
    <table>
      <thead>
        <tr>
          <th class="c-path" scope="col"><TableHeaderCell native label={t('resultsui.effects.path')} sortable={false} /></th>
          <th class="c-change" scope="col"><TableHeaderCell native label={t('resultsui.effects.change')} sortable={false} /></th>
          <th class="c-check" scope="col"><TableHeaderCell native label={t('resultsui.effects.check')} sortable={false} /></th>
          <th class="c-inside" scope="col"><TableHeaderCell native label={t('resultsui.effects.inside')} sortable={false} /></th>
          <th class="c-note" scope="col"><TableHeaderCell native label={t('resultsui.effects.note')} sortable={false} overflow="start" /></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.key)}
          <tr class:tracked={r.tracked}>
            <td class="mono" dir="ltr">{r.path}</td>
            <td class="small">{changeText(r)}</td>
            <td class="mono" dir="ltr">{r.checkId}</td>
            <td class="small">{t('resultsui.effects.yes')}</td>
            <td class="small">{noteText(r)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">{t('resultsui.effects.footer')}</p>
  {:else}
    <p class="note">{t('resultsui.effects.empty')}</p>
  {/if}
</div>

<style>
  .tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }
  table {
    inline-size: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    padding: 0;
    border-block-end: 1px solid var(--border-strong);
    text-align: start;
    font-weight: inherit;
  }
  td {
    padding: var(--space-8) 0;
    padding-inline-end: var(--space-12);
    border-block-end: 1px solid var(--border-subtle);
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  td[dir='ltr'] {
    text-align: end;
  }
  :global([dir='ltr']) td[dir='ltr'] {
    text-align: start;
  }
  tr.tracked td {
    font-weight: 700;
  }
  .c-path {
    inline-size: 300px;
  }
  .c-change {
    inline-size: 140px;
  }
  .c-check {
    inline-size: 150px;
  }
  .c-inside {
    inline-size: 120px;
  }
  .mono {
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
