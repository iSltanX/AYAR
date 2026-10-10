<script lang="ts">
  // The content of one log line (C-13, C-24), shared by Log viewer and the log tail of Check row: text (search
  // matches marked with the selection fill), each invisible bidi control drawn as a visible mark ⟦U+202E⟧
  // (bg/sunken + border/strong) and never obeyed, and a redacted secret as the neutral tag "Redacted: <kind>":
  // the secret itself never reaches the UI. Pieces sit 12 apart; the caller sets the line's font, colour and
  // direction (always left to right).
  import { codePointLabel, logPieces, type LogSegment } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import Tag from './Tag.svelte';

  interface Props {
    segments: readonly LogSegment[];
    /** The search text; matches are highlighted. */
    query?: string;
  }
  let { segments, query = '' }: Props = $props();
  const { t, dir } = useLocale();
</script>

<span class="content">
  {#each logPieces(segments, query) as piece, i (i)}
    {#if piece.kind === 'text'}
      <span class="text">{#each piece.parts as part, j (j)}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</span>
    {:else if piece.kind === 'control'}
      <span class="control" title={piece.name}>⟦{codePointLabel(piece.codePoint)}⟧</span>
    {:else}
      <span class="redaction" {dir}><Tag kind="neutral">{t('results.log.redacted', { what: piece.what })}</Tag></span>
    {/if}
  {/each}
</span>

<style>
  .content {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }
  .text {
    white-space: pre;
  }
  mark {
    background: var(--selection);
    color: inherit;
  }
  .control {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding-inline: var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    background: var(--bg-sunken);
    color: var(--text-primary);
    white-space: pre;
  }
  .redaction {
    display: inline-flex;
    flex: none;
  }
</style>
