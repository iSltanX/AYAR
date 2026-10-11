<script lang="ts">
  // Resource meter (Figma 139:10352, C-30, DES-4 screen 6; D-DES4-03; 13.3 «مؤشر موارد صغير»): two groups, the
  // processor and the memory — label (body/small, text/secondary), value (numeric/live, Latin digits) and a 40×12
  // sparkline stroked in ink (text/primary). No status colour. The sparkline is an SVG polyline from the recent
  // samples (an attribute, never a style).
  import { formatNumber } from '@ayar/i18n';
  import { useLocale } from '../lib/locale.ts';

  interface Props {
    /** The processor use of the running checks, in percent. */
    cpuPercent: number;
    /** Their resident memory, in bytes. */
    memoryBytes: number;
    /** Recent samples, oldest first (for the sparklines). */
    cpuHistory?: readonly number[];
    memoryHistory?: readonly number[];
  }
  let { cpuPercent, memoryBytes, cpuHistory = [], memoryHistory = [] }: Props = $props();
  const { t, lang } = useLocale();

  function points(values: readonly number[]): string {
    if (values.length < 2) return '0,11 40,11';
    const max = Math.max(...values, 1);
    const step = 40 / (values.length - 1);
    return values.map((v, i) => `${(i * step).toFixed(1)},${(11 - (Math.max(0, v) / max) * 10).toFixed(1)}`).join(' ');
  }
  const memory = $derived(
    memoryBytes >= 1e9
      ? `${formatNumber(memoryBytes / 1e9, lang, { maximumFractionDigits: 1 })} GB`
      : `${formatNumber(Math.round(memoryBytes / 1e6), lang)} MB`,
  );
</script>

<div class="meter">
  <span class="group">
    <span class="label">{t('controls.resource.cpu')}</span>
    <span class="value">{formatNumber(Math.round(cpuPercent), lang)}%</span>
    <svg class="spark" width="40" height="12" viewBox="0 0 40 12" aria-hidden="true" focusable="false"><polyline points={points(cpuHistory)} /></svg>
  </span>
  <span class="group">
    <span class="label">{t('controls.resource.memory')}</span>
    <span class="value" dir="ltr">{memory}</span>
    <svg class="spark" width="40" height="12" viewBox="0 0 40 12" aria-hidden="true" focusable="false"><polyline points={points(memoryHistory)} /></svg>
  </span>
</div>

<style>
  .meter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-12);
  }
  .group {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
  }
  .label {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .value {
    font: var(--type-numeric-live);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }
  .spark {
    flex: none;
    overflow: visible;
  }
  polyline {
    fill: none;
    stroke: var(--text-primary);
    stroke-width: 1;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
</style>
