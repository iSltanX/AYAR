<script lang="ts">
  // Model check need card (Figma 117:9922, C-27; plan 9.27): bg/surface, a 1 px border/subtle edge, radius/card,
  // padding 16, gap 12; 480 wide in Figma, it fills its container. The header: the template name (title/sub)
  // and its id (mono, text/tertiary), then the «بنموذجك» cost tag at the end. The reason from project facts
  // («اقتُرح لأن: …», body/small, text/secondary). Variant missing-input adds what is missing («ناقص: …», label
  // style, above a text field, gap 4). «ولّد التعليمات» (secondary, at the end) is disabled until the missing
  // input is filled. A need is not a result: never a pass or fail badge.
  import { useLocale } from '../lib/locale.ts';
  import Button from './Button.svelte';
  import CostTag from './CostTag.svelte';
  import LtrText from './LtrText.svelte';
  import TextField from './TextField.svelte';

  interface Props {
    /** The template's name in the UI language, e.g. «مراجعة المنطق». */
    template: string;
    /** The template id, e.g. "AI-LOGIC". */
    templateId: string;
    /** Why it is suggested, from project facts, e.g. «14 ملف منطق بلا اختبارات». */
    reason: string;
    /** Variant missing-input: what is missing (e.g. «السلوك المتوقع») and the field's placeholder. */
    missing?: { readonly what: string; readonly placeholder: string };
    /** The missing input's value. */
    value?: string;
    ongenerate?: (value: string) => void;
  }
  let { template, templateId, reason, missing, value = $bindable(''), ongenerate }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();
  const blocked = $derived(missing !== undefined && value.trim() === '');
</script>

<article class="need-card" data-variant={missing ? 'missing-input' : 'ready'} aria-labelledby="{uid}-name">
  <header class="header">
    <h3 class="name" id="{uid}-name">{template}</h3>
    <span class="id"><LtrText text={templateId} mono /></span>
    <span class="spacer"></span>
    <CostTag cost="model" />
  </header>
  <p class="reason">{t('results.modelNeed.reason', { reason })}</p>
  {#if missing}
    <div class="missing">
      <label class="missing-label" for="{uid}-input">{t('results.modelNeed.missing', { what: missing.what })}</label>
      <TextField id="{uid}-input" bind:value placeholder={missing.placeholder} width="fill" />
    </div>
  {/if}
  <footer class="footer">
    <Button kind="secondary" disabled={blocked} onclick={() => ongenerate?.(value)}>{t('ui.action.generateInstructions')}</Button>
  </footer>
</article>

<style>
  .need-card {
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
    gap: var(--space-8);
    height: 24px;
  }
  h3,
  p {
    margin: 0;
  }
  .name {
    font: var(--type-title-sub);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .id {
    color: var(--text-tertiary);
    white-space: nowrap;
  }
  .spacer {
    flex: 1 1 0;
  }
  .reason {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .missing {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .missing-label {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
