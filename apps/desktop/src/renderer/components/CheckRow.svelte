<script lang="ts">
  // Check row (Figma 104:4196, C-06; plan 9.6, 13.6): a list row that fills its container (720 in Figma),
  // radius/control, padding 0 8. The line: padding 6 0, gap 12, at least 40 high; from the start side the select
  // checkbox (28), the status (Cycle indicator sm while queued or running, Result badge sm once final), the name
  // (body) with the check id (mono, text/tertiary), then the cost tag, «N مبدئي», the duration (numeric/live)
  // and the quiet buttons «ألغِ» (running only) and «السجل» (once the check ran: not when queued, skipped, not applicable, missing or unavailable). A running row adds a second line:
  // the step and count, the process activity dot and "last activity 3 s ago" (body/small, text/secondary), and
  // may add the silence note «لا خرج منذ 2:10، والمعالج نشط»: information, never a warning. Expanded (running)
  // shows the log tail (mono, left to right, bg/sunken) and the provisional findings under the name column.
  // Hover = bg/sunken; selected (the checkbox) = selection fill plus a 2 px border/strong bar on the inline-start
  // edge (D-DES1-03); the row itself takes keyboard focus (Space selects, Enter opens it in the inspector).
  import type { LogLine } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import { checkRan, isCycle, type CheckRowStatus } from '../lib/results.ts';
  import type { BadgeResult } from '../lib/status.ts';
  import type { Cost } from '../lib/tags.ts';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import CostTag from './CostTag.svelte';
  import CycleIndicator from './CycleIndicator.svelte';
  import LogLineText from './LogLineText.svelte';
  import LtrText from './LtrText.svelte';
  import ResultBadge from './ResultBadge.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    status: CheckRowStatus;
    /** The check's name in the UI language. */
    name: string;
    /** The check id (mono), e.g. "beh.unit". */
    id: string;
    cost?: Cost;
    /** Running: the current step in the UI language, e.g. «يشغّل vitest», with its count. */
    step?: string;
    stepDone?: number;
    stepTotal?: number;
    /** Running: seconds since the last output or file activity. */
    lastActivitySeconds?: number;
    /** Running: the check's process is using the processor (the activity dot). */
    processorActive?: boolean;
    /** Running with no output for a while: the silence note, with this duration (e.g. "2:10"). */
    silentFor?: string;
    /** Provisional findings so far («2 مبدئي»). */
    provisionalCount?: number;
    /** Elapsed or final duration, already formatted (e.g. "1:42"); shown only when the check ran. */
    duration?: string;
    /** Whether the check ran its command (duration and «السجل»). Defaults from the status (lib/results.ts checkRan):
     *  queued and the not-run results (skipped, not applicable, missing, unavailable…) did not. */
    ran?: boolean;
    /** The checkbox: adds the check to the selection. */
    selected?: boolean;
    /** Running only: shows the log tail and the provisional findings. */
    expanded?: boolean;
    /** The last lines of the log (redactions and bidi controls drawn as in Log viewer). */
    logTail?: readonly LogLine[];
    provisionalFindings?: readonly string[];
    onselectchange?: (selected: boolean) => void;
    /** Enter on the row: show it in the inspector. */
    onopen?: () => void;
    oncancel?: () => void;
    onlog?: () => void;
  }
  let {
    status,
    name,
    id,
    cost = 'local',
    step,
    stepDone,
    stepTotal,
    lastActivitySeconds,
    processorActive = true,
    silentFor,
    provisionalCount = 0,
    duration,
    ran,
    selected = $bindable(false),
    expanded = false,
    logTail = [],
    provisionalFindings = [],
    onselectchange,
    onopen,
    oncancel,
    onlog,
  }: Props = $props();
  const { t } = useLocale();

  const cycle = $derived(isCycle(status) ? status : undefined);
  const running = $derived(status === 'running' || status === 'cancelling');
  const started = $derived(ran ?? checkRan(status));
  const stepText = $derived(
    step === undefined
      ? undefined
      : stepDone !== undefined && stepTotal !== undefined
        ? t('results.checkRow.step', { step, done: stepDone, total: stepTotal })
        : step,
  );

  function toggle(next: boolean) {
    selected = next;
    onselectchange?.(next);
  }
  function keydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === ' ') {
      e.preventDefault();
      toggle(!selected);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onopen?.();
    }
  }
