<script lang="ts">
  // Sheet (Figma C-19 114:8568, the shared box of every Sheet/* set; D-DES3-03): 560 wide by default (720 for
  // scoring details, 448 for the cancel confirmation), padding 24 inside a 1 px border/subtle edge, gap 16,
  // radius/sheet, bg/elevated, shadow/overlay. Title in title/section, then the body, then the footer: buttons at
  // the inline end, in reading order (secondary first, primary last), so the primary is the rightmost in English
  // and the leftmost in Arabic, as Figma's RTL and LTR variants show.
  //
  // In the app a sheet is a modal attached to the window: a native <dialog> opened with showModal() while `open`
  // is true. The browser traps the focus and makes the rest of the page inert; Escape calls `oncancel` (the
  // caller closes the sheet by setting `open` back to false); on opening, the focus goes to the element marked
  // `data-initial-focus` (the safe button). `inline` renders the same box in place, not modal (the gallery), as a labelled group.
  import type { Snippet } from 'svelte';
  import type { SheetWidth } from '../lib/sheets.ts';

  interface Props {
    title: string;
    /** default 560, wide 720 (scoring details), narrow 448 (cancel confirmation). */
    width?: SheetWidth;
    open?: boolean;
    inline?: boolean;
    /** Escape (modal), or the caller's own cancel button. */
    oncancel?: () => void;
    children: Snippet;
    /** The buttons, in reading order: secondary first, primary last. */
    footer: Snippet;
  }
  let { title, width = 'default', open = false, inline = false, oncancel, children, footer }: Props = $props();
  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    const d = dialog;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  });

  function cancel(e: Event) {
    e.preventDefault();
    oncancel?.();
  }
</script>

{#snippet box()}
  <h2 class="title" id="{uid}-title">{title}</h2>
  <div class="body">{@render children()}</div>
  <div class="footer">{@render footer()}</div>
{/snippet}

{#if inline}
  <div class="sheet {width}" role="group" aria-labelledby="{uid}-title">{@render box()}</div>
{:else}
  <dialog bind:this={dialog} class="sheet {width}" aria-labelledby="{uid}-title" oncancel={cancel}>
    {#if open}{@render box()}{/if}
  </dialog>
{/if}

<style>
  .sheet {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-16);
    inline-size: 560px;
    margin: 0;
    padding: var(--space-24);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sheet);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-overlay);
    color: var(--text-primary);
    text-align: start;
  }
  .wide {
    inline-size: 720px;
  }
  .narrow {
    inline-size: 448px;
  }
  dialog.sheet {
    margin: auto;
    max-block-size: calc(100vh - 2 * var(--space-24));
    overflow: auto;
  }
  dialog.sheet:not([open]) {
    display: none;
  }
  dialog.sheet::backdrop {
    background: var(--overlay);
  }
  .title {
    margin: 0;
    font: var(--type-title-section);
    color: var(--text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-16);
    min-inline-size: 0;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-8);
  }
</style>
