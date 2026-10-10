<script lang="ts">
  // Gallery-only picture of a native menu model (lib/menus.ts; D-DES3-07: the app's menus are native macOS menus
  // built by the main process). Drawn like Figma: a panel (bg/elevated, border/subtle, radius/control,
  // shadow/overlay, padding 4) of Menu items 28 high (padding 12, gap 16, radius 4; label body text/primary,
  // shortcut body/small text/tertiary at the end, left to right; highlighted = selection fill; disabled label
  // text/tertiary), Menu separators 9 high (1 px border/subtle, padding 4/12) and group headers 28 high (label
  // style, text/tertiary, padding 4/12). Presentational: role=menu with aria-disabled items, not focusable.
  import { useLocale } from '../lib/locale.ts';
  import { acceleratorGlyphs, menuLabel, type MenuEntry } from '../lib/menus.ts';

  interface Props {
    entries: readonly MenuEntry[];
    /** The menu's accessible name. */
    label: string;
    /** Panel width in px (228 for context menus, 300 for the Run menu). */
    width?: number;
    /** The id of the item drawn highlighted. */
    highlighted?: string;
    /** Items only, without the panel (the Menu item specimens, 220 wide). */
    bare?: boolean;
  }
  let { entries, label, width = 228, highlighted, bare = false }: Props = $props();
  const { t } = useLocale();
  const uid = $props.id();

  // Items after a header belong to its group (role=group labelled by the header).
  type Block = { header?: { id: string; text: string }; entries: MenuEntry[] };
  const blocks = $derived.by(() => {
    const out: Block[] = [{ entries: [] }];
    entries.forEach((e, i) => {
      if (e.kind === 'header') out.push({ header: { id: `${uid}-h${i}`, text: menuLabel(e, t) }, entries: [] });
      else out[out.length - 1]!.entries.push(e);
    });
    return out;
  });
</script>

{#snippet entry(e: MenuEntry)}
  {#if e.kind === 'separator'}
    <div class="separator" role="separator"><span class="line"></span></div>
  {:else if e.kind === 'item'}
    <div class="item" class:highlighted={e.id === highlighted} class:disabled={!e.enabled} role="menuitem" aria-disabled={!e.enabled || undefined}>
      <span class="label">{menuLabel(e, t)}</span>
      {#if e.accelerator}<span class="shortcut" dir="ltr">{acceleratorGlyphs(e.accelerator)}</span>{/if}
    </div>
  {/if}
{/snippet}

<div
  class="menu"
  class:bare
  role="menu"
  aria-label={label}
  {@attach (el: HTMLElement) => {
    el.style.setProperty('--menu-width', `${bare ? 220 : width}px`);
  }}
>
  {#each blocks as b, i (i)}
    {#if b.header}
      <div class="group" role="group" aria-labelledby={b.header.id}>
        <div class="header" id={b.header.id}>{b.header.text}</div>
        {#each b.entries as e, k (k)}{@render entry(e)}{/each}
      </div>
    {:else}
      {#each b.entries as e, k (k)}{@render entry(e)}{/each}
    {/if}
  {/each}
</div>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    inline-size: var(--menu-width);
    padding: var(--space-4);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-overlay);
  }
  .menu.bare {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .group {
    display: flex;
    flex-direction: column;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    block-size: 28px;
    padding: 0 var(--space-12);
    border-radius: 4px;
    cursor: default;
  }
  .item.highlighted {
    background: var(--selection);
  }
  .label {
    flex: 1;
    min-inline-size: 0;
    font: var(--type-body);
    color: var(--text-primary);
    white-space: nowrap;
  }
  .disabled .label {
    color: var(--text-tertiary);
  }
  .shortcut {
    flex: none;
    font: var(--type-body-small);
    color: var(--text-tertiary);
    unicode-bidi: isolate;
  }
  .separator {
    padding: var(--space-4) var(--space-12);
  }
  .line {
    display: block;
    block-size: 1px;
    background: var(--border-subtle);
  }
  .header {
    display: flex;
    align-items: center;
    block-size: 28px;
    padding: var(--space-4) var(--space-12);
    font: var(--type-label);
    color: var(--text-tertiary);
  }
</style>
