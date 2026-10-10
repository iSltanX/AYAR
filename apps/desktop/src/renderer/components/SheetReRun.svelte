<script lang="ts">
  // Sheet/Re-run (Figma 114:9290, Variant failed | incomplete; prompt §9.19). «أعد الفاشل»: «أخفق» checked,
  // «متذبذب», «تعذّر», «انتهت المهلة» optional. «أعد غير المكتمل»: «ناقص», «تعذّر», «انتهت المهلة», «أُلغي»,
  // «انقطع», «تُخطّي» all checked. Each option is a 28 px row: the checkbox at the start, its check count at the
  // end (numeric/live, text/secondary); a status with no checks is disabled and unchecked. Then the dependency
  // line (body/small) and the primary «أعد (N)», N = the selected checks plus the ones the re-run needs first.
  // The focus opens on «ألغِ».
  import { untrack } from 'svelte';
  import { useLocale } from '../lib/locale.ts';
  import {
    RERUN_PRESETS,
    rerunDefaults,
    rerunTotal,
    sheetResetKey,
    sheetResetter,
    type RerunStatus,
    type RerunVariant,
    type SheetMode,
  } from '../lib/sheets.ts';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import Sheet from './Sheet.svelte';

  interface Props extends SheetMode {
    variant: RerunVariant;
    /** Checks per status in the last run. */
    counts: Partial<Record<RerunStatus, number>>;
    /** Names of the checks the re-run adds first (e.g. «البناء»), already localised. */
    dependencies?: readonly string[];
    /** The selected statuses: the variant's preset on every opening and whenever the variant or counts change. */
    selected?: RerunStatus[];
    onrerun?: (statuses: RerunStatus[]) => void;
  }
  let { variant, counts, dependencies = [], selected = $bindable(rerunDefaults(variant, counts)), onrerun, open, inline, oncancel }: Props = $props();
  const { t, lang } = useLocale();

  // Reset on every opening and when the variant or the counts change (Sheet.svelte contract).
  const shouldReset = sheetResetter();
  $effect.pre(() => {
    if (shouldReset(open, sheetResetKey(variant, counts))) untrack(() => (selected = rerunDefaults(variant, counts)));
  });
  /** Only statuses this variant offers and that have checks. */
  const current = $derived(RERUN_PRESETS[variant].map(([s]) => s).filter((s) => selected.includes(s) && (counts[s] ?? 0) > 0));

  const total = $derived(rerunTotal(current, counts, dependencies.length));
  const list = $derived(new Intl.ListFormat(lang, { type: 'conjunction' }).format(dependencies));

  function toggle(status: RerunStatus, on: boolean) {
    selected = on ? [...selected.filter((s) => s !== status), status] : selected.filter((s) => s !== status);
  }
</script>

<Sheet title={t(variant === 'failed' ? 'ui.action.rerunFailed' : 'ui.action.rerunIncomplete')} {open} {inline} {oncancel}>
  <ul class="options" aria-label={t('sheets.rerun.options')}>
    {#each RERUN_PRESETS[variant] as [status] (status)}
      {@const count = counts[status] ?? 0}
      <li class="option">
        <Checkbox
          checked={count > 0 && selected.includes(status)}
          disabled={count === 0}
          label={t(`status.result.${status}`)}
          onchange={(on: boolean) => toggle(status, on)}
        />
        <span class="count">{t('common.count.checks', { count })}</span>
      </li>
    {/each}
  </ul>
  {#if dependencies.length}
    <p class="dependencies">{t('sheets.rerun.dependencies', { count: dependencies.length, names: list })}</p>
  {/if}
  {#snippet footer()}
    <Button data-initial-focus onclick={oncancel}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" disabled={total === 0} onclick={() => onrerun?.([...current])}>{t('sheets.rerun.submit', { count: total })}</Button>
  {/snippet}
</Sheet>

<style>
  .options {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    min-block-size: 28px;
  }
  .count {
    font: var(--type-numeric-live);
    color: var(--text-secondary);
  }
  .dependencies {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
