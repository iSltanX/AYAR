<script lang="ts">
  // A location as plain mono text (the "location" field of Finding row 103:4015 and Model claim row 117:10396):
  // no pill, the colour of its row (text/secondary). Like Path pill (D-DES3-04) the whole path reads left to
  // right in both languages, each Arabic segment sits in its own <bdi>, and a long path is cut in the MIDDLE so
  // the file name and line stay visible (Figma can only cut at the end; DES-3 handoff). The box sits at the
  // start side of its cell.
  import { splitPath } from '../lib/evidence.ts';

  interface Props {
    path: string;
    line?: number;
  }
  let { path, line }: Props = $props();
  const text = $derived(line === undefined ? path : `${path}:${line}`);
  const parts = $derived(splitPath(path, line));
</script>

<span class="path-text" title={text}>
  <span class="path" dir="ltr">
    {#if parts.head.length}
      <span class="head">
        {#each parts.head as piece, i (i)}{#if piece.rtl}<bdi>{piece.text}</bdi>{:else}{piece.text}{/if}{/each}
      </span>
    {/if}
    <span class="tail">
      {#each parts.tail as piece, i (i)}{#if piece.rtl}<bdi>{piece.text}</bdi>{:else}{piece.text}{/if}{/each}
    </span>
  </span>
</span>

<style>
  .path-text {
    display: flex;
    min-width: 0;
    max-width: 100%;
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
</style>
