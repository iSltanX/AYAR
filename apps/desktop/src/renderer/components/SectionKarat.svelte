<script lang="ts">
  // Section karat (Figma 71:627, DES-2 6.5): the exception to "never a number without a verdict": a small dial,
  // the karat in title/section, "of 24", the "Partial" tag and the section scope ("Scope: 4 criteria"), gap 8,
  // 28 high. No verdict word.
  import { useLocale } from '../lib/locale.ts';
  import KaratDial from './KaratDial.svelte';
  import Tag from './Tag.svelte';

  interface Props {
    /** The section karat 0..24. */
    value: number;
    /** The number of required criteria in the section. */
    criteria: number;
    /** Shows the "Partial" tag (always, in the approved design). */
    partial?: boolean;
  }
  let { value, criteria, partial = true }: Props = $props();
  const { t } = useLocale();
</script>

<span class="section-karat">
  <KaratDial {value} size="sm" alone={false} />
  <span class="karat">{value}</span>
  <span class="of">{t('status.karat.outOf', { total: 24 })}</span>
  {#if partial}<Tag>{t('ui.marker.partial')}</Tag>{/if}
  <span class="scope">{t('status.karat.sectionScope', { count: criteria })}</span>
</span>

<style>
  .section-karat {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    flex: none;
    height: 28px;
    white-space: nowrap;
  }
  .karat {
    font: var(--type-title-section);
    color: var(--text-primary);
  }
  .of,
  .scope {
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
