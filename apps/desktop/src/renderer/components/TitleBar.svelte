<script lang="ts">
  // Title bar (Figma 102:1666, C-01; D-DES3-05, D-54): unified with the window title bar, 52 high plus a 1 px
  // border/subtle at the bottom, bg/canvas. Both 80 px top corners hold no control: macOS draws the window
  // buttons in one of them (controls: where the main process says they are, from the system language) and
  // nothing is drawn for them here. Toolbar from the start side (gap 16): breadcrumb ending in the page title
  // (title/sub; crumbs are 28 high, the chevron follows the language) · drag space · primary action · search ·
  // inspector toggle (panel-left in Arabic, panel-right in English, D-DES3-09). The bar is a window drag
  // region; its controls are not.
  import type { Snippet } from 'svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { WindowControls } from '../lib/shell.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';

  interface Crumb {
    label: string;
    onclick?: () => void;
  }
  interface Props {
    /** Where macOS draws the window buttons (D-54). This component only reserves the corner. */
    controls: WindowControls;
    /** The page title, last in the breadcrumb. */
    title: string;
    /** The crumbs before the title, from the start (e.g. Projects › Texts library). */
    breadcrumb?: readonly Crumb[];
    /** The page's primary action (ink button). */
    primary?: { label: string; onclick?: () => void; disabled?: boolean };
    /** The search field (C-18 Search field, 200 wide). */
    search?: Snippet;
    inspectorOpen?: boolean;
    /** The id of the inspector the toggle shows and hides (aria-controls). */
    inspectorId?: string;
    oninspectortoggle?: () => void;
  }
  let { controls, title, breadcrumb = [], primary, search, inspectorOpen = true, inspectorId, oninspectortoggle }: Props = $props();
  const { t, dir } = useLocale();
  const chevron = $derived(dir === 'rtl' ? 'chevron-left' : 'chevron-right');
</script>

<header class="title-bar" data-controls={controls}>
  <div class="corner" data-corner="start"></div>
  <div class="toolbar">
    <nav class="breadcrumb" aria-label={t('shell.titleBar.breadcrumb')}>
      {#each breadcrumb as crumb, i (i)}
        <button type="button" class="crumb" onclick={() => crumb.onclick?.()}>{crumb.label}</button>
        <span class="chevron"><Icon name={chevron} size={16} /></span>
      {/each}
      <span class="crumb title" aria-current="page">{title}</span>
    </nav>
    <div class="drag"></div>
    <div class="actions">
      {#if primary}
        <Button kind="primary" disabled={primary.disabled} onclick={() => primary.onclick?.()}>{primary.label}</Button>
      {/if}
      {#if search}{@render search()}{/if}
      <IconButton
        icon={dir === 'rtl' ? 'panel-left' : 'panel-right'}
        label={t('controls.inspectorToggle')}
        aria-pressed={inspectorOpen}
        aria-controls={inspectorId}
        onclick={() => oninspectortoggle?.()}
      />
    </div>
  </div>
  <div class="corner" data-corner="end"></div>
</header>

<style>
  .title-bar {
    display: flex;
    align-items: stretch;
    inline-size: 100%;
    height: 53px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-canvas);
    -webkit-app-region: drag;
    user-select: none;
  }
  .corner {
    flex: none;
    width: 80px;
  }
  .toolbar {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-16);
    min-width: 0;
  }
  .breadcrumb,
  .actions {
    display: flex;
    flex: none;
    align-items: center;
  }
  .breadcrumb {
    gap: var(--space-4);
    min-width: 0;
  }
  .actions {
    gap: var(--space-8);
  }
  .drag {
    flex: 1;
    min-width: 0;
    align-self: stretch;
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    height: 28px;
    min-width: 28px;
    padding: 0 var(--space-4);
    white-space: nowrap;
  }
  button.crumb {
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-secondary);
    font: var(--type-body);
    cursor: default;
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  button.crumb:hover {
    background: var(--bg-sunken);
  }
  button.crumb:active {
    background: var(--border-subtle);
  }
  .title {
    color: var(--text-primary);
    font: var(--type-title-sub);
  }
  .chevron {
    display: inline-flex;
    color: var(--text-tertiary);
  }
  .breadcrumb button,
  .actions {
    -webkit-app-region: no-drag;
  }
</style>
