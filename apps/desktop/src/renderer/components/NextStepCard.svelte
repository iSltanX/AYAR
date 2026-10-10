<script lang="ts">
  // Next step card, "What to do now" (Figma 110:6954, C-25; plan 9.25): bg/surface, border/subtle,
  // radius/card, padding 16, gap 8. The eyebrow (label, text/tertiary), a Lucide 20 icon in ink and the title
  // (title/sub), the impact sentence (body, text/secondary), then ONE secondary button, or in the inspector for a
  // needs-model finding the hint to copy with the button above, or for nothing-required the reason line. No
  // status colour and no result symbol.
  import type { LucideName } from '../design/icons.generated.ts';
  import type { DirectAction, NextStepKind } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    kind: NextStepKind;
    /** The impact sentence, in plain words. */
    impact: string;
    /** For handle-directly: which one action the button takes. */
    action?: DirectAction;
    /** For nothing-required: why nothing is required. */
    reason?: string;
    onaction?: () => void;
  }
  let { kind, impact, action = 'setUp', reason, onaction }: Props = $props();
  const { t } = useLocale();

  const KINDS = {
    'handle-directly': { icon: 'hand', title: 'ui.nextStep.handleDirectly' },
    'needs-model': { icon: 'sparkles', title: 'ui.nextStep.needsModel' },
    'needs-model-inspector': { icon: 'sparkles', title: 'ui.nextStep.needsModel' },
    'needs-review': { icon: 'user', title: 'ui.nextStep.needsReview' },
    'nothing-required': { icon: 'info', title: 'ui.nextStep.nothingRequired' },
  } as const satisfies Record<NextStepKind, { icon: LucideName; title: string }>;
  const spec = $derived(KINDS[kind]);
  const buttonLabel = $derived(
    kind === 'handle-directly'
      ? t(`ui.action.${action}`)
      : kind === 'needs-model'
        ? t('ui.action.selectForCopy')
        : kind === 'needs-review'
          ? t('ui.action.reviewAndDecide')
          : undefined,
  );
</script>

<div class="next-step" data-kind={kind}>
  <p class="eyebrow">{t('ui.report.whatToDoNow')}</p>
  <p class="header"><Icon name={spec.icon} size={20} /><span class="title">{t(spec.title)}</span></p>
  <p class="impact">{impact}</p>
  {#if buttonLabel}
    <span class="action"><Button kind="secondary" onclick={onaction}>{buttonLabel}</Button></span>
  {:else if kind === 'needs-model-inspector'}
    <p class="note">{t('results.nextStep.copyHint')}</p>
  {:else if reason}
    <p class="note">{t('results.nextStep.reason', { reason })}</p>
  {/if}
</div>

<style>
  .next-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    width: 100%;
    min-width: 0;
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  p {
    margin: 0;
  }
  .eyebrow {
    font: var(--type-label);
    color: var(--text-tertiary);
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    color: var(--text-primary);
  }
  .title {
    font: var(--type-title-sub);
  }
  .impact {
    font: var(--type-body);
    color: var(--text-secondary);
  }
  .action {
    display: flex;
  }
  .note {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
