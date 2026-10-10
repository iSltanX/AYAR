<script lang="ts">
  // Log viewer (Figma 108:6245, C-13; plan 9.13, C-24): bg/surface, border/subtle, radius/card. The toolbar
  // (padding 8 12, gap 12, a bottom border) follows the language: the search field fills, then the line count,
  // then "follow last line". The log itself is always left to right, mono, 20 px lines with right-aligned line
  // numbers (32 wide, text/tertiary, gap 12). A redacted secret is a neutral tag "Redacted: <kind>" (never the
  // verdict word), each invisible bidi control is drawn as a visible mark ⟦U+202E⟧ (bg/sunken + border/strong)
  // and never obeyed, and a truncation row closes a log cut at its size limit. Lines render with a keyed each by
  // line number; the caller passes the window of lines to show (`totalLines` counts the whole log), so a
  // virtualised list can feed it later without an API change.
  import { formatNumber } from '@ayar/i18n';
  import { codePointLabel, logPieces, type LogLine } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import Checkbox from './Checkbox.svelte';
  import Icon from './Icon.svelte';
  import SearchField from './SearchField.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    lines: readonly LogLine[];
    /** Lines in the whole log (defaults to the lines passed). */
    totalLines?: number;
    /** Keep the last line in view as lines arrive. */
    follow?: boolean;
    /** The search text; matches are highlighted. */
    query?: string;
    /** The log was cut at this size, in megabytes; the full file is in the evidence. */
    truncatedAtMb?: number;
    onfollowchange?: (follow: boolean) => void;
    onquerychange?: (query: string) => void;
  }
  let {
    lines,
    totalLines,
    follow = $bindable(true),
    query = $bindable(''),
    truncatedAtMb,
    onfollowchange,
    onquerychange,
  }: Props = $props();
  const { t, lang, dir } = useLocale();
  let body: HTMLElement | undefined = $state();

  $effect(() => {
    // Re-run when lines arrive or follow is switched on.
    void lines.length;
    if (follow && body) body.scrollTop = body.scrollHeight;
  });
</script>

<div class="log-viewer">
  <div class="toolbar">
    <span class="search">
      <SearchField bind:value={query} width="fill" oninput={() => onquerychange?.(query)} onclear={() => onquerychange?.(query)} />
    </span>
    <span class="count">{t('results.log.lineCount', { count: totalLines ?? lines.length })}</span>
    <span class="follow">
      <Checkbox
        checked={follow}
        label={t('results.log.follow')}
        onchange={(on: boolean) => {
          follow = on;
          onfollowchange?.(on);
        }}
      />
    </span>
  </div>
  <!-- A scrolling log must be reachable from the keyboard (axe scrollable-region-focusable, FR-53). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="lines" dir="ltr" role="log" aria-label={t('results.log.label')} tabindex="0" bind:this={body}>
    {#each lines as line (line.number)}
      <div class="line" class:muted={line.muted}>
        <span class="number">{line.number}</span>
        <span class="content">
          {#each logPieces(line.segments, query) as piece, i (i)}
            {#if piece.kind === 'text'}
              <span class="text">{#each piece.parts as part, j (j)}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</span>
            {:else if piece.kind === 'control'}
              <span class="control" title={piece.name}>⟦{codePointLabel(piece.codePoint)}⟧</span>
            {:else}
              <span class="redaction" {dir}><Tag kind="neutral">{t('results.log.redacted', { what: piece.what })}</Tag></span>
            {/if}
          {/each}
        </span>
      </div>
    {/each}
  </div>
  {#if truncatedAtMb !== undefined}
    <div class="truncated">
      <Icon name="scissors" size={16} />
      <span>{t('results.log.truncated', { size: formatNumber(truncatedAtMb, lang) })}</span>
    </div>
  {/if}
</div>

<style>
  .log-viewer {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-8) var(--space-12);
    border-bottom: 1px solid var(--border-subtle);
  }
  .search {
    position: relative;
    display: flex;
    flex: 1 1 320px;
    min-width: 0;
  }
  .count {
    flex: none;
    font: var(--type-body-small);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .follow {
    display: inline-flex;
    flex: none;
    white-space: nowrap;
  }
  .lines {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--space-8) var(--space-12);
    overflow: auto;
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    height: 20px;
    flex: none;
  }
  .muted {
    color: var(--text-secondary);
  }
  .number {
    flex: none;
    width: 32px;
    text-align: right;
    color: var(--text-tertiary);
  }
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
  .truncated {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    height: 28px;
    padding: var(--space-4) var(--space-12);
    border-end-start-radius: calc(var(--radius-card) - 1px);
    border-end-end-radius: calc(var(--radius-card) - 1px);
    background: var(--bg-sunken);
    color: var(--text-secondary);
    font: var(--type-body-small);
  }
</style>
