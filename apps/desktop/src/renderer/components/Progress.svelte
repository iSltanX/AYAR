<script lang="ts">
  // Progress (Figma 106:4127, C-10; plan 13.6): fills its container (320 in Figma). count: «7 of 18 complete»
  // (numeric/live) over a 4 px track; percent: a label (body/small, text/secondary) and the percentage, only
  // with a known total; indeterminate: the step (body) and the duration, a note that the total is unknown, no
  // bar and no animation. The track is border/subtle and decorative; the fill is ink (text/primary, never blue
  // or green) and grows from the inline start, so it mirrors with the language. Its width is set through the
  // CSSOM (a custom property), never an inline style (15.2). The optional estimate is a neutral Tag (71:194), shown only
  // when a previous run is on record.
  import { formatNumber } from '@ayar/i18n';
  import { useLocale } from '../lib/locale.ts';
  import { clock, isoDuration } from '../lib/shell.ts';
  import Tag from './Tag.svelte';

  type Props = { estimate?: string } & (
    | { kind: 'count'; done: number; total: number }
    | { kind: 'percent'; /** 0 to 1 */ value: number; label: string }
    | { kind: 'indeterminate'; step: string; /** seconds */ elapsed: number }
  );
  let props: Props = $props();
  const { t, lang } = useLocale();
  const uid = $props.id();

  const fraction = $derived.by(() => {
    if (props.kind === 'count') return props.total > 0 ? Math.min(1, Math.max(0, props.done / props.total)) : 0;
    if (props.kind === 'percent') return Math.min(1, Math.max(0, props.value));
    return 0;
  });
  const percentText = $derived(formatNumber(fraction, lang, { style: 'percent', maximumFractionDigits: 0 }));

  // Re-runs whenever fraction changes (attachments are effects).
  const fill = (el: HTMLElement) => {
    el.style.setProperty('--progress', String(fraction));
  };
</script>

{#if props.kind === 'indeterminate'}
  <div class="progress indeterminate" role="progressbar" aria-labelledby="{uid}-label" aria-valuetext={props.step}>
    <div class="header">
      <span class="step" id="{uid}-label">{props.step}</span>
      <span class="spacer"></span>
      {#if props.estimate}<Tag>{props.estimate}</Tag>{/if}
      <time class="numeric secondary" datetime={isoDuration(props.elapsed)}>{clock(props.elapsed)}</time>
    </div>
    <p class="note">{t('shell.progress.noTotal')}</p>
  </div>
{:else}
  {@const label = props.kind === 'count' ? t('shell.progress.complete', { done: props.done, total: props.total }) : props.label}
  <div
    class="progress {props.kind}"
    role="progressbar"
    aria-labelledby="{uid}-label"
    aria-valuemin={0}
    aria-valuemax={props.kind === 'count' ? props.total : 100}
    aria-valuenow={props.kind === 'count' ? props.done : Math.round(fraction * 100)}
    aria-valuetext={props.kind === 'count' ? label : `${label} · ${percentText}`}
  >
    <div class="header">
      <span class={props.kind === 'count' ? 'numeric' : 'label'} id="{uid}-label">{label}</span>
      <span class="spacer"></span>
      {#if props.estimate}<Tag>{props.estimate}</Tag>{/if}
      {#if props.kind === 'percent'}<span class="numeric" aria-hidden="true">{percentText}</span>{/if}
    </div>
    <div class="track" aria-hidden="true"><div class="fill" {@attach fill}></div></div>
  </div>
{/if}

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    inline-size: 100%;
    min-width: 0;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    min-height: 20px;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
    min-width: 0;
  }
  .numeric {
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }
  .secondary {
    color: var(--text-secondary);
  }
  .label {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .step {
    font: var(--type-body);
    color: var(--text-primary);
  }
  .note {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-tertiary);
  }
  .track {
    display: flex;
    height: 4px;
    border-radius: 2px;
    background: var(--border-subtle);
    overflow: hidden;
  }
  .fill {
    width: calc(var(--progress, 0) * 100%);
    height: 4px;
    border-radius: 2px;
    background: var(--text-primary);
    transition: width var(--motion-base) var(--motion-easing);
  }
</style>
