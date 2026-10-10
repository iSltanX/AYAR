<script lang="ts">
  // Model claim row (Figma 117:10396, C-29; plan 9.29): a list row that fills its container (720 in Figma), at
  // least 40 high, padding 8, gap 12, radius/control. From the start side: the purple «ادعاء نموذج» tag
  // (message-square, the model-claim status class), then the note (body) over a meta line (gap 12): the claim id
  // (mono, text/tertiary), the location (mono, isolated left to right) and the matching local check id (mono) or
  // «لا فحص مقابل» (body/small); then the next step (body/small, text/secondary) and its one secondary button:
  // a claim with a local check → «تعالجها مباشرة» + «أثبِت بإعادة الفحص»; without → «تحتاج مراجعتك» + «راجع
  // وقرّر». After the decision its text replaces both. Hover = bg/sunken; the row takes keyboard focus. A claim
  // is never a result: no pass or fail badge, ever.
  import { useLocale } from '../lib/locale.ts';
  import { claimVariant, isolate, type ClaimDecision, type Location } from '../lib/results.ts';
  import Button from './Button.svelte';
  import LtrText from './LtrText.svelte';
  import PathText from './PathText.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    /** What the model claims, as its report says it. */
    note: string;
    /** The claim id, e.g. "AI-LOGIC-001.3". */
    claimId: string;
    location: Location;
    /** The id of the local check that can prove it, if any. */
    localCheck?: string;
    decision?: ClaimDecision;
    /** «أثبِت بإعادة الفحص» (with a local check). */
    onprove?: () => void;
    /** «راجع وقرّر» (no local check): opens the review sheet. */
    onreview?: () => void;
  }
  let { note, claimId, location, localCheck, decision, onprove, onreview }: Props = $props();
  const { t } = useLocale();
  const variant = $derived(claimVariant(localCheck, decision));
  const decisionText = $derived(
    decision === undefined
      ? undefined
      : decision.kind === 'card'
        ? t('results.claim.decidedCard', { card: isolate(decision.card) })
        : t('results.claim.decidedNotIssue', { date: isolate(decision.date) }),
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="claim-row" role="group" aria-label={note} tabindex="0" data-variant={variant}>
  <Tag kind="model-claim">{t('glossary.modelClaim')}</Tag>
  <div class="text">
    <span class="note" dir="auto">{note}</span>
    <span class="meta">
      <span class="claim-id"><LtrText text={claimId} mono /></span>
      <span class="location"><PathText path={location.path} line={location.line} /></span>
      {#if localCheck}
        <span class="local-check"><span class="mono" dir="ltr" title={localCheck}>{localCheck}</span></span>
      {:else}
        <span class="local-check"><span>{t('results.claim.noLocalCheck')}</span></span>
      {/if}
    </span>
  </div>
  <div class="next">
    {#if decisionText}
      <span class="small">{decisionText}</span>
    {:else if localCheck}
      <span class="small">{t('ui.nextStep.handleDirectly')}</span>
      <Button kind="secondary" onclick={onprove}>{t('ui.action.proveByRecheck')}</Button>
    {:else}
      <span class="small">{t('ui.nextStep.needsReview')}</span>
      <Button kind="secondary" onclick={onreview}>{t('ui.action.reviewAndDecide')}</Button>
    {/if}
  </div>
</div>

<style>
  .claim-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: var(--space-8);
    border-radius: var(--radius-control);
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .claim-row:hover {
    background: var(--bg-sunken);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 0;
    min-width: 0;
  }
  .note {
    font: var(--type-body);
    color: var(--text-primary);
    text-align: start;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    min-width: 0;
    height: 20px;
  }
  .claim-id {
    flex: none;
    color: var(--text-tertiary);
    white-space: nowrap;
  }
  .location {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    color: var(--text-secondary);
  }
  .local-check {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    color: var(--text-secondary);
  }
  .local-check > span {
    min-width: 0;
    font: var(--type-body-small);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .local-check > .mono {
    font: var(--type-mono);
    unicode-bidi: isolate;
  }
  .next {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    flex: none;
  }
  .small {
    font: var(--type-body-small);
    color: var(--text-secondary);
    white-space: nowrap;
  }
</style>
