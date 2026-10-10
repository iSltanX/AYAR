<script lang="ts">
  // Finding row (Figma 103:4015, C-07; plan 9.7): a dense row, 32 high, radius/control, padding 0 8, gap 8, on the
  // findings grid shared with the table header: --finding-columns (28 · 64 · 112 · title · 196 · 80 · 64), defined
  // ONCE below on .findings-grid, the class of the Table root (or of any role=grid around a standalone row). From
  // the start side: the select checkbox (28 hit target), Severity, the evidence Tag (proven / suspected /
  // suggestion / model claim), «مبدئي» when provisional, the title (body, truncates; Latin runs inside an Arabic
  // title are isolated so truncation hides a run whole), the location (mono, text/secondary, isolated left to
  // right and cut in the middle), the check id (mono, text/tertiary) and the across-runs Tag. Hover = bg/sunken;
  // selected = selection fill plus the 2 px border/strong bar on the inline-start edge (D-DES1-03), and
  // aria-selected. Selecting a finding adds it to the scope of the one «انسخ للنموذج» button; it never adds a copy
  // button. A grid row: Space selects, Enter opens; inside Table the row set is one tab stop (roving tabindex, the
  // checkbox is reached with the forward arrow), standalone the row and its checkbox are both tab stops.
  // In a narrow title cell (under 200 px) «مبدئي» becomes its striped chip alone (name kept for screen readers and
  // in the tooltip), so the title keeps a readable width.
  import type { Attachment } from 'svelte/attachments';
  import { useLocale } from '../lib/locale.ts';
  import { textRuns, type Finding } from '../lib/results.ts';
  import { CROSS_RUN_TAGS, PROOF_TAGS, tagIcon } from '../lib/tags.ts';
  import Checkbox from './Checkbox.svelte';
  import PathText from './PathText.svelte';
  import Severity from './Severity.svelte';
  import Tag from './Tag.svelte';

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
      <span class="prov-chip" title={provisional}><Tag kind="provisional"><span class="visually-hidden">{provisional}</span></Tag></span>
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
  /* The one definition of the findings grid (Figma Table 112:8213), read by the header row and every row. */
  :global(.findings-grid) {
    --finding-columns: 28px 64px 112px minmax(0, 1fr) 196px 80px 64px;
  }
  .finding-row {
    position: relative;
    display: grid;
    grid-template-columns: var(--finding-columns);
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
