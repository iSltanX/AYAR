<script lang="ts">
  // Capture tile (Figma 109:6740, C-15; plan 9.15): a gallery tile 220 wide, bg/surface, border/subtle
  // (hover border/strong), radius/card; the image 138 high (never mirrored) over a bottom border; then, padding 8
  // and gap 8, the key tags (state, size, theme, language; the full key is the tooltip) and the small result
  // badge. A state marked sensitive has no image: an image-off icon and the line saying why, on bg/sunken.
  import type { EvidenceImage } from '../lib/evidence.ts';
  import { useLocale } from '../lib/locale.ts';
  import type { BadgeResult } from '../lib/status.ts';
  import AutoText from './AutoText.svelte';
  import Icon from './Icon.svelte';
  import ResultBadge from './ResultBadge.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    /** The screenshot; absent for a sensitive state. */
    image?: EvidenceImage;
    /** The state is marked sensitive: no screenshot is taken. */
    sensitive?: boolean;
    /** The short key values shown as tags: state, size, theme, language. */
    tags: readonly string[];
    /** The full capture key, shown as the tooltip. */
    fullKey: string;
    result: BadgeResult;
    onclick?: () => void;
  }
  let { image, sensitive = false, tags, fullKey, result, onclick }: Props = $props();
  const { t } = useLocale();
</script>

<button type="button" class="tile" title={fullKey} {onclick}>
  {#if sensitive || !image}
    <span class="image sensitive">
      <span class="icon"><Icon name="image-off" size={16} /></span>
      <span class="note">{t('results.capture.sensitiveNote')}</span>
    </span>
  {:else}
    <span class="image"><img src={image.src} alt="" draggable="false" /></span>
  {/if}
  <span class="meta">
    <span class="tags">
      {#each tags as tag, i (i)}<Tag kind="neutral"><AutoText text={tag} /></Tag>{/each}
      {#if sensitive}<Tag kind="neutral">{t('results.capture.sensitive')}</Tag>{/if}
    </span>
    <ResultBadge {result} size="sm" />
  </span>
</button>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    flex: none;
    width: 220px;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    color: var(--text-primary);
    text-align: start;
    overflow: hidden;
    cursor: default;
    transition: border-color var(--motion-fast) var(--motion-easing);
  }
  .tile:hover {
    border-color: var(--border-strong);
  }
  .image {
    display: flex;
    flex: none;
    height: 138px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface);
  }
  .image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
  }
  .sensitive {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    padding: var(--space-16);
    border-bottom: 0;
    background: var(--bg-sunken);
    color: var(--text-secondary);
  }
  .icon {
    display: flex;
  }
  .note {
    font: var(--type-body-small);
    text-align: center;
  }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    padding: var(--space-8);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
</style>
