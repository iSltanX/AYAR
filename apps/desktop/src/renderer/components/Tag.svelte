<script lang="ts">
  // Tag (Figma 71:194, DES-2 6.4; D-DES2-03, -04, -05, -10, -13): a rectangle 18 high, radius 4, padding 8, gap 4,
  // body/small in text/secondary on bg/sunken; never a border. An optional 12 px Lucide icon (stroke 2) or a
  // run-cycle symbol sits at the start, in the text colour. "model-claim" is purple through the status class
  // (with message-square by default); "provisional" is striped on bg/surface exactly as D-DES2-13.
  import type { Snippet } from 'svelte';
  import type { LucideName } from '../design/icons.generated.ts';
  import type { Cycle } from '../lib/status.ts';
  import type { TagKind } from '../lib/tags.ts';
  import Icon from './Icon.svelte';
  import StatusSymbol from './StatusSymbol.svelte';

  interface Props {
    kind?: TagKind;
    /** A 12 px Lucide icon at the start (neutral-icon and model-claim). */
    icon?: LucideName;
    /** A run-cycle symbol in place of the icon ("running" in a setup action, D-DES2-04). */
    symbol?: Cycle;
    /** The tag text. */
    children: Snippet;
  }
  let { kind = 'neutral', icon, symbol, children }: Props = $props();
  const glyph = $derived(icon ?? (kind === 'model-claim' ? 'message-square' : undefined));
  const statusClass = $derived(kind === 'model-claim' ? `status-${kind}` : '');
</script>

<span class="tag {kind} {statusClass}" data-kind={kind}>
  {#if symbol}
    <StatusSymbol {symbol} size={12} />
  {:else if glyph}
    <span class="icon"><Icon name={glyph} size={12} /></span>
  {/if}
  <span class="label">{@render children()}</span>
</span>

<style>
  .tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    height: 18px;
    padding-inline: var(--space-8);
    border-radius: 4px; /* D-DES2-05: fixed in the component */
    background: var(--bg-sunken);
    color: var(--text-secondary);
    font: var(--type-body-small);
    white-space: nowrap;
  }
  .icon {
    display: inline-flex;
    flex: none;
  }
  .model-claim {
    background: var(--status-bg);
    color: var(--status-fg);
  }
  .model-claim .icon {
    color: var(--status-icon);
  }
  .provisional {
    background:
      repeating-linear-gradient(135deg, var(--border-subtle) 0 2px, transparent 2px 4px),
      var(--bg-surface);
  }
</style>
