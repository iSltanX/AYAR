<script lang="ts">
  // Finding row (Figma 103:4015, C-07; plan 9.7): a dense row, 32 high, radius/control, padding 0 8, gap 8, on the
  // findings grid shared with the table header: --finding-columns (28 · 64 · 112 · title · 196 · 84 · 100, and 76 for the last column in Arabic), defined
  // ONCE below on .findings-grid, the class of the Table root (or of any role=grid around a standalone row). From
  // the start side: the select checkbox (28 hit target), Severity, the evidence Tag (proven / suspected /
  // suggestion / model claim), «مبدئي» when provisional, the title (body, truncates; Latin runs inside an Arabic
  // title are isolated so truncation hides a run whole), the location (mono, text/secondary, isolated left to
  // right and cut in the middle), the check id (mono, text/tertiary) and the across-runs Tag. Hover = bg/sunken;
  // selected = selection fill plus the 2 px border/strong bar on the inline-start edge (D-DES1-03), and
  // aria-selected. Selecting a finding adds it to the scope of the one «انسخ للنموذج» button; it never adds a copy
  // button. A grid row: Space selects, Enter opens; inside Table the row set is one tab stop (roving tabindex, the
  // checkbox is reached with the forward arrow), standalone the row and its checkbox are both tab stops.
  // In a narrow title cell (under 200 px) «مبدئي» becomes its striped chip alone, so the title keeps a readable
  // width. The chip stays explained for sighted users too (owner's condition on D-DEV10-11): it is focusable and
  // shows the Term tooltip (the word and its glossary meaning) on hover and on keyboard focus; Escape hides it.
  // The tooltip is a manual popover in the top layer, placed under the chip from script (CSSOM), so the row's
  // clipping cannot cut it. Standalone the chip is a tab stop; inside Table the arrow keys reach it after the
  // checkbox.
  import type { Attachment } from 'svelte/attachments';
  import { useLocale } from '../lib/locale.ts';
  import { textRuns, type Finding } from '../lib/results.ts';
  import { CROSS_RUN_TAGS, PROOF_TAGS, tagIcon } from '../lib/tags.ts';
  import Checkbox from './Checkbox.svelte';
  import PathText from './PathText.svelte';
  import Severity from './Severity.svelte';
  import Tag from './Tag.svelte';
  import TermTooltip from './TermTooltip.svelte';

  interface Props {
    finding: Finding;
    selected?: boolean;
    /** The row's tab stop: Table sets -1 on every row but the active one (roving tabindex). */
    tabindex?: 0 | -1;
    /** Inside Table the checkbox is not a tab stop of its own (the arrow keys reach it). */
    inGrid?: boolean;
    onselectchange?: (selected: boolean) => void;
    /** Enter on the row: show the finding in the inspector. */
    onopen?: () => void;
  }
  let { finding, selected = $bindable(false), tabindex = 0, inGrid = false, onselectchange, onopen }: Props = $props();
  const { t, dir } = useLocale();
  const proof = $derived(PROOF_TAGS[finding.proof]);
  const crossRun = $derived(CROSS_RUN_TAGS[finding.crossRun]);
  const runs = $derived(textRuns(finding.title));
  const provisional = $derived(t('ui.marker.provisional'));
  const uid = $props.id();
  let chip = $state<HTMLElement>();
  let tip = $state<HTMLElement>();
  let hovered = $state(false);
  let focused = $state(false);
  let dismissed = $state(false);
  const tipShown = $derived((hovered || focused) && !dismissed);

  // Show or hide the tooltip popover, placed under the chip at the inline start.
  $effect(() => {
    if (!tip || !chip) return;
    if (tipShown && chip.getClientRects().length > 0) {
      const r = chip.getBoundingClientRect();
      tip.style.setProperty('top', `${r.bottom + 4}px`);
      if (dir === 'rtl') {
        tip.style.setProperty('right', `${document.documentElement.clientWidth - r.right}px`);
        tip.style.removeProperty('left');
      } else {
        tip.style.setProperty('left', `${r.left}px`);
        tip.style.removeProperty('right');
      }
      if (!tip.matches(':popover-open')) tip.showPopover();
    } else if (tip.matches(':popover-open')) tip.hidePopover();
  });
  function chipKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && tipShown) {
      dismissed = true;
      e.stopPropagation();
    }
  }

  /** The Checkbox component has no tabindex prop: inside Table its input leaves the tab order. */
  const boxTabStop: Attachment<HTMLElement> = (el) => {
    const input = el.querySelector('input');
    if (input) input.tabIndex = inGrid ? -1 : 0;
  };

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

