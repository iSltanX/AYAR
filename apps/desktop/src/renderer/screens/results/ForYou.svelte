<script lang="ts">
  // «لك» (12.2; Figma 7.1 153:29425 «ماذا حدث», 153:29505 «ماذا أفعل الآن», «المشكلات وأثرها», «ما اجتاز»,
  // «حدود هذه النتيجة»): the report's human reading, drawn from the same `report/1` and the same message keys as its
  // «لك» text, so the page never says what the copied report denies (12.1). The summary card (what happened, what
  // it means, the terms with their meanings), the four next steps each with its one button, the problems with
  // their impact, what passed and what it proved, and the limits of the result.
  import type { PurityResult, Report } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import LtrText from '../../components/LtrText.svelte';
  import Severity from '../../components/Severity.svelte';
  import Term from '../../components/Term.svelte';
  import { formatDuration } from '@ayar/i18n';
  import { useLocale } from '../../lib/locale.ts';
  import { checkTitle, countsInOrder, reasonText } from '../../app/format.ts';
  import { limitLines, nextSteps, passedLines, problemLines, type NextItem } from '../../app/results.ts';

  interface Props {
    report: Report;
    purity: PurityResult | null;
    /** A direct step's button (setup, approve, define, install, recheck). */
    ondirect?: (item: NextItem) => void;
    /** «حدّد للنسخ»: adds the finding to the copy's selection. */
    onselect?: (findingId: string) => void;
    /** «راجع وقرّر». */
    onreview?: (item: NextItem) => void;
  }
  let { report, purity, ondirect, onselect, onreview }: Props = $props();
  const { t, lang } = useLocale();

  const h = $derived(report.head);
  const total = $derived(Object.values(h.counts).reduce((a, b) => a + (b ?? 0), 0));
  const countsText = (by: Partial<Record<string, number>>) =>
    countsInOrder(by)
      .filter((x) => x.result !== 'not-applicable')
      .map((x) => `${t(`status.result.${x.result}`)} ${x.count}`)
      .join(' · ');
  const happened = $derived(
    [
      t('report.human.happened', { count: total, duration: h.run?.durationMs !== null && h.run?.durationMs !== undefined ? formatDuration(h.run.durationMs, lang) : t('report.unknown'), checkWord: t('glossary.check'), run: h.run?.displayId ?? report.displayId }),
      countsText(h.counts) ? `${countsText(h.counts)}.` : '',
      h.counts.not_applicable ? t('report.human.notApplicable', { count: h.counts.not_applicable }) : '',
      purity && purity.checksCount ? t('resultsui.forYou.scope', { checks: purity.checksCount, counts: countsText(purity.counts.byOutcome) }) : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  const meaning = $derived.by(() => {
    const blocking = report.checks.filter((c) => c.blocking && c.outcome === 'failed');
    const setup = report.notRun.filter((n) => n.outcome === 'missing').length;
    if (h.verdict === 'blocked')
      return t('report.human.meaning.blocked', { checks: blocking.map((c) => checkTitle(t, lang, c.checkId)).join(t('report.human.and')) || '—', karat: h.karat ?? 0, blockingWord: t('glossary.blocking'), setup });
    if (h.verdict === 'pure') return t('report.human.meaning.pure', { karatWord: t('glossary.karat'), criteria: h.scope.criteria });
    if (h.verdict === 'incomplete') {
      const reasons = (report.purity?.incompleteReasons ?? []).map((r) => reasonText(t, lang, r)).filter(Boolean).slice(0, 6);
      return t('report.human.meaning.incomplete', { karat: h.karat ?? 0, reasons: reasons.join('؛ ') || t('report.unknown'), setup });
    }
    return t('report.human.meaning.none', { kind: h.scope.kind });
  });

  /** The terms the summary uses, each with its meaning (Term, shown here at its first appearance). */
  const terms = $derived.by(() => {
    const list: { word: string; meaning: string }[] = [];
    if (h.verdict) list.push({ word: t(`glossary.verdict.${h.verdict}`), meaning: t(`resultsui.term.${h.verdict}`) });
    if (h.verdict === 'blocked') list.push({ word: t('glossary.blocking'), meaning: t('report.hint.blocking') });
    list.push({ word: t('glossary.standardsProfile'), meaning: t('resultsui.term.standardsProfile') });
    if (h.karat !== null) list.push({ word: t('glossary.karat'), meaning: t('report.hint.karat') });
    return list;
  });

  const steps = $derived(nextSteps(t, lang, report));
  const problems = $derived(problemLines(t, lang, report));
  const passed = $derived(passedLines(t, lang, report));
  const limits = $derived(limitLines(t, lang, report));
  const buttonOf = (item: NextItem) => t(`report.button.${item.action ?? 'setup'}`);
</script>

<div class="for-you">
  <section class="card summary" aria-labelledby="fy-happened">
    <h2 class="eyebrow" id="fy-happened">{t('ui.report.whatHappened')}</h2>
    <p class="body">{happened}</p>
    <h2 class="eyebrow">{t('ui.report.whatItMeans')}</h2>
    <p class="body strong">{meaning}</p>
    <div class="terms">
      <span class="small secondary">{t('resultsui.forYou.terms')}</span>
      {#each terms as term (term.word)}<Term term={term.word} meaning={term.meaning}>{term.word}</Term>{/each}
    </div>
  </section>

  <section class="block" aria-labelledby="fy-todo">
    <h2 class="section-title" id="fy-todo">{t('ui.report.whatToDoNow')}</h2>
    {#if steps.direct.length}
      <div class="group">
        <h3 class="group-head"><Icon name="hand" size={20} /><span>{t('ui.nextStep.handleDirectly')}</span></h3>
        {#each steps.direct as item (item.key)}
          <div class="step-row">
            <div class="step-text"><span class="body">{item.text}</span><span class="ref"><LtrText text={item.ref} mono /></span></div>
            <Button kind="secondary" onclick={() => ondirect?.(item)}>{buttonOf(item)}</Button>
          </div>
        {/each}
      </div>
    {/if}
    {#if steps.model.length}
      <div class="group">
        <h3 class="group-head"><Icon name="sparkles" size={20} /><span>{t('ui.nextStep.needsModel')}</span></h3>
        {#each steps.model as item (item.key)}
          <div class="step-row">
            <div class="step-text"><span class="body">{item.text}</span><span class="ref"><LtrText text={item.ref} mono /></span></div>
            <Button kind="secondary" onclick={() => item.findingId && onselect?.(item.findingId)}>{t('ui.action.selectForCopy')}</Button>
          </div>
        {/each}
      </div>
    {/if}
    {#if steps.review.length}
      <div class="group">
        <h3 class="group-head"><Icon name="user" size={20} /><span>{t('ui.nextStep.needsReview')}</span></h3>
        {#each steps.review as item (item.key)}
          <div class="step-row">
            <div class="step-text"><span class="body">{item.text}</span><span class="ref"><LtrText text={item.ref} mono /></span></div>
            <Button kind="secondary" onclick={() => onreview?.(item)}>{t('ui.action.reviewAndDecide')}</Button>
          </div>
        {/each}
      </div>
    {/if}
    {#if steps.none}
      <div class="group">
        <h3 class="group-head"><Icon name="info" size={20} /><span>{t('ui.nextStep.nothingRequired')}</span></h3>
        <div class="step-row"><span class="body">{steps.none}</span></div>
      </div>
    {/if}
  </section>

  <section class="block" aria-labelledby="fy-problems">
    <h2 class="section-title" id="fy-problems">{t('resultsui.problems')}</h2>
    {#each problems as p (p.id)}
      <p class="problem"><Severity severity={p.severity} /><span class="body">{p.text}</span></p>
    {:else}
      <p class="body">{t('report.human.problems.none')}</p>
    {/each}
  </section>

  <section class="block" aria-labelledby="fy-passed">
    <h2 class="section-title" id="fy-passed">{t('report.human.passed.heading')}</h2>
    {#each passed as line, i (i)}<p class="body">{line}</p>{:else}<p class="body">{t('report.human.passed.none')}</p>{/each}
  </section>

  <section class="block" aria-labelledby="fy-limits">
    <h2 class="section-title" id="fy-limits">{t('ui.report.limits')}</h2>
    {#each limits as line, i (i)}<p class="body">{line}</p>{:else}<p class="body">{t('report.human.limits.none')}</p>{/each}
  </section>
</div>

<style>
  .for-you {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  .eyebrow {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .body {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .strong {
    font: var(--type-body-strong);
  }
  .small {
    font: var(--type-body-small);
  }
  .secondary {
    color: var(--text-secondary);
  }
  .terms {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .block > .body {
    margin-block-start: -2px;
  }
  .section-title {
    font: var(--type-title-section);
    color: var(--text-primary);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-block-start: var(--space-8);
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .step-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .step-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .ref {
    font: var(--type-mono);
    color: var(--text-secondary);
  }
  .problem {
    display: flex;
    align-items: baseline;
    gap: var(--space-8);
  }
</style>
