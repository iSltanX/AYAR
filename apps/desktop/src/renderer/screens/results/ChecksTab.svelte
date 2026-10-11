<script lang="ts">
  // «الفحوص» (13.3; Figma 7.4 153:30726): each execution of the run as a Check row with its result, then its reason
  // line — why it came out so (a reviewed result names the automatic one, G-17) — with «الدليل» and, for a result
  // that needs a decision, «سجّل مراجعة».
  import type { CheckRunDetail, PlanItem } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CheckRow from '../../components/CheckRow.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { badgeOf, checkTitle, clockMs, costOf, reasonText, resultOf, sectionOfCheck, sectionRank } from '../../app/format.ts';

  interface Props {
    checks: readonly CheckRunDetail[];
    items: ReadonlyMap<string, PlanItem>;
    order: ReadonlyMap<string, number>;
    onopen?: (checkRunId: string) => void;
    onlog?: (checkRunId: string) => void;
    onevidence?: (checkRunId: string) => void;
    onreview?: (checkRunId: string) => void;
  }
  let { checks, items, order, onopen, onlog, onevidence, onreview }: Props = $props();
  const { t, lang } = useLocale();

  const rows = $derived(
    checks
      .filter((c) => c.outcome && c.outcome !== 'not_applicable')
      .toSorted((a, b) => sectionRank(items.get(a.instance)?.section ?? sectionOfCheck(a.checkId)) - sectionRank(items.get(b.instance)?.section ?? sectionOfCheck(b.checkId)) || (order.get(a.instance) ?? 1e6) - (order.get(b.instance) ?? 1e6)),
  );
  let selected = $state<string[]>([]);

  function reasonOf(c: CheckRunDetail): string {
    if (c.reviewId && c.autoOutcome && c.autoOutcome !== c.outcome) return t('resultsui.check.reviewed', { auto: t(`status.result.${resultOf(c.autoOutcome)}`) });
    return reasonText(t, lang, c.outcomeReason);
  }
</script>

<div class="checks">
  {#each rows as c (c.checkRunId)}
    <div class="check">
      <CheckRow
        status={badgeOf(c.outcome!, { reviewed: !!c.reviewId, reason: c.outcomeReason })}
        name={checkTitle(t, lang, c.checkId)}
        id={c.checkId}
        cost={costOf(items.get(c.instance)?.needs.network)}
        duration={c.durationMs !== null ? clockMs(c.durationMs) : undefined}
        ran={c.startedAt !== null}
        selected={selected.includes(c.checkRunId)}
        onselectchange={(on: boolean) => (selected = on ? [...selected, c.checkRunId] : selected.filter((x) => x !== c.checkRunId))}
        onopen={() => onopen?.(c.checkRunId)}
        onlog={() => onlog?.(c.checkRunId)}
      />
      <div class="reason">
        <p class="text">{reasonOf(c)}</p>
        {#if c.outcome === 'needs_review'}<Button kind="secondary" onclick={() => onreview?.(c.checkRunId)}>{t('ui.action.recordReview')}</Button>{/if}
        {#if c.evidence.length || c.raw?.logs.stdout || c.raw?.reports.length}<Button kind="quiet" onclick={() => onevidence?.(c.checkRunId)}>{t('resultsui.check.evidence')}</Button>{/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .checks {
    display: flex;
    flex-direction: column;
  }
  .check {
    display: flex;
    flex-direction: column;
    border-block-end: 1px solid var(--border-subtle);
  }
  .reason {
    display: flex;
    align-items: flex-start;
    gap: var(--space-8);
    padding: 0 var(--space-48) 10px;
  }
  .text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
