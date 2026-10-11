<script lang="ts">
  // Section card on the Overview (Figma 106:3951, C-09; plan 9.9): bg/surface, a 1 px border/subtle edge,
  // radius/card, padding 16, gap 12; 344 wide in Figma, it fills its container. The header is the section name
  // (title/sub). default: Section karat (DES-2: dial, karat, «من 24», «جزئي» and the scope), the latest result
  // counts (Status symbol 12 + Latin digits in numeric/live, gap 12), the readiness gaps (body/small) and «افتح».
  // integrity: no karat; «يمنع حكم ‹نقي›: N» (body/strong) and the open items. model-checks: the «بنموذجك» cost
  // tag in the header, then needs, generated instructions, reports received and unresolved claims; never a
  // pass or fail. The card itself is not a button: «افتح» (secondary, at the end) is its only action.
  import { useLocale } from '../lib/locale.ts';
  import {
    SECTION_COUNT_ORDER,
    type ModelCheckMetrics,
    type ReadinessGaps,
    type SectionCardVariant,
    type SectionCounts,
  } from '../lib/results.ts';
  import Button from './Button.svelte';
  import CostTag from './CostTag.svelte';
  import SectionKarat from './SectionKarat.svelte';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props {
    variant?: SectionCardVariant;
    /** The section name in the UI language. */
    name: string;
    /** default: the section karat 0..24 (null: no measurable scope, never shown as 0) and its required criteria. */
    karat?: number | null;
    criteria?: number;
    /** default: the latest result counts; zero counts are left out. */
    counts?: SectionCounts;
    /** default and integrity: what is missing before the section can run fully. */
    readiness?: ReadinessGaps;
    /** integrity: how many open items prevent a «Pure» verdict, and what they are. */
    blocksPure?: number;
    openItems?: string;
    /** model-checks: the four figures. */
    metrics?: ModelCheckMetrics;
    /** default: a line in place of the section karat (DES-4: «لم يُشغَّل بعد», «لا معيار مطلوب في هذا القسم، فلا عيار له»). */
    note?: string;
    /** «افتح» unavailable (the page it opens is not built yet). */
    disabled?: boolean;
    onopen?: () => void;
  }
  let {
    variant = 'default',
    name,
    karat = null,
    criteria = 0,
    counts = {},
    readiness,
    blocksPure = 0,
    openItems,
    metrics = { needs: 0, generated: 0, reports: 0, unresolved: 0 },
    note,
    disabled = false,
    onopen,
  }: Props = $props();
  const { t } = useLocale();

  const shownCounts = $derived(SECTION_COUNT_ORDER.filter((r) => (counts[r] ?? 0) > 0).map((r) => [r, counts[r]!] as const));
  const gaps = $derived.by(() => {
    if (!readiness) return undefined;
    const parts: string[] = [];
    if (readiness.setup > 0) parts.push(t('results.sectionCard.setupGaps', { count: readiness.setup }));
    if (readiness.approval > 0) parts.push(t('results.sectionCard.approvalGaps', { count: readiness.approval }));
    return parts.length ? t('results.sectionCard.readiness', { gaps: parts.join(' · ') }) : undefined;
  });
  const metricRows = $derived([
    { key: 'results.sectionCard.needs', value: metrics.needs },
    { key: 'glossary.generatedInstructions', value: metrics.generated },
    { key: 'results.sectionCard.reports', value: metrics.reports },
    { key: 'results.sectionCard.unresolved', value: metrics.unresolved },
  ] as const);
</script>

<section class="section-card" data-variant={variant} aria-label={name}>
  <header class="header">
    <h3 class="name">{name}</h3>
    {#if variant === 'model-checks'}<CostTag cost="model" />{/if}
  </header>

  {#if variant === 'default'}
    {#if note}<p class="small">{note}</p>{:else}<SectionKarat value={karat} {criteria} />{/if}
    <ul class="counts" aria-label={t('results.sectionCard.counts')}>
      {#each shownCounts as [result, count] (result)}
        <li class="count"><StatusSymbol symbol={result} size={12} alone /><span class="number">{count}</span></li>
      {/each}
    </ul>
  {:else if variant === 'integrity'}
    <p class="blocks-pure">{t('results.sectionCard.blocksPure', { count: blocksPure })}</p>
    {#if openItems}<p class="small">{openItems}</p>{/if}
  {:else}
    <dl class="metrics">
      {#each metricRows as row (row.key)}
        <div class="metric"><dt>{t(row.key)}</dt><dd>{row.value}</dd></div>
      {/each}
    </dl>
  {/if}

  {#if gaps && variant !== 'model-checks'}<p class="small">{gaps}</p>{/if}

  <footer class="footer">
    <Button kind="secondary" {disabled} aria-label={t('results.sectionCard.openNamed', { name })} onclick={onopen}>{t('results.sectionCard.open')}</Button>
  </footer>
</section>

<style>
  .section-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    width: 100%;
    min-width: 0;
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    min-height: 24px;
  }
  h3,
  p,
  ul,
  dl,
  dd {
    margin: 0;
    padding: 0;
  }
  .name {
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .counts {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    height: 20px;
    list-style: none;
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
  }
  .number {
    font: var(--type-numeric-live);
    color: var(--text-primary);
  }
  .blocks-pure {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .metrics {
    display: contents;
  }
  .metric {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    height: 24px;
  }
  dt {
    font: var(--type-body);
    color: var(--text-secondary);
  }
  dd {
    font: var(--type-numeric-live);
    color: var(--text-primary);
  }
  .footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
