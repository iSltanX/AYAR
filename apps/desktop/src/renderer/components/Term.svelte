<script lang="ts">
  // Term (Figma 113:8529, C-21): a glossary word in running text with a solid 1 px border/strong underline (not
  // dotted), padding 2 above and below; hover bg/sunken with radius 4. Hover or keyboard focus opens the Term
  // tooltip (113:8539) below it, at the start side; Escape closes it, a click or Enter toggles it, and the
  // pointer may move onto the tooltip (WCAG 1.4.13). A button, so it is focusable with real semantics, described
  // by the tooltip (aria-describedby). Shown at a term's first appearance on a page; the caller decides which.
  import type { Snippet } from 'svelte';
  import TermTooltip from './TermTooltip.svelte';

  interface Props {
    /** The tooltip heading, e.g. «مؤشر النقاء / العيار». */
    term: string;
    /** The meaning sentence (prompt §11). */
    meaning: string;
    /** Open from the start (for the gallery and tests). */
    open?: boolean;
    /** The word as it appears in the sentence. */
    children: Snippet;
  }
  let { term, meaning, open = $bindable(false), children }: Props = $props();
  const id = $props.id();
  let hovered = $state(false);
  let focused = $state(false);
  let dismissed = $state(false);
  const shown = $derived(open || ((hovered || focused) && !dismissed));

  function enter() {
    hovered = true;
    dismissed = false;
  }
  function onfocus() {
    focused = true;
    dismissed = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && shown) {
      dismissed = true;
      open = false;
      e.stopPropagation();
    }
  }
</script>

<svelte:window onkeydown={(e: KeyboardEvent) => hovered && onkeydown(e)} />

<span class="wrap" role="presentation" onmouseenter={enter} onmouseleave={() => (hovered = false)}>
  <button
    type="button"
    class="term"
    aria-describedby="{id}-tip"
    {onfocus}
    onblur={() => (focused = false)}
    onclick={() => (dismissed = !dismissed)}
    {onkeydown}><span class="word">{@render children()}</span></button
  >
  <span class="pop" hidden={!shown}><TermTooltip id="{id}-tip" {term} {meaning} /></span>
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  .term {
    display: inline-flex;
    flex-direction: column;
    margin: 0;
    padding: 2px 0;
    border: 0;
    background: transparent;
    border-radius: 4px;
    color: var(--text-primary);
    font: var(--type-body);
    cursor: help;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .term:hover {
    background: var(--bg-sunken);
  }
  .word {
    border-bottom: 1px solid var(--border-strong);
  }
  .pop {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 0;
    z-index: 20;
    padding-block-start: var(--space-4);
  }
  .pop[hidden] {
    display: none;
  }
</style>
