<script module lang="ts">
  import type { Result } from '../lib/status.ts';

  export interface StatusCount {
    result: Result;
    count: number;
  }
  export interface BlockingFailure {
    /** The check id, shown left-to-right in mono. */
    id: string;
    /** The check name. */
    name: string;
  }
</script>

<script lang="ts">
  // Purity card (Figma 72:1070, DES-2 6.5, plan 11.5; D-DES2-07, D-DES2-08): the verdict, the karat in its dial,
  // the scope, the counts by status, the round and the "Calculation details" link. 400 wide, padding 24 inside a
  // 1 px border/subtle, gap 16, radius/card, bg/surface. The project karat never shows without its verdict and
  // scope. Variants come from the data:
  //   incomplete: the "missing for Pure" line; blocked: the blocking failures listed before the number;
  //   stale: the "Stale" tag and line, a muted dial and number (no transparency, D-DES2-08) and "Start full scan";
  //   integrity hold: the verdict stays incomplete even at 24; no scope (karat null): no number, "No scope" in the
  //   dial, never pure; narrow scope: the "Narrow scope: n criteria" tag under the scope.
  import { useLocale } from '../lib/locale.ts';
  import type { Verdict } from '../lib/status.ts';
  import Button from './Button.svelte';
  import KaratDial from './KaratDial.svelte';
  import StatusSymbol from './StatusSymbol.svelte';
  import Tag from './Tag.svelte';
  import VerdictBadge from './VerdictBadge.svelte';

  interface Props {
    verdict: Verdict;
    /** The project karat 0..24, or null when there is no measurable scope. */
    karat: number | null;
    /** Required criteria and checks in the scope. */
    criteria: number;
    checks: number;
    /** Counts by status, in display order. */
    counts: readonly StatusCount[];
    /** The round id (ROUND-007) and its date, already formatted for the language. */
    roundId: string;
    roundDate: string;
    /** Incomplete: what is missing for "Pure", by status. */
    missing?: readonly StatusCount[];
    /** Blocked: the failed blocking checks, listed before the number. */
    blocking?: readonly BlockingFailure[];
    /** Open integrity items that hold back "Pure" (the verdict stays incomplete). */
    integrityHold?: number;
    /** From an earlier round, the code has changed since (a partial re-check followed an edit). */
    stale?: boolean;
    /** Shows the "Narrow scope" tag (one or two criteria). */
    narrowScope?: boolean;
    ondetails?: () => void;
    onfullscan?: () => void;
  }
  let {
    verdict, karat, criteria, checks, counts, roundId, roundDate, missing = [], blocking = [], integrityHold = 0,
    stale = false, narrowScope = false, ondetails, onfullscan,
  }: Props = $props();
  const { t } = useLocale();

  const line = $derived.by((): { text: string; strong: boolean } | undefined => {
    if (karat === null) return { text: t('status.purity.noMeasurableScope'), strong: false };
    if (integrityHold > 0) return { text: t('status.purity.integrityHold', { count: integrityHold }), strong: true };
    if (missing.length > 0) {
      const items = missing.map((m) => `${t(`status.result.${m.result}`)} ${m.count}`).join(' · ');
      return { text: t('status.purity.missingFor', { items }), strong: false };
    }
    return undefined;
  });
  const scopeValue = $derived(
    criteria === 0 ? t('status.purity.noRequiredCriteria') : t('status.purity.scopeValue', { criteria, checks }),
  );
</script>

