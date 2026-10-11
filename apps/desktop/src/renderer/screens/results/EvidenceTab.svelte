<script lang="ts">
  // «الأدلة» (13.3, 9.7; Figma 7.5 153:31347): every piece of evidence the run kept — the file, its check, its size,
  // its fingerprint, whether it holds redactions — and the note that it is kept locally and proven unchanged.
  import TableHeaderCell from '../../components/TableHeaderCell.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { shortHash, sizeText, type EvidenceRow } from '../../app/results.ts';

  interface Props {
    rows: readonly EvidenceRow[];
    /** Show one check's evidence only («الدليل» on its row). */
    checkId?: string | null;
  }
  let { rows, checkId = null }: Props = $props();
  const { t } = useLocale();
  const shown = $derived(checkId ? rows.filter((r) => r.checkId === checkId) : rows);
</script>

<div class="tab">
  {#if shown.length}
    <table class="evidence">
      <thead>
        <tr>
          <th class="c-file" scope="col"><TableHeaderCell label={t('resultsui.evidence.file')} sortable={false} /></th>
          <th class="c-check" scope="col"><TableHeaderCell label={t('resultsui.evidence.check')} sortable={false} /></th>
          <th class="c-size" scope="col"><TableHeaderCell label={t('resultsui.evidence.size')} sortable={false} /></th>
          <th class="c-hash" scope="col"><TableHeaderCell label={t('resultsui.evidence.hash')} sortable={false} /></th>
          <th class="c-red" scope="col"><TableHeaderCell label={t('resultsui.evidence.redactions')} sortable={false} overflow="start" /></th>
        </tr>
      </thead>
      <tbody>
        {#each shown as r (r.id)}
          <tr>
            <td class="mono" dir="ltr">{r.path}</td>
            <td class="mono" dir="ltr">{r.checkId}</td>
            <td class="small" dir="ltr">{sizeText(r.size)}</td>
            <td class="mono secondary" dir="ltr">{shortHash(r.sha256)}</td>
            <td class="small">{r.redacted ? t('resultsui.evidence.redacted') : t('resultsui.evidence.none')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">{t('resultsui.evidence.footer')}</p>
  {:else}
    <p class="note">{t('resultsui.evidence.empty')}</p>
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
  .c-file {
    inline-size: 260px;
  }
  .c-check {
    inline-size: 120px;
  }
  .c-size {
    inline-size: 90px;
  }
  .c-hash {
    inline-size: 200px;
  }
  .mono {
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .secondary {
    color: var(--text-secondary);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
