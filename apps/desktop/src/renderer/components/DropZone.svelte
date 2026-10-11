<script lang="ts">
  // Drop zone (Figma 139:10348, C-30, DES-4 screen 1 empty; D-DES4-03): 480×120, bg/surface, a dashed border/strong
  // edge 6/4, radius/card, padding 24, gap 8: Lucide folder-open 24 and «أو اسحب المجلد هنا». Active (a folder is
  // dragged over the window): the selection fill and a text/primary edge. It shows where to drop; the drop itself
  // is read by the preload, which hands the path to the main process alone (C-01): the page never sees it.
  // The dashes are an SVG rect with stroke-dasharray, since a CSS dashed border cannot set 6/4 (no style attribute).
  import { useLocale } from '../lib/locale.ts';
  import Icon from './Icon.svelte';

  interface Props {
    /** A folder is being dragged over the window. */
    active?: boolean;
  }
  let { active = false }: Props = $props();
  const { t } = useLocale();
</script>

<div class="drop-zone" class:active data-state={active ? 'active' : 'default'}>
  <svg class="edge" aria-hidden="true" focusable="false"><rect class="dash" x="0.5" y="0.5" rx="9.5" ry="9.5" /></svg>
  <!-- Figma: the Lucide/16 instance in a 24 box (the glyph keeps its 16, as in the approved frame). -->
  <span class="icon"><Icon name="folder-open" size={16} /></span>
  <p class="label">{active ? t('controls.dropZone.active') : t('controls.dropZone.label')}</p>
</div>

<style>
  .drop-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    inline-size: 480px;
    max-inline-size: 100%;
    block-size: 120px;
    padding: var(--space-24);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    color: var(--text-secondary);
  }
  .drop-zone.active {
    background: var(--selection);
    color: var(--text-primary);
  }
  .edge {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .dash {
    width: calc(100% - 1px);
    height: calc(100% - 1px);
    fill: none;
    stroke: var(--border-strong);
    stroke-width: 1;
    stroke-dasharray: 6 4;
  }
  .active .dash {
    stroke: var(--text-primary);
  }
  .icon {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    inline-size: 24px;
    block-size: 24px;
    color: var(--text-secondary);
  }
  .active .icon {
    color: var(--text-primary);
  }
  .label {
    margin: 0;
    font: var(--type-body);
    text-align: center;
  }
</style>
