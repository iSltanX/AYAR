<script lang="ts">
  // Sheet (Figma C-19 114:8568, the shared box of every Sheet/* set; D-DES3-03): 560 wide by default (720 for
  // scoring details, 448 for the cancel confirmation), padding 24 inside a 1 px border/subtle edge, gap 16,
  // radius/sheet, bg/elevated, shadow/overlay. Title in title/section, then the body, then the footer: buttons at
  // the inline end, in reading order (secondary first, primary last), so the primary is the rightmost in English
  // and the leftmost in Arabic, as Figma's RTL and LTR variants show.
  //
  // In the app a sheet is a modal attached to the window: a native <dialog> opened with showModal() while `open`
  // is true, and closed by setting `open` back to false (the caller owns `open`). The browser traps the focus,
  // makes the rest of the page inert and gives the focus back to the opener on close; on opening, the focus goes
  // to the element marked `data-initial-focus` (the safe button). `inline` renders the same box in place, not
  // modal (the gallery), as a labelled group.
  //
  // Contract with the caller and with the sheets built on this box:
  // - Escape fires `cancel`, which is prevented and reported through `oncancel`. Chromium makes a second Escape
  //   without user activation non-cancelable, so the dialog may also close natively: that `close` is reported
  //   through `oncancel` too. If `open` is still true after the caller had its turn, the dialog is shown again,
  //   so it is never closed while `open` is true. A close the sheet asked for itself is never taken for a native
  //   one, even when its event arrives after the sheet was opened again (BLK-WAVE4-01).
  // - The body and footer are mounted only while `open` is true, so their own DOM state is fresh on every
  //   opening. The working state a sheet keeps in its own props (a selection, a decision, a note, a name…) is
  //   reset by that sheet to its defaults each time `open` goes from false to true, and whenever the data it was
  //   derived from changes (lib/sheets.ts `sheetResetKey`). bind: from the caller keeps working: the caller sees
  //   the reset value. A value a caller wants preset must be set after opening, or passed while inline.
  import { tick, type Snippet } from 'svelte';
  import type { SheetWidth } from '../lib/sheets.ts';

  interface Props {
    title: string;
    /** default 560, wide 720 (scoring details), narrow 448 (cancel confirmation). */
    width?: SheetWidth;
    open?: boolean;
    inline?: boolean;
    /** Escape or a native close (modal), or the caller's own cancel button. The caller sets `open` to false. */
    oncancel?: () => void;
    children: Snippet;
    /** The buttons, in reading order: secondary first, primary last. */
    footer: Snippet;
  }
  let { title, width = 'default', open = false, inline = false, oncancel, children, footer }: Props = $props();
  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();

  function show(d: HTMLDialogElement) {
    d.showModal();
    d.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
  }

  // The `close` event of a <dialog> is dispatched as a separate task after close() returns. A close we asked for
  // (open went false) is counted here, so its late event is never taken for a native close: without this, a
  // sheet reopened before that event arrived (close, then open again at once) was closed again by it.
  let requestedCloses = 0;

  $effect(() => {
    const d = dialog;
    if (!d) return;
    if (open && !d.open) show(d);
    else if (!open && d.open) {
      requestedCloses++;
      d.close();
    }
  });

  function cancel(e: Event) {
    e.preventDefault();
    oncancel?.();
  }

  /** A close we did not ask for (a non-cancelable Escape): report it, then keep the dialog in step with `open`. */
  async function closed() {
    if (requestedCloses > 0) {
      requestedCloses--;
      return;
    }
    // Already shown again (or never meant to be open): nothing closed that the caller does not know about.
    if (!open || dialog?.open) return;
    oncancel?.();
    await tick();
    if (open && dialog && !dialog.open) show(dialog);
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
  <dialog bind:this={dialog} class="sheet {width}" aria-labelledby="{uid}-title" oncancel={cancel} onclose={closed}>
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
