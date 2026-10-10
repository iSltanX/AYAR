<script lang="ts">
  // Finding row (Figma 103:4015, C-07; plan 9.7): a dense table row, 32 high, radius/control, padding 0 8, gap 8,
  // on the findings grid shared with the table header (lib/results.ts FINDING_GRID: 28 · 64 · 112 · title ·
  // 196 · 80 · 64). From the start side: the select checkbox (28 hit target), Severity, the evidence Tag
  // (proven / suspected / suggestion / model claim), «مبدئي» when provisional, the title (body, truncates), the
  // location (mono, text/secondary, isolated left to right and cut in the middle), the check id (mono,
  // text/tertiary) and the across-runs Tag. Hover = bg/sunken; selected = selection fill plus the 2 px
  // border/strong bar on the inline-start edge (D-DES1-03). Selecting a finding adds it to the scope of the one
  // «انسخ للنموذج» button; it never adds a copy button. A role=row: it lives inside Table (or a role=table).
  import { useLocale } from '../lib/locale.ts';
  import { findingGrid, type Finding } from '../lib/results.ts';
  import { CROSS_RUN_TAGS, PROOF_TAGS, tagIcon } from '../lib/tags.ts';
  import Checkbox from './Checkbox.svelte';
  import PathText from './PathText.svelte';
  import Severity from './Severity.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    finding: Finding;
    selected?: boolean;
    onselectchange?: (selected: boolean) => void;
    /** Enter on the row: show the finding in the inspector. */
    onopen?: () => void;
  }
  let { finding, selected = $bindable(false), onselectchange, onopen }: Props = $props();
  const { t, dir } = useLocale();
  const proof = $derived(PROOF_TAGS[finding.proof]);
  const crossRun = $derived(CROSS_RUN_TAGS[finding.crossRun]);

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

<div class="finding-row" class:selected role="row" tabindex="0" data-nav data-finding={finding.id} onkeydown={keydown} {@attach findingGrid}>
  <span class="cell" role="cell">
    <Checkbox checked={selected} label={t('results.findingRow.select', { title: finding.title })} showLabel={false} onchange={toggle} />
  </span>
  <span class="cell" role="cell"><Severity severity={finding.severity} /></span>
  <span class="cell" role="cell"><Tag kind={proof.kind} icon={'icon' in proof ? proof.icon : undefined}>{t(proof.key)}</Tag></span>
  <span class="cell title" role="cell">
    {#if finding.provisional}<Tag kind="provisional">{t('ui.marker.provisional')}</Tag>{/if}
    <span class="title-text">{finding.title}</span>
  </span>
  <span class="cell location" role="cell"><PathText path={finding.location.path} line={finding.location.line} /></span>
  <span class="cell check" role="cell"><span class="check-id" dir="ltr" title={finding.check}>{finding.check}</span></span>
  <span class="cell" role="cell"><Tag kind={crossRun.kind} icon={tagIcon(crossRun, dir)}>{t(crossRun.key)}</Tag></span>
</div>

<style>
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
  .title-text {
    min-width: 0;
    font: var(--type-body);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
