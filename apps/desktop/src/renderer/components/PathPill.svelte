<script lang="ts">
  // Path pill (Figma 108:5579, C-11; D-DES3-04): 28 high, full radius, bg/sunken (hover border/subtle), mono
  // text/primary, padding 12 at the start of the text, gap 4. The whole pill reads left to right in both
  // languages: the path is isolated LTR and each Arabic segment sits in its own <bdi>, so the folders keep their
  // left-to-right order. A long path is cut in the MIDDLE: the folders give way, the file name and line number
  // stay (Figma can only cut at the end; DES-3 handoff). The copy icon button (28×28) keeps its slot at the
  // right end, hidden until hover or focus, and copies the path text only through `oncopy`.
  import { useLocale } from '../lib/locale.ts';
  import { splitPath } from '../lib/evidence.ts';
  import IconButton from './IconButton.svelte';

  interface Props {
    path: string;
    /** A line number, shown and copied as ":<line>" after the file name. */
    line?: number;
    /** Receives the path text when the copy button is used (the caller writes the clipboard). */
    oncopy?: (text: string) => void;
  }
  let { path, line, oncopy }: Props = $props();
  const { t } = useLocale();
  const text = $derived(line === undefined ? path : `${path}:${line}`);
  const parts = $derived(splitPath(path, line));
</script>

<span class="pill" dir="ltr" title={text}>
  <span class="path">
    {#if parts.head.length}
      <span class="head">
        {#each parts.head as piece, i (i)}{#if piece.rtl}<bdi>{piece.text}</bdi>{:else}{piece.text}{/if}{/each}
      </span>
    {/if}
    <span class="tail">
      {#each parts.tail as piece, i (i)}{#if piece.rtl}<bdi>{piece.text}</bdi>{:else}{piece.text}{/if}{/each}
    </span>
  </span>
  <span class="copy"><IconButton icon="copy" label={t('results.path.copy')} onclick={() => oncopy?.(text)} /></span>
</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    max-width: 100%;
    min-width: 0;
    height: 28px;
    padding-left: var(--space-12); /* physical: the pill is left to right in both languages */
    border-radius: 14px;
    background: var(--bg-sunken);
    color: var(--text-primary);
    transition: background-color var(--motion-fast) var(--motion-easing);
  }
  .pill:hover {
    background: var(--border-subtle);
  }
  .path {
    display: flex;
    min-width: 0;
    font: var(--type-mono);
    white-space: pre;
    unicode-bidi: isolate;
  }
  .head {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tail {
    flex: none;
  }
  .copy {
    display: inline-flex;
    flex: none;
    opacity: 0;
    transition: opacity var(--motion-fast) var(--motion-easing);
  }
  .pill:hover .copy,
  .pill:focus-within .copy {
    opacity: 1;
  }
</style>
