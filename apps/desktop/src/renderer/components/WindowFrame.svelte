<script lang="ts">
  // Window frame (Figma 102:2570, C-01; plan 8 and 13.2, D-DES3-05, D-54): the layout skeleton of every screen.
  // bg/canvas, window radius 10. The title bar on top (52 + a 1 px divider; both 80 px top corners reserved
  // for the window buttons macOS draws, `controls`), then the body: the sidebar (240 + divider) on the inline
  // start and the main column. The main column holds the run bar while a run is active (under the title bar,
  // spanning the content and the inspector), then the content on bg/canvas and the inspector (380) on the
  // inline end while it is open. So in Arabic the sidebar is on the right and the inspector on the left; in
  // English the whole layout mirrors, by the document direction alone. Default 1360×860, minimum 1100×720 (the
  // main process sets the window's own limits). Screens fill the slots (DEV-11).
  import type { Snippet } from 'svelte';
  import type { WindowControls } from '../lib/shell.ts';
  import TitleBar from './TitleBar.svelte';

  interface Crumb {
    label: string;
    onclick?: () => void;
  }
  interface Props {
    /** Where macOS draws the window buttons (D-54). */
    controls: WindowControls;
    /** The page title, last in the title bar's breadcrumb. */
    title: string;
    breadcrumb?: readonly Crumb[];
    primary?: { label: string; onclick?: () => void; disabled?: boolean };
    /** The title bar's search field. */
    search?: Snippet;
    /** The inspector is shown (Figma property Inspector); the title bar's toggle calls oninspectortoggle. */
    inspectorOpen?: boolean;
    oninspectortoggle?: (open: boolean) => void;
    /** The sidebar (C-02). */
    sidebar: Snippet;
    /** The run bar (C-03), only while a run is active (Figma property Run bar). */
    runbar?: Snippet;
    /** The page content. */
    content: Snippet;
    /** The inspector (C-16), drawn when inspectorOpen. */
    inspector?: Snippet;
  }
  let {
    controls,
    title,
    breadcrumb,
    primary,
    search,
    inspectorOpen = $bindable(true),
    oninspectortoggle,
    sidebar,
    runbar,
    content,
    inspector,
  }: Props = $props();

  function toggle() {
    inspectorOpen = !inspectorOpen;
    oninspectortoggle?.(inspectorOpen);
  }
</script>

<div class="window" data-controls={controls}>
  <TitleBar {controls} {title} {breadcrumb} {primary} {search} {inspectorOpen} oninspectortoggle={toggle} />
  <div class="body">
    <div class="sidebar">{@render sidebar()}</div>
    <div class="main">
      {#if runbar}<div class="run-bar">{@render runbar()}</div>{/if}
      <div class="content-row">
        <main class="content">{@render content()}</main>
        {#if inspectorOpen && inspector}<div class="inspector">{@render inspector()}</div>{/if}
      </div>
    </div>
  </div>
</div>

<style>
  .window {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 1100px;
    min-block-size: 720px;
    border-radius: var(--radius-card);
    background: var(--bg-canvas);
    overflow: hidden;
  }
  .body {
    display: flex;
    flex: 1;
    min-block-size: 0;
  }
  .sidebar {
    display: flex;
    flex: none;
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }
  .run-bar {
    display: flex;
    flex: none;
  }
  .content-row {
    display: flex;
    flex: 1;
    min-block-size: 0;
  }
  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
    background: var(--bg-canvas);
    overflow: auto;
  }
  .inspector {
    display: flex;
    flex: none;
    flex-direction: column;
    inline-size: 380px;
    background: var(--bg-surface);
    overflow: auto;
  }
</style>