</script>

<!-- The row is a focusable group (Figma State=focus); its controls stay separate tab stops. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="check-row" class:selected class:expanded={expanded && running} role="group" aria-label={name} tabindex="0" data-status={status} onkeydown={keydown}>
  <div class="line">
    <Checkbox checked={selected} label={t('results.checkRow.select', { name })} showLabel={false} onchange={toggle} />
    {#if cycle}
      <CycleIndicator {cycle} size="sm" />
    {:else}
      <ResultBadge result={status as BadgeResult} size="sm" />
    {/if}
    <div class="name-col">
      <span class="title">
        <span class="name">{name}</span>
        <span class="id"><LtrText text={id} mono /></span>
      </span>
      {#if running && (stepText || lastActivitySeconds !== undefined)}
        <span class="sub">
          {#if stepText}<span>{stepText}</span>{/if}
          {#if processorActive}<span class="cpu-dot" role="img" aria-label={t('results.checkRow.processorActive')}></span>{/if}
          {#if lastActivitySeconds !== undefined}<span>{t('results.checkRow.lastActivity', { seconds: lastActivitySeconds })}</span>{/if}
        </span>
      {/if}
      {#if running && silentFor}
        <span class="sub">{t('results.checkRow.silence', { duration: silentFor })}</span>
      {/if}
    </div>
    <CostTag {cost} />
    {#if provisionalCount > 0}<Tag kind="provisional">{t('results.checkRow.provisionalCount', { count: provisionalCount })}</Tag>{/if}
    {#if duration && started}<span class="duration" dir="ltr">{duration}</span>{/if}
    {#if started}
      <span class="actions">
        {#if status === 'running'}<Button kind="quiet" onclick={oncancel}>{t('ui.action.cancel')}</Button>{/if}
        <Button kind="quiet" onclick={onlog}>{t('controls.tab.log')}</Button>
      </span>
    {/if}
  </div>

  {#if expanded && running}
    <div class="more">
      {#if logTail.length}
        <p class="label">{t('results.checkRow.logTail')}</p>
        <div class="log-tail" dir="ltr">
          {#each logTail as line (line.number)}
            <span class="log-line" class:muted={line.muted}><LogLineText segments={line.segments} /></span>
          {/each}
        </div>
      {/if}
      {#if provisionalFindings.length}
        <p class="label">{t('results.checkRow.provisionalFindings')}</p>
        {#each provisionalFindings as finding, i (i)}
          <p class="finding"><Tag kind="provisional">{t('ui.marker.provisional')}</Tag><span>{finding}</span></p>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .check-row {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    padding: 0 var(--space-8);
    border-radius: var(--radius-control);
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .check-row:hover {
    background: var(--bg-sunken);
  }
  .check-row.selected {
    background: var(--selection);
  }
  .check-row.selected::before {
    content: '';
    position: absolute;
    inset-block: 6px;
    inset-inline-start: 0;
    width: 2px;
    background: var(--border-strong);
  }
  .check-row.selected.expanded::before {
    block-size: 44px;
    inset-block-end: auto;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    min-height: 40px;
    padding: 6px 0;
  }
  .name-col {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-width: 0;
  }
  .title {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    min-width: 0;
  }
  .name {
    font: var(--type-body);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .id {
    flex: none;
    color: var(--text-tertiary);
    white-space: nowrap;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    font: var(--type-body-small);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .cpu-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-secondary);
  }
  .duration {
    flex: none;
    font: var(--type-numeric-live);
    color: var(--text-secondary);
    unicode-bidi: isolate;
  }
  .actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
  }
  .more {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    padding-block-end: var(--space-12);
    padding-inline-start: 76px;
  }
  p {
    margin: 0;
  }
  .label {
    font: var(--type-label);
    color: var(--text-secondary);
  }
  .log-tail {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .log-line {
    display: flex;
    align-items: center;
    height: 20px;
    overflow: hidden;
  }
  .log-line.muted {
    color: var(--text-secondary);
  }
  .finding {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    height: 20px;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
</style>