<div class="finding-row" class:selected role="row" aria-selected={selected} {tabindex} data-nav={finding.id} onkeydown={keydown}>
  <span class="cell" role="gridcell" {@attach boxTabStop}>
    <Checkbox checked={selected} label={t('results.findingRow.select', { title: finding.title })} showLabel={false} onchange={toggle} />
  </span>
  <span class="cell" role="gridcell"><Severity severity={finding.severity} /></span>
  <span class="cell" role="gridcell"><Tag kind={proof.kind} icon={'icon' in proof ? proof.icon : undefined}>{t(proof.key)}</Tag></span>
  <span class="cell title" role="gridcell">
    {#if finding.provisional}
      <span class="prov-full"><Tag kind="provisional">{provisional}</Tag></span>
      <button
        type="button"
        class="prov-chip"
        aria-label={provisional}
        aria-describedby="{uid}-tip"
        tabindex={inGrid ? -1 : 0}
        data-cell-focus
        bind:this={chip}
        onmouseenter={() => ((hovered = true), (dismissed = false))}
        onmouseleave={() => (hovered = false)}
        onfocus={() => ((focused = true), (dismissed = false))}
        onblur={() => (focused = false)}
        onclick={() => (dismissed = !dismissed)}
        onkeydown={chipKey}><Tag kind="provisional"><span class="chip-gap"></span></Tag></button
      >
      <div class="prov-tip" popover="manual" bind:this={tip}>
        <TermTooltip id="{uid}-tip" term={provisional} meaning={t('results.findingRow.provisionalMeaning')} />
      </div>
    {/if}
    <span class="title-text" title={finding.title}
      >{#each runs as run, i (i)}{#if run.ltr}<bdi class="run" dir="ltr">{run.text}</bdi>{:else}{run.text}{/if}{/each}</span
    >
  </span>
  <span class="cell location" role="gridcell"><PathText path={finding.location.path} line={finding.location.line} /></span>
  <span class="cell check" role="gridcell"><span class="check-id" dir="ltr" title={finding.check}>{finding.check}</span></span>
  <span class="cell" role="gridcell"><Tag kind={crossRun.kind} icon={tagIcon(crossRun, dir)}>{t(crossRun.key)}</Tag></span>
</div>

<style>
  /* The one definition of the findings grid (Figma Table 112:8213), read by the header row and every row.
     Figma's check (80) and across-runs (64) columns cut real content: an 11-character check id is 82.5 px in the
     monospace font, and the across-runs tags reach 69 px in Arabic and 100 px in English («Reappeared»). They
     are widened so nothing is cut (owner's condition on the approved deviations, D-DEV10-10); the title column
     gives the width back. */
  :global(.findings-grid) {
    --finding-columns: 28px 64px 112px minmax(0, 1fr) 196px 84px 100px;
  }
  :global(.findings-grid:dir(rtl)) {
    --finding-columns: 28px 64px 112px minmax(0, 1fr) 196px 84px 76px;
  }
  .finding-row {
    position: relative;
    display: grid;
    grid-template-columns: var(--finding-columns, 28px 64px 112px minmax(0, 1fr) 196px 84px 100px);
    column-gap: var(--space-8);
    align-items: center;
    width: 100%;
    height: 32px;
    padding: 0 var(--space-8);
    border-radius: var(--radius-control);
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .finding-row:hover {
    background: var(--bg-sunken);
  }
  .finding-row.selected {
    background: var(--selection);
  }
  .finding-row.selected::before {
    content: '';
    position: absolute;
    inset-block: 6px;
    inset-inline-start: 0;
    width: 2px;
    background: var(--border-strong);
  }
  .cell {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-8);
    min-width: 0;
    height: 32px;
    overflow: hidden;
  }
  .title {
    container-type: inline-size;
  }
  .prov-full,
  .prov-chip {
    display: inline-flex;
    flex: none;
  }
  .prov-chip {
    display: none;
    align-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    cursor: default;
  }
  /* A 28 × 28 hit target around the 16 × 18 chip (NFR-04), without moving the layout. */
  .prov-chip {
    position: relative;
  }
  .prov-chip::after {
    content: '';
    position: absolute;
    inset: -5px -6px;
  }
  .chip-gap {
    display: inline-block;
    inline-size: 0;
  }
  .prov-tip {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
  }
  @container (max-width: 199px) {
    .prov-full {
      display: none;
    }
    .prov-chip {
      display: inline-flex;
    }
  }
  .title-text {
    min-width: 0;
    font: var(--type-body);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .run {
    display: inline-block;
    unicode-bidi: isolate;
  }
  .location {
    color: var(--text-secondary);
  }
  .check-id {
    display: block;
    min-width: 0;
    max-width: 100%;
    font: var(--type-mono);
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    unicode-bidi: isolate;
  }
</style>
