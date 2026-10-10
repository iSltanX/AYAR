<script lang="ts">
  // Severity (Figma 71:275, DES-2 6.4; D-DES2-02, D-DES2-06): five bars 2 wide and 4 to 12 high with a 1 px gap,
  // rising from the inline start (so they mirror in Arabic), filled with ink (text/primary) up to the level and
  // border/strong after it; then the level in body/small. Severity is not a status: ink only.
  import { useLocale } from '../lib/locale.ts';
  import { SEVERITY_LEVEL, type Severity } from '../lib/tags.ts';

  interface Props {
    severity: Severity;
  }
  let { severity }: Props = $props();
  const { t } = useLocale();
  const level = $derived(SEVERITY_LEVEL[severity]);
  const bars = [1, 2, 3, 4, 5] as const;
</script>

<span class="severity" data-severity={severity}>
  <span class="bars" aria-hidden="true">
    {#each bars as bar (bar)}<span class="bar b{bar}" class:on={bar <= level}></span>{/each}
  </span>
  <span class="label">{t(`ui.severity.${severity}`)}</span>
</span>

<style>
  .severity {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    height: 20px;
    color: var(--text-primary);
    font: var(--type-body-small);
    white-space: nowrap;
  }
  .bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 1px;
    flex: none;
    height: 12px;
  }
  .bar {
    width: 2px;
    border-radius: 0.5px;
    background: var(--border-strong);
  }
  .bar.on {
    background: var(--text-primary);
  }
  .b1 {
    height: 4px;
  }
  .b2 {
    height: 6px;
  }
  .b3 {
    height: 8px;
  }
  .b4 {
    height: 10px;
  }
  .b5 {
    height: 12px;
  }
</style>
