<script lang="ts">
  // Sheet/Human review (Figma 116:9241, Variant check | model-claim), opened by «راجع وقرّر» and «سجّل مراجعة».
  // check: the decision as Radio buttons (D-DES3-08: accept → «اجتاز (بمراجعة)», reject → «أخفق (بمراجعة)», false
  // alarm for one finding → excluded and counted in «المستبعد بمراجعة»), the review scope (Path pill + quiet
  // «غيّر النطاق…»), the note (Text field), and the fixed line «تنتهي هذه المراجعة إذا تغيرت ملفات نطاقها».
  // model-claim: the claim (bg/sunken box, radius/card, padding 12, gap 8: the purple model-claim Tag, its id in
  // mono text/tertiary, the claim in body) and only two decisions: «حوّل إلى بطاقة» · «ليس مشكلة». Footer:
  // «ألغِ» · «سجّل المراجعة». The focus opens on «ألغِ».
  import { useLocale } from '../lib/locale.ts';
  import { REVIEW_DECISIONS, type ModelClaim, type ReviewDecision, type ReviewRecord, type ReviewVariant, type SheetMode } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import PathPill from './PathPill.svelte';
  import RadioGroup from './RadioGroup.svelte';
  import Sheet from './Sheet.svelte';
  import SheetField from './SheetField.svelte';
  import Tag from './Tag.svelte';
  import TextField from './TextField.svelte';

  interface Props extends SheetMode {
    variant: ReviewVariant;
    /** check: what is reviewed, e.g. «الإتاحة البشرية». */
    subject?: string;
    /** check: the files or pages the review covers. */
    scope?: string;
    /** model-claim: the claim under review. */
    claim?: ModelClaim;
    decision?: ReviewDecision;
    note?: string;
    onrecord?: (record: ReviewRecord) => void;
    onchangescope?: () => void;
    oncopy?: (text: string) => void;
  }
  let {
    variant,
    subject = '',
    scope,
    claim,
    decision = $bindable(REVIEW_DECISIONS[variant][0][0]),
    note = $bindable(''),
    onrecord,
    onchangescope,
    oncopy,
    open,
    inline,
    oncancel,
  }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();

  const options = $derived(REVIEW_DECISIONS[variant].map(([value, key]) => ({ value, label: t(key) })));
  const title = $derived(variant === 'check' ? t('sheets.review.titleCheck', { subject }) : t('sheets.review.titleClaim'));
</script>

<Sheet {title} {open} {inline} {oncancel}>
  {#if variant === 'model-claim' && claim}
    <div class="claim">
      <div class="claim-head">
        <Tag kind="model-claim">{t('glossary.modelClaim')}</Tag>
        <code class="id" dir="ltr">{claim.id}</code>
      </div>
      <p class="claim-text">{claim.text}</p>
    </div>
  {/if}
  <SheetField label={t('sheets.review.decision')}>
    <RadioGroup bind:value={decision} {options} label={t('sheets.review.decision')} />
  </SheetField>
  {#if variant === 'check' && scope !== undefined}
    <SheetField label={t('ui.scope.review')}>
      <div class="scope">
        <PathPill path={scope} {oncopy} />
        <Button kind="quiet" onclick={onchangescope}>{t('sheets.review.changeScope')}</Button>
      </div>
    </SheetField>
  {/if}
  <SheetField label={t('sheets.review.note')} for="{uid}-note">
    <TextField id="{uid}-note" bind:value={note} width="fill" placeholder={t('sheets.review.notePlaceholder')} />
  </SheetField>
  {#if variant === 'check'}
    <p class="expiry">{t('sheets.review.expiry')}</p>
  {/if}
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" onclick={() => onrecord?.({ decision, note: note.trim() })}>{t('sheets.review.submit')}</Button>
  {/snippet}
</Sheet>

<style>
  .claim {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    padding: var(--space-12);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
  }
  .claim-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .id {
    font: var(--type-mono);
    color: var(--text-tertiary);
    unicode-bidi: isolate;
  }
  .claim-text {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .scope {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .expiry {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