<article class="card" class:stale data-verdict={verdict}>
  <header class="header">
    <h3 class="title">{t('glossary.purityIndex')}</h3>
    <span class="round">
      <span class="round-id" dir="ltr">{roundId}</span>
      <span class="round-date">{roundDate}</span>
    </span>
  </header>

  {#if stale}
    <div class="stale-row">
      <Tag>{t('ui.marker.stale')}</Tag>
      <span class="stale-line">{t('status.purity.staleLine')}</span>
    </div>
  {/if}

  <div class="verdict">
    <VerdictBadge {verdict} />
    {#if line}<p class="verdict-line" class:strong={line.strong}>{line.text}</p>{/if}
  </div>

  {#if verdict === 'blocked' && blocking.length > 0}
    <div class="blocking">
      <p class="blocking-title">{t('status.purity.blockingFailures', { count: blocking.length })}</p>
      <ul class="blocking-list">
        {#each blocking as item (item.id)}
          <li class="blocking-item">
            <StatusSymbol symbol="failed" size={12} />
            <span class="check-name">{item.name}</span>
            <span class="check-id" dir="ltr">{item.id}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="measure">
    <KaratDial value={karat} size="lg" tone={stale ? 'muted' : 'default'} alone={false}>
      {#if karat === null}
        <span class="no-scope">{t('status.karat.noScope')}</span>
      {:else}
        <span class="karat-number">{karat}</span>
        <span class="karat-of">{t('status.karat.outOf', { total: 24 })}</span>
      {/if}
    </KaratDial>
    <div class="info">
      <div class="scope">
        <span class="scope-label">{t('status.purity.scope')}</span>
        <span class="scope-value">{scopeValue}</span>
        {#if narrowScope}<Tag>{t('status.tag.narrowScope', { count: criteria })}</Tag>{/if}
      </div>
      <ul class="counts" aria-label={t('status.purity.counts')}>
        {#each counts as c (c.result)}
          <li class="count-row">
            <StatusSymbol symbol={c.result} size={12} />
            <span class="count-status">{t(`status.result.${c.result}`)}</span>
            <span class="count">{c.count}</span>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <footer class="footer">
    <button type="button" class="details" onclick={ondetails}>{t('status.purity.calculationDetails')}</button>
    {#if stale}<Button kind="primary" onclick={onfullscan}>{t('ui.action.startFullScan')}</Button>{/if}
  </footer>
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-16);
    width: 400px;
    max-width: 100%;
    padding: var(--space-24);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    color: var(--text-primary);
  }
  p,
  ul,
  h3 {
    margin: 0;
    padding: 0;
  }
  ul {
    list-style: none;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    align-self: stretch;
    height: 24px;
  }
  .title {
    font: var(--type-title-sub);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .round {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    overflow: hidden;
    white-space: nowrap;
    color: var(--text-tertiary);
  }
  .round-id {
    font: var(--type-mono);
    unicode-bidi: isolate;
  }
  .round-date {
    font: var(--type-body-small);
  }
  .stale-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    height: 20px;
  }
  .stale-line,
  .verdict-line {
    font: var(--type-body-small);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .verdict {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
  }
  .verdict-line.strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .blocking {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
  }
  .blocking-title {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .blocking-list {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
  }
  .blocking-item {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    height: 20px;
    white-space: nowrap;
  }
  .check-name {
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .check-id {
    font: var(--type-mono);
    color: var(--text-secondary);
    unicode-bidi: isolate;
  }
  .measure {
    display: flex;
    align-items: center;
    gap: var(--space-24);
    align-self: stretch;
  }
  .karat-number {
    font: var(--type-display-karat);
    color: var(--text-primary);
  }
  .karat-of {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .stale .karat-number {
    color: var(--text-secondary);
  }
  .stale .karat-of {
    color: var(--text-tertiary);
  }
  .no-scope {
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
  .info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-12);
    flex: 1;
    min-width: 0;
  }
  .scope {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }
  .scope-label {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .scope-value {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .counts {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }
  .count-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 20px;
    white-space: nowrap;
  }
  .count-status {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .count {
    font: var(--type-numeric-live);
    color: var(--text-primary);
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-12);
    align-self: stretch;
  }
  .details {
    position: relative;
    height: 20px;
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-label);
    color: var(--text-primary);
    text-decoration: underline;
    cursor: default;
  }
  /* A 28 px hit target around the 20 px link without moving the layout (plan 16.6). */
  .details::after {
    content: '';
    position: absolute;
    inset: -4px 0;
  }
</style>
