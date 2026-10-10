<script lang="ts">
  // Sheet/Scoring details (Figma 115:9403, 720 wide): a table with one row per criterion (37 high: padding 6 8,
  // gap 12, a border/subtle line under it): the criterion (body, 180), its checks (Status symbol 12 + id in mono
  // text/secondary, gap 4; checks gap 12) and, at the end, its share («1 من 2 = 0.5», numeric/live). Then the
  // summary rows (24 high, gap 4): the key in body text/secondary at the start and the value in numeric/live at
  // the end: criteria, required checks, average of ratios, karat before → after rounding (← in Arabic, → in
  // English), blocking failures, pending reviews, excluded by review, open integrity items, not applicable / not
  // included with reasons, versions. Latin digits. Footer: «تم», which receives the focus.
  import { formatNumber } from '@ayar/i18n';
  import { useLocale } from '../lib/locale.ts';
  import type { ScoredCriterion, ScoringSummary, SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props extends SheetMode {
    criteria: readonly ScoredCriterion[];
    summary: ScoringSummary;
  }
  let { criteria, summary, open, inline, oncancel }: Props = $props();
  const { t, lang } = useLocale();

  const num = (n: number) => formatNumber(n, lang, { maximumFractionDigits: 2 });
  /** Version strings stay left to right inside an Arabic sentence (isolates LRI … PDI). */
  const [LRI, PDI] = [String.fromCharCode(0x2066), String.fromCharCode(0x2069)];
  const ltr = (s: string) => LRI + s + PDI;
  const rows = $derived([
    ['sheets.scoring.criteria', num(summary.criteria)],
    ['sheets.scoring.requiredChecks', num(summary.requiredChecks)],
    ['sheets.scoring.average', num(summary.average)],
    ['sheets.scoring.karat', t('sheets.scoring.karatValue', { raw: num(summary.karatRaw), rounded: num(summary.karat) })],
    ['sheets.scoring.blockingFailures', summary.blockingFailures === 0 ? t('sheets.scoring.none') : num(summary.blockingFailures)],
    ['sheets.scoring.pendingReviews', num(summary.pendingReviews)],
    ['sheets.scoring.excludedByReview', num(summary.excludedByReview)],
    ['sheets.scoring.openIntegrityItems', num(summary.openIntegrityItems)],
    ['sheets.scoring.notApplicable', t('sheets.scoring.notApplicableValue', { count: num(summary.notApplicable) })],
    ['sheets.scoring.versions', t('sheets.scoring.versionsValue', { app: ltr(summary.appVersion), catalog: ltr(summary.catalogVersion) })],
  ] as const);
</script>

<Sheet title={t('sheets.scoring.title')} width="wide" {open} {inline} {oncancel}>
  <table class="criteria">
    <thead class="visually-hidden">
      <tr>
        <th scope="col">{t('sheets.scoring.column.criterion')}</th>
        <th scope="col">{t('sheets.scoring.column.checks')}</th>
        <th scope="col">{t('sheets.scoring.column.share')}</th>
      </tr>
    </thead>
    <tbody>
      {#each criteria as c, i (i)}
        <tr>
          <th scope="row" class="criterion">{c.name}</th>
          <td class="checks">
            <span class="check-list">
              {#each c.checks as check (check.id)}
                <span class="check">
                  <StatusSymbol symbol={check.result} size={12} alone />
                  <code class="id" dir="ltr">{check.id}</code>
                </span>
              {/each}
            </span>
          </td>
          <td class="share">{t('sheets.scoring.share', { passed: num(c.passed), total: num(c.total), ratio: num(c.total ? c.passed / c.total : 0) })}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <dl class="summary">
    {#each rows as [key, value] (key)}
      <div class="row">
        <dt>{t(key)}</dt>
        <dd>{value}</dd>
      </div>
    {/each}
  </dl>
  {#snippet footer()}
    <Button kind="primary" data-initial-focus onclick={oncancel}>{t('sheets.scoring.done')}</Button>
  {/snippet}
</Sheet>

<style>
  .criteria {
    inline-size: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }
  .criteria th,
  .criteria td {
    padding: 6px 0;
    border-block-end: 1px solid var(--border-subtle);
    text-align: start;
    vertical-align: middle;
  }
  .criteria .criterion {
    inline-size: 180px;
    padding-inline: var(--space-8) var(--space-12);
    font: var(--type-body);
    color: var(--text-primary);
  }
  .criteria .checks {
    padding-inline-end: var(--space-12);
  }
  .check-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-12);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
  }
  .id {
    font: var(--type-mono);
    color: var(--text-secondary);
    unicode-bidi: isolate;
  }
  .criteria .share {
    inline-size: 1%;
    padding-inline-end: var(--space-8);
    font: var(--type-numeric-live);
    color: var(--text-primary);
    text-align: end;
    white-space: nowrap;
  }
  .summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    min-block-size: 24px;
  }
  dt {
    font: var(--type-body);
    color: var(--text-secondary);
  }
  dd {
    margin: 0;
    font: var(--type-numeric-live);
    color: var(--text-primary);
  }
</style>
